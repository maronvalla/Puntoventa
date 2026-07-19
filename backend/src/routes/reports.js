import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";

const router = Router();
const dayKeyTucuman = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Tucuman", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
router.use(authenticate, requireBusiness);

router.get("/summary", async (req, res) => {
  try {
    if (req.user.role !== "OWNER") return res.status(403).json({ error: "Acceso denegado" });
    const nowParts = dayKeyTucuman().split("-").map(Number);
    const period = req.query.period === "year" ? "year" : "month";
    const year = Number(req.query.year || nowParts[0]);
    const month = Number(req.query.month || nowParts[1]);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || (period === "month" && (!Number.isInteger(month) || month < 1 || month > 12))) {
      return res.status(400).json({ error: "Período inválido" });
    }

    const paddedMonth = String(month).padStart(2, "0");
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const from = period === "year" ? `${year}-01-01` : `${year}-${paddedMonth}-01`;
    const to = period === "year" ? `${year}-12-31` : `${year}-${paddedMonth}-${String(daysInMonth).padStart(2, "0")}`;
    const sales = await prisma.sale.findMany({
      where: { businessId: req.businessId, status: "ACTIVE", dayKey: { gte: from, lte: to } },
      include: { items: true },
      orderBy: { dayKey: "asc" },
    });

    let grossSales = 0, cogs = 0, cash = 0, transfer = 0;
    const productTotals = new Map();
    const bucketCount = period === "year" ? 12 : daysInMonth;
    const trend = Array.from({ length: bucketCount }, (_, index) => ({
      key: index + 1,
      label: period === "year"
        ? new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, index, 1))).replace(".", "")
        : String(index + 1),
      grossSales: 0, profit: 0, transactions: 0,
    }));

    for (const sale of sales) {
      const saleTotal = Number(sale.total || 0);
      const saleCogs = sale.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.itemCostPrice || 0), 0);
      grossSales += saleTotal; cogs += saleCogs;
      cash += Number(sale.cashAmount || 0); transfer += Number(sale.transferAmount || 0);
      const bucket = period === "year" ? Number(sale.dayKey.slice(5, 7)) - 1 : Number(sale.dayKey.slice(8, 10)) - 1;
      if (trend[bucket]) {
        trend[bucket].grossSales += saleTotal;
        trend[bucket].profit += saleTotal - saleCogs;
        trend[bucket].transactions += 1;
      }
      for (const item of sale.items) {
        const current = productTotals.get(item.name) || { name: item.name, qty: 0, revenue: 0 };
        current.qty += Number(item.qty || 0);
        current.revenue += Number(item.lineTotal || Number(item.qty || 0) * Number(item.unitPrice || 0));
        productTotals.set(item.name, current);
      }
    }

    const profit = grossSales - cogs;
    const topProducts = [...productTotals.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    res.json({
      period, year, month: period === "month" ? month : null, from, to,
      grossSales, cogs, profit, marginPercent: grossSales ? (profit / grossSales) * 100 : 0,
      transactions: sales.length, averageTicket: sales.length ? grossSales / sales.length : 0,
      paymentTotals: { cash, transfer }, trend, topProduct: topProducts[0] || null, topProducts,
    });
  } catch (error) {
    console.error("Summary report error:", error);
    res.status(500).json({ error: "Error al generar el reporte del período" });
  }
});

router.get("/daily", async (req, res) => {
  try {
    const isOwner = req.user.role === "OWNER";
    const todayKey = dayKeyTucuman();
    const dayKey = !isOwner ? todayKey : (req.query.dayKey || todayKey);
    const where = { businessId: req.businessId, dayKey };
    if (!isOwner) where.sellerId = req.user.id;
    const sales = await prisma.sale.findMany({ where, include: { items: true } });
    const activeSales = sales.filter((sale) => sale.status === "ACTIVE");
    const totalDay = activeSales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalsByPayment = { cash: 0, transfer: 0 };
    let cogsDay = 0;
    const totalsByUser = {};
    for (const sale of activeSales) {
      totalsByPayment.cash += Number(sale.cashAmount);
      totalsByPayment.transfer += Number(sale.transferAmount);
      if (isOwner) {
        totalsByUser[sale.sellerName || "Sin usuario"] = (totalsByUser[sale.sellerName || "Sin usuario"] || 0) + Number(sale.total);
        cogsDay += sale.items.reduce((sum, item) => sum + item.qty * Number(item.itemCostPrice), 0);
      }
    }
    res.json({ dayKey, todayKey, isAdmin: isOwner, totalDay, totalsByPayment,
      cogsDay: isOwner ? cogsDay : undefined, profitDay: isOwner ? totalDay - cogsDay : undefined,
      totalsByUser: isOwner ? totalsByUser : undefined,
      voidedCount: sales.filter((sale) => sale.status === "VOIDED").length,
      salesCount: activeSales.length,
      salesList: !isOwner ? activeSales.map((sale) => ({ id: sale.id, total: Number(sale.total), itemCount: sale.items.length, createdAt: sale.createdAt })) : undefined,
    });
  } catch (error) {
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

router.get("/top-product", async (req, res) => {
  try {
    const grouped = await prisma.saleItem.groupBy({
      by: ["name"],
      where: { sale: { businessId: req.businessId, status: "ACTIVE" } },
      _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 1,
    });
    res.json(grouped.length ? { name: grouped[0].name, qty: grouped[0]._sum.qty } : null);
  } catch (error) {
    console.error("Top product error:", error);
    res.status(500).json({ error: "Error al obtener producto más vendido" });
  }
});

export default router;
