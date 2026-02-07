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

// GET /api/reports/daily - Daily report
router.get("/daily", authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === "ADMIN";
    const todayKey = dayKeyTucuman();
    let { dayKey } = req.query;

    // Cashiers can only see today
    if (!isAdmin && dayKey !== todayKey) {
      dayKey = todayKey;
    }

    if (!dayKey) {
      dayKey = todayKey;
    }

    const where = { dayKey };

    // Cashiers only see their own sales
    if (!isAdmin) {
      where.sellerId = req.user.id;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { items: true },
    });

    const activeSales = sales.filter((s) => s.status === "ACTIVE");
    const voidedCount = sales.filter((s) => s.status === "VOIDED").length;

    // Calculate totals
    const totalDay = activeSales.reduce((sum, s) => sum + Number(s.total), 0);

    // Payment method breakdown
    const totalsByPayment = { cash: 0, transfer: 0 };
    for (const s of activeSales) {
      if (s.paymentMethod === "TRANSFER") {
        totalsByPayment.transfer += Number(s.transferAmount);
      } else if (s.paymentMethod === "MIXED") {
        totalsByPayment.cash += Number(s.cashAmount);
        totalsByPayment.transfer += Number(s.transferAmount);
      } else {
        totalsByPayment.cash += Number(s.cashAmount);
      }
    }

    // Cost of goods sold (admin only)
    let cogsDay = 0;
    if (isAdmin) {
      for (const s of activeSales) {
        for (const item of s.items) {
          cogsDay += Number(item.qty) * Number(item.itemCostPrice);
        }
      }
    }

    const profitDay = totalDay - cogsDay;

    // Totals by user (admin only)
    let totalsByUser = {};
    if (isAdmin) {
      for (const s of activeSales) {
        const name = s.sellerName || "Sin usuario";
        totalsByUser[name] = (totalsByUser[name] || 0) + Number(s.total);
      }
    }

    // For cashiers, list their sales
    let salesList = [];
    if (!isAdmin) {
      salesList = activeSales.map((s) => ({
        id: s.id,
        total: Number(s.total),
        itemCount: s.items.length,
        createdAt: s.createdAt,
      }));
    }

    res.json({
      dayKey,
      todayKey,
      isAdmin,
      totalDay,
      totalsByPayment,
      cogsDay: isAdmin ? cogsDay : undefined,
      profitDay: isAdmin ? profitDay : undefined,
      totalsByUser: isAdmin ? totalsByUser : undefined,
      voidedCount,
      salesCount: activeSales.length,
      salesList: !isAdmin ? salesList : undefined,
    });
  } catch (error) {
    console.error("Daily report error:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

export default router;
