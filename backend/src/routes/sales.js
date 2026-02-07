import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Helper: Get Tucuman day key
function dayKeyTucuman(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

// GET /api/sales - List sales
router.get("/", authenticate, async (req, res) => {
  try {
    const { dayKey, sellerId } = req.query;
    const isAdmin = req.user.role === "ADMIN";

    const where = {};

    // Filter by day if provided
    if (dayKey) {
      where.dayKey = dayKey;
    }

    // Admins can see all sales, cashiers only their own
    if (!isAdmin) {
      where.sellerId = req.user.id;
    } else if (sellerId && sellerId !== "all") {
      where.sellerId = sellerId;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Convert Decimals to numbers
    const formattedSales = sales.map((s) => ({
      ...s,
      total: Number(s.total),
      cashAmount: Number(s.cashAmount),
      transferAmount: Number(s.transferAmount),
      items: s.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        itemCostPrice: Number(i.itemCostPrice),
        lineTotal: Number(i.lineTotal),
      })),
    }));

    res.json(formattedSales);
  } catch (error) {
    console.error("Get sales error:", error);
    res.status(500).json({ error: "Error al obtener ventas" });
  }
});

// GET /api/sales/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!sale) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    // Only admin or owner can view
    if (req.user.role !== "ADMIN" && sale.sellerId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado" });
    }

    res.json({
      ...sale,
      total: Number(sale.total),
      cashAmount: Number(sale.cashAmount),
      transferAmount: Number(sale.transferAmount),
      items: sale.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        itemCostPrice: Number(i.itemCostPrice),
        lineTotal: Number(i.lineTotal),
      })),
    });
  } catch (error) {
    console.error("Get sale error:", error);
    res.status(500).json({ error: "Error al obtener venta" });
  }
});

// POST /api/sales - Create sale with stock update
router.post("/", authenticate, async (req, res) => {
  try {
    const { items, paymentMethod = "CASH", cashAmount = 0, transferAmount = 0 } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: "El carrito está vacío" });
    }

    // Calculate total
    const total = items.reduce((sum, item) => {
      return sum + Number(item.price) * Number(item.qty);
    }, 0);

    // Validate payment for mixed
    if (paymentMethod === "MIXED") {
      const paymentSum = Number(cashAmount) + Number(transferAmount);
      if (Math.abs(paymentSum - total) > 0.01) {
        return res.status(400).json({ error: "El pago mixto no coincide con el total" });
      }
    }

    // Prepare payment data
    let payment = { paymentMethod, cashAmount: 0, transferAmount: 0 };
    if (paymentMethod === "CASH") {
      payment = { paymentMethod: "CASH", cashAmount: total, transferAmount: 0 };
    } else if (paymentMethod === "TRANSFER") {
      payment = { paymentMethod: "TRANSFER", cashAmount: 0, transferAmount: total };
    } else if (paymentMethod === "MIXED") {
      payment = { paymentMethod: "MIXED", cashAmount: Number(cashAmount), transferAmount: Number(transferAmount) };
    }

    const dayKey = dayKeyTucuman(new Date());

    // Transaction: create sale and update stock
    const result = await prisma.$transaction(async (tx) => {
      // Verify all products exist and get current data
      const productIds = items.map((i) => i.id);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      if (products.length !== items.length) {
        throw new Error("Algunos productos no fueron encontrados");
      }

      // Create product lookup
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Prepare sale items
      const saleItems = items.map((item) => {
        const product = productMap.get(item.id);
        return {
          productId: item.id,
          name: product.name,
          qty: Number(item.qty),
          unitPrice: Number(product.price),
          itemCostPrice: Number(product.costPrice),
          barcode: product.barcode || null,
          code: product.code || null,
          lineTotal: Number(product.price) * Number(item.qty),
        };
      });

      // Create sale
      const sale = await tx.sale.create({
        data: {
          sellerId: req.user.id,
          sellerName: req.user.name,
          dayKey,
          total,
          ...payment,
          status: "ACTIVE",
          items: {
            create: saleItems,
          },
        },
        include: { items: true },
      });

      // Update stock for each product
      for (const item of items) {
        const product = productMap.get(item.id);
        await tx.product.update({
          where: { id: item.id },
          data: { stock: product.stock - Number(item.qty) },
        });
      }

      return sale;
    });

    res.status(201).json({
      ...result,
      total: Number(result.total),
      cashAmount: Number(result.cashAmount),
      transferAmount: Number(result.transferAmount),
      items: result.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        itemCostPrice: Number(i.itemCostPrice),
        lineTotal: Number(i.lineTotal),
      })),
    });
  } catch (error) {
    console.error("Create sale error:", error);
    res.status(500).json({ error: error.message || "Error al registrar venta" });
  }
});

// POST /api/sales/quick - Quick sale by product code
router.post("/quick", authenticate, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Código requerido" });
    }

    const product = await prisma.product.findFirst({
      where: {
        code: code.toLowerCase(),
        active: true,
      },
    });

    if (!product) {
      return res.status(404).json({ error: `Código no encontrado: ${code}` });
    }

    const dayKey = dayKeyTucuman(new Date());
    const total = Number(product.price);

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          sellerId: req.user.id,
          sellerName: req.user.name,
          dayKey,
          total,
          paymentMethod: "CASH",
          cashAmount: total,
          transferAmount: 0,
          status: "ACTIVE",
          items: {
            create: {
              productId: product.id,
              name: product.name,
              qty: 1,
              unitPrice: Number(product.price),
              itemCostPrice: Number(product.costPrice),
              barcode: product.barcode,
              code: product.code,
              lineTotal: total,
            },
          },
        },
        include: { items: true },
      });

      await tx.product.update({
        where: { id: product.id },
        data: { stock: product.stock - 1 },
      });

      return sale;
    });

    res.status(201).json({
      ...result,
      total: Number(result.total),
      cashAmount: Number(result.cashAmount),
      transferAmount: Number(result.transferAmount),
      productName: product.name,
      items: result.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        itemCostPrice: Number(i.itemCostPrice),
        lineTotal: Number(i.lineTotal),
      })),
    });
  } catch (error) {
    console.error("Quick sale error:", error);
    res.status(500).json({ error: error.message || "Error en venta rápida" });
  }
});

// PATCH /api/sales/:id - Update payment method (admin only)
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { paymentMethod, cashAmount, transferAmount } = req.body;

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
    });

    if (!sale) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    if (sale.status === "VOIDED") {
      return res.status(400).json({ error: "No se puede editar una venta anulada" });
    }

    const total = Number(sale.total);
    let payment = {};

    if (paymentMethod === "CASH") {
      payment = { paymentMethod: "CASH", cashAmount: total, transferAmount: 0 };
    } else if (paymentMethod === "TRANSFER") {
      payment = { paymentMethod: "TRANSFER", cashAmount: 0, transferAmount: total };
    } else if (paymentMethod === "MIXED") {
      const sum = Number(cashAmount) + Number(transferAmount);
      if (Math.abs(sum - total) > 0.01) {
        return res.status(400).json({ error: "El pago mixto no coincide con el total" });
      }
      payment = {
        paymentMethod: "MIXED",
        cashAmount: Number(cashAmount),
        transferAmount: Number(transferAmount),
      };
    }

    const updated = await prisma.sale.update({
      where: { id: req.params.id },
      data: payment,
    });

    res.json({
      ...updated,
      total: Number(updated.total),
      cashAmount: Number(updated.cashAmount),
      transferAmount: Number(updated.transferAmount),
    });
  } catch (error) {
    console.error("Update sale error:", error);
    res.status(500).json({ error: "Error al actualizar venta" });
  }
});

// POST /api/sales/:id/void - Void sale and restore stock (admin only)
router.post("/:id/void", authenticate, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });

      if (!sale) {
        throw new Error("Venta no encontrada");
      }

      if (sale.status === "VOIDED") {
        throw new Error("La venta ya está anulada");
      }

      // Restore stock for each item
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        });
      }

      // Mark sale as voided
      const updated = await tx.sale.update({
        where: { id: req.params.id },
        data: {
          status: "VOIDED",
          voidReason: reason || "",
          voidedAt: new Date(),
        },
      });

      return updated;
    });

    res.json({
      message: "Venta anulada",
      sale: {
        ...result,
        total: Number(result.total),
        cashAmount: Number(result.cashAmount),
        transferAmount: Number(result.transferAmount),
      },
    });
  } catch (error) {
    console.error("Void sale error:", error);
    res.status(500).json({ error: error.message || "Error al anular venta" });
  }
});

// DELETE /api/sales/:id - Delete voided sale (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
    });

    if (!sale) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    if (sale.status !== "VOIDED") {
      return res.status(400).json({ error: "Solo se pueden borrar ventas anuladas" });
    }

    await prisma.sale.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Venta borrada" });
  } catch (error) {
    console.error("Delete sale error:", error);
    res.status(500).json({ error: "Error al borrar venta" });
  }
});

export default router;
