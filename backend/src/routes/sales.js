import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireBusiness, requireOwner } from "../middleware/auth.js";

const router = Router();
const dayKeyTucuman = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Tucuman", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
const formatSale = (sale) => ({
  ...sale,
  total: Number(sale.total), cashAmount: Number(sale.cashAmount), transferAmount: Number(sale.transferAmount),
  items: (sale.items || []).map((item) => ({
    ...item, unitPrice: Number(item.unitPrice), itemCostPrice: Number(item.itemCostPrice), lineTotal: Number(item.lineTotal),
  })),
});

function paymentData(method, total, cashAmount, transferAmount) {
  if (method === "CASH") return { paymentMethod: "CASH", cashAmount: total, transferAmount: 0 };
  if (method === "TRANSFER") return { paymentMethod: "TRANSFER", cashAmount: 0, transferAmount: total };
  if (method === "MIXED") {
    const cash = Number(cashAmount);
    const transfer = Number(transferAmount);
    if (!Number.isFinite(cash) || !Number.isFinite(transfer) || cash < 0 || transfer < 0 || Math.abs(cash + transfer - total) > 0.01) {
      throw new Error("El pago mixto no coincide con el total");
    }
    return { paymentMethod: "MIXED", cashAmount: cash, transferAmount: transfer };
  }
  throw new Error("Método de pago inválido");
}

router.get("/", authenticate, requireBusiness, async (req, res) => {
  try {
    const where = { businessId: req.businessId };
    if (req.query.dayKey) where.dayKey = req.query.dayKey;
    if (req.user.role !== "OWNER") where.sellerId = req.user.id;
    else if (req.query.sellerId && req.query.sellerId !== "all") where.sellerId = req.query.sellerId;
    const sales = await prisma.sale.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } });
    res.json(sales.map(formatSale));
  } catch (error) {
    res.status(500).json({ error: "Error al obtener ventas" });
  }
});

router.post("/quick", authenticate, requireBusiness, async (req, res) => {
  try {
    const code = String(req.body.code || "").trim().toLowerCase();
    if (!code) return res.status(400).json({ error: "Código requerido" });
    const item = await prisma.businessProduct.findFirst({
      where: { businessId: req.businessId, active: true, product: { code, active: true } }, include: { product: true },
    });
    if (!item) return res.status(404).json({ error: `Código no encontrado: ${code}` });
    const total = Number(item.price);
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({ data: {
        businessId: req.businessId, sellerId: req.user.id, sellerName: req.user.name,
        dayKey: dayKeyTucuman(), total, paymentMethod: "CASH", cashAmount: total, transferAmount: 0,
        items: { create: { businessProductId: item.id, name: item.product.name, qty: 1,
          unitPrice: total, itemCostPrice: Number(item.costPrice), barcode: item.product.barcode,
          code: item.product.code, lineTotal: total } },
      }, include: { items: true } });
      await tx.businessProduct.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
      return created;
    });
    res.status(201).json({ ...formatSale(sale), productName: item.product.name });
  } catch (error) {
    console.error("Quick sale error:", error);
    res.status(400).json({ error: error.message || "Error en venta rápida" });
  }
});

router.post("/", authenticate, requireBusiness, async (req, res) => {
  try {
    const rawItems = req.body.items;
    if (!Array.isArray(rawItems) || !rawItems.length) return res.status(400).json({ error: "El carrito está vacío" });
    const requested = new Map();
    for (const raw of rawItems) {
      const id = String(raw.id || "");
      const qty = Number(raw.qty);
      if (!id || !Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "Items inválidos" });
      requested.set(id, (requested.get(id) || 0) + qty);
    }

    const sale = await prisma.$transaction(async (tx) => {
      const inventory = await tx.businessProduct.findMany({
        where: { id: { in: [...requested.keys()] }, businessId: req.businessId, active: true, product: { active: true } },
        include: { product: true },
      });
      if (inventory.length !== requested.size) throw new Error("Algunos productos no pertenecen al negocio");
      const lines = inventory.map((item) => {
        const qty = requested.get(item.id);
        const unitPrice = Number(item.price);
        return { businessProductId: item.id, name: item.product.name, qty, unitPrice,
          itemCostPrice: Number(item.costPrice), barcode: item.product.barcode, code: item.product.code,
          lineTotal: unitPrice * qty };
      });
      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const payment = paymentData(req.body.paymentMethod || "CASH", total, req.body.cashAmount, req.body.transferAmount);
      const created = await tx.sale.create({ data: {
        businessId: req.businessId, sellerId: req.user.id, sellerName: req.user.name,
        dayKey: dayKeyTucuman(), total, ...payment, items: { create: lines },
      }, include: { items: true } });
      for (const line of lines) {
        await tx.businessProduct.update({ where: { id: line.businessProductId }, data: { stock: { decrement: line.qty } } });
      }
      return created;
    });
    res.status(201).json(formatSale(sale));
  } catch (error) {
    console.error("Create sale error:", error);
    res.status(400).json({ error: error.message || "Error al registrar venta" });
  }
});

router.get("/:id", authenticate, requireBusiness, async (req, res) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { items: true } });
    if (!sale) return res.status(404).json({ error: "Venta no encontrada" });
    if (req.user.role !== "OWNER" && sale.sellerId !== req.user.id) return res.status(403).json({ error: "No autorizado" });
    res.json(formatSale(sale));
  } catch (error) {
    res.status(500).json({ error: "Error al obtener venta" });
  }
});

router.patch("/:id", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!sale) return res.status(404).json({ error: "Venta no encontrada" });
    if (sale.status === "VOIDED") return res.status(400).json({ error: "No se puede editar una venta anulada" });
    const payment = paymentData(req.body.paymentMethod, Number(sale.total), req.body.cashAmount, req.body.transferAmount);
    const updated = await prisma.sale.update({ where: { id: sale.id }, data: payment, include: { items: true } });
    res.json(formatSale(updated));
  } catch (error) {
    res.status(400).json({ error: error.message || "Error al actualizar venta" });
  }
});

router.post("/:id/void", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { items: true } });
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.status === "VOIDED") throw new Error("La venta ya está anulada");
      for (const item of sale.items) {
        await tx.businessProduct.update({ where: { id: item.businessProductId }, data: { stock: { increment: item.qty } } });
      }
      return tx.sale.update({ where: { id: sale.id }, data: {
        status: "VOIDED", voidReason: String(req.body.reason || ""), voidedAt: new Date(),
      }, include: { items: true } });
    });
    res.json({ message: "Venta anulada", sale: formatSale(updated) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Error al anular venta" });
  }
});

router.delete("/:id", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!sale) return res.status(404).json({ error: "Venta no encontrada" });
    if (sale.status !== "VOIDED") return res.status(400).json({ error: "Solo se pueden borrar ventas anuladas" });
    await prisma.sale.delete({ where: { id: sale.id } });
    res.json({ message: "Venta borrada" });
  } catch (error) {
    res.status(500).json({ error: "Error al borrar venta" });
  }
});

export default router;
