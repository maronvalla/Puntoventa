import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireBusiness, requireOwner } from "../middleware/auth.js";

const router = Router();
const format = (item) => ({
  id: item.id,
  productId: item.productId,
  name: item.product.name,
  code: item.product.code,
  barcode: item.product.barcode,
  catalogActive: item.product.active,
  price: Number(item.price),
  costPrice: Number(item.costPrice),
  stock: item.stock,
  active: item.active,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

router.get("/", authenticate, requireBusiness, async (req, res) => {
  try {
    const items = await prisma.businessProduct.findMany({
      where: { businessId: req.businessId, active: true, product: { active: true } },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(items.map(format));
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

router.get("/:id", authenticate, requireBusiness, async (req, res) => {
  try {
    const item = await prisma.businessProduct.findFirst({
      where: { id: req.params.id, businessId: req.businessId },
      include: { product: true },
    });
    if (!item) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(format(item));
  } catch (error) {
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

router.post("/", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const { productId, name, code, barcode, price, costPrice, stock } = req.body;
    if (price == null || costPrice == null || stock == null) {
      return res.status(400).json({ error: "Precio, costo y stock requeridos" });
    }
    if (![price, costPrice, stock].every((value) => Number.isFinite(Number(value))) || Number(price) < 0 || Number(costPrice) < 0) {
      return res.status(400).json({ error: "Precio, costo o stock inválidos" });
    }

    const item = await prisma.$transaction(async (tx) => {
      let catalogId = productId;
      if (!catalogId) {
        const cleanName = String(name || "").trim();
        const cleanCode = String(code || "").trim().toLowerCase();
        if (!cleanName || !cleanCode) throw new Error("Nombre y código requeridos");
        const catalog = await tx.product.create({
          data: { name: cleanName, code: cleanCode, barcode: String(barcode || "").trim() || null },
        });
        catalogId = catalog.id;
      }

      const catalog = await tx.product.findFirst({ where: { id: catalogId, active: true } });
      if (!catalog) throw new Error("Producto de catálogo no encontrado");
      return tx.businessProduct.create({
        data: {
          businessId: req.businessId,
          productId: catalogId,
          price: Number(price),
          costPrice: Number(costPrice),
          stock: Number(stock),
        },
        include: { product: true },
      });
    });
    res.status(201).json(format(item));
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "El producto ya existe en el catálogo o negocio" });
    console.error("Create business product error:", error);
    res.status(400).json({ error: error.message || "Error al crear producto" });
  }
});

router.patch("/:id", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const existing = await prisma.businessProduct.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
    const data = {};
    for (const field of ["price", "costPrice"]) {
      if (req.body[field] != null) {
        const value = Number(req.body[field]);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: "Precio o costo inválido" });
        data[field] = value;
      }
    }
    if (req.body.stock != null) {
      const stock = Number(req.body.stock);
      if (!Number.isFinite(stock)) return res.status(400).json({ error: "Stock inválido" });
      data.stock = stock;
    }
    if (req.body.active != null) data.active = Boolean(req.body.active);
    const item = await prisma.businessProduct.update({ where: { id: existing.id }, data, include: { product: true } });
    res.json(format(item));
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

router.post("/:id/adjust-stock", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const delta = Number(req.body.delta);
    const reason = String(req.body.reason || "").trim();
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "Delta inválido" });
    if (!reason) return res.status(400).json({ error: "Motivo requerido" });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.businessProduct.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
      if (!existing) throw new Error("Producto no encontrado");
      const item = await tx.businessProduct.update({
        where: { id: existing.id }, data: { stock: { increment: delta } }, include: { product: true },
      });
      await tx.stockAdjustment.create({ data: {
        businessId: req.businessId, businessProductId: existing.id, delta, reason,
        adminId: req.user.id, adminName: req.user.name,
      } });
      return item;
    });
    res.json(format(result));
  } catch (error) {
    console.error("Adjust stock error:", error);
    res.status(400).json({ error: error.message || "Error al ajustar stock" });
  }
});

router.delete("/:id", authenticate, requireOwner, requireBusiness, async (req, res) => {
  try {
    const result = await prisma.businessProduct.updateMany({
      where: { id: req.params.id, businessId: req.businessId }, data: { active: false },
    });
    if (!result.count) return res.status(404).json({ error: "Producto no encontrado" });
    res.json({ message: "Producto desactivado en este negocio" });
  } catch (error) {
    res.status(500).json({ error: "Error al desactivar producto" });
  }
});

export default router;
