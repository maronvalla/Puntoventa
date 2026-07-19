import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireBusiness, requireOwner } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requireOwner, requireBusiness);

router.get("/", async (req, res) => {
  try {
    const where = { businessId: req.businessId };
    if (req.query.dayKey) where.dayKey = req.query.dayKey;
    const purchases = await prisma.purchase.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } });
    res.json(purchases.map((purchase) => ({ ...purchase, totalCost: Number(purchase.totalCost),
      items: purchase.items.map((item) => ({ ...item, costPrice: Number(item.costPrice) })) })));
  } catch (error) {
    res.status(500).json({ error: "Error al obtener compras" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!Array.isArray(req.body.items) || !req.body.items.length) return res.status(400).json({ error: "Compra vacía" });
    const requested = new Map();
    for (const raw of req.body.items) {
      const id = String(raw.productId || "");
      const qty = Number(raw.qty);
      const costPrice = Number(raw.costPrice);
      if (!id || !Number.isInteger(qty) || qty <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
        return res.status(400).json({ error: "Items inválidos" });
      }
      if (requested.has(id)) return res.status(400).json({ error: "Producto duplicado en la compra" });
      requested.set(id, { qty, costPrice });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const inventory = await tx.businessProduct.findMany({
        where: { id: { in: [...requested.keys()] }, businessId: req.businessId, active: true }, include: { product: true },
      });
      if (inventory.length !== requested.size) throw new Error("Algunos productos no pertenecen al negocio");
      const lines = inventory.map((item) => ({ businessProductId: item.id, name: item.product.name, ...requested.get(item.id) }));
      const totalCost = lines.reduce((sum, item) => sum + item.qty * item.costPrice, 0);
      const created = await tx.purchase.create({ data: {
        businessId: req.businessId, adminId: req.user.id, adminName: req.user.name,
        dayKey: req.body.dayKey || new Date().toISOString().split("T")[0], totalCost,
        items: { create: lines },
      }, include: { items: true } });
      for (const line of lines) {
        await tx.businessProduct.update({ where: { id: line.businessProductId }, data: {
          stock: { increment: line.qty }, costPrice: line.costPrice,
        } });
      }
      return created;
    });
    res.status(201).json({ ...purchase, totalCost: Number(purchase.totalCost),
      items: purchase.items.map((item) => ({ ...item, costPrice: Number(item.costPrice) })) });
  } catch (error) {
    console.error("Create purchase error:", error);
    res.status(400).json({ error: error.message || "Error al registrar compra" });
  }
});

export default router;
