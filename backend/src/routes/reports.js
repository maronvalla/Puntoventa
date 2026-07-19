import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";

const router = Router();
const dayKeyTucuman = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Tucuman", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
router.use(authenticate, requireBusiness);

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
