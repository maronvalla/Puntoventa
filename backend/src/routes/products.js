import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /api/products - List all active products
router.get("/", authenticate, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });

    // Convert Decimal to number for JSON
    const formattedProducts = products.map((p) => ({
      ...p,
      price: Number(p.price),
      costPrice: Number(p.costPrice),
    }));

    res.json(formattedProducts);
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// GET /api/products/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
    });

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

// POST /api/products - Create product (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, price, costPrice, barcode, code, stock } = req.body;

    if (!name || price == null || costPrice == null || !code || stock == null) {
      return res.status(400).json({
        error: "Falta nombre / precio / costo / code / stock",
      });
    }

    if (Number(price) < 0 || Number(costPrice) < 0) {
      return res.status(400).json({ error: "Precio/costo inválidos" });
    }

    // Check code uniqueness
    const existing = await prisma.product.findUnique({
      where: { code: code.toLowerCase() },
    });

    if (existing) {
      return res.status(400).json({ error: "El code ya existe" });
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        price: Number(price),
        costPrice: Number(costPrice),
        barcode: barcode?.trim() || null,
        code: code.toLowerCase().trim(),
        stock: Number(stock),
      },
    });

    res.status(201).json({
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Error al crear producto" });
  }
});

// PATCH /api/products/:id - Update product (admin only)
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { price, costPrice, name, barcode, code, stock } = req.body;
    const updateData = {};

    if (price != null) {
      if (Number(price) < 0) {
        return res.status(400).json({ error: "Precio inválido" });
      }
      updateData.price = Number(price);
    }

    if (costPrice != null) {
      if (Number(costPrice) < 0) {
        return res.status(400).json({ error: "Costo inválido" });
      }
      updateData.costPrice = Number(costPrice);
    }

    if (name != null) updateData.name = name.trim();
    if (barcode != null) updateData.barcode = barcode.trim() || null;

    if (code != null) {
      // Check code uniqueness
      const existing = await prisma.product.findFirst({
        where: {
          code: code.toLowerCase(),
          NOT: { id: req.params.id },
        },
      });
      if (existing) {
        return res.status(400).json({ error: "El code ya existe" });
      }
      updateData.code = code.toLowerCase().trim();
    }

    if (stock != null) updateData.stock = Number(stock);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
    });
  } catch (error) {
    console.error("Update product error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// POST /api/products/:id/adjust-stock - Adjust stock with reason (admin only)
router.post("/:id/adjust-stock", authenticate, requireAdmin, async (req, res) => {
  try {
    const { delta, reason } = req.body;

    if (!Number.isFinite(Number(delta)) || Number(delta) === 0) {
      return res.status(400).json({ error: "Delta inválido" });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Motivo requerido" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: req.params.id },
      });

      if (!product) {
        throw new Error("Producto no encontrado");
      }

      const newStock = product.stock + Number(delta);

      const updatedProduct = await tx.product.update({
        where: { id: req.params.id },
        data: { stock: newStock },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          productId: req.params.id,
          delta: Number(delta),
          reason: reason.trim(),
          adminId: req.user.id,
          adminName: req.user.name,
        },
      });

      return { product: updatedProduct, adjustment };
    });

    res.json({
      ...result.product,
      price: Number(result.product.price),
      costPrice: Number(result.product.costPrice),
    });
  } catch (error) {
    console.error("Adjust stock error:", error);
    res.status(500).json({ error: error.message || "Error al ajustar stock" });
  }
});

// DELETE /api/products/:id - Soft delete product (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });

    res.json({ message: "Producto eliminado" });
  } catch (error) {
    console.error("Delete product error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    res.status(500).json({ error: "Error al eliminar producto" });
  }
});

export default router;
