import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /api/purchases - List purchases (admin only)
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { dayKey } = req.query;

    const where = {};
    if (dayKey) {
      where.dayKey = dayKey;
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const formatted = purchases.map((p) => ({
      ...p,
      totalCost: Number(p.totalCost),
      items: p.items.map((i) => ({
        ...i,
        costPrice: Number(i.costPrice),
      })),
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Get purchases error:", error);
    res.status(500).json({ error: "Error al obtener compras" });
  }
});

// POST /api/purchases - Register purchase (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { dayKey, items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: "Compra vacía" });
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.qty || item.qty <= 0 || item.costPrice == null || item.costPrice < 0) {
        return res.status(400).json({ error: "Items inválidos" });
      }
    }

    const totalCost = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.costPrice), 0);

    const result = await prisma.$transaction(async (tx) => {
      // Verify products exist
      const productIds = items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      if (products.length !== items.length) {
        throw new Error("Algunos productos no fueron encontrados");
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Create purchase
      const purchase = await tx.purchase.create({
        data: {
          adminId: req.user.id,
          adminName: req.user.name,
          dayKey: dayKey || new Date().toISOString().split("T")[0],
          totalCost,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              name: productMap.get(item.productId).name,
              qty: Number(item.qty),
              costPrice: Number(item.costPrice),
            })),
          },
        },
        include: { items: true },
      });

      // Update stock
      for (const item of items) {
        const product = productMap.get(item.productId);
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: product.stock + Number(item.qty) },
        });
      }

      return purchase;
    });

    res.status(201).json({
      ...result,
      totalCost: Number(result.totalCost),
      items: result.items.map((i) => ({
        ...i,
        costPrice: Number(i.costPrice),
      })),
    });
  } catch (error) {
    console.error("Create purchase error:", error);
    res.status(500).json({ error: error.message || "Error al registrar compra" });
  }
});

export default router;
