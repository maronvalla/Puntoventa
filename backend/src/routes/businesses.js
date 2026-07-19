import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireOwner } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requireOwner);

router.get("/", async (_req, res) => {
  try {
    const businesses = await prisma.business.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    res.json(businesses);
  } catch (error) {
    console.error("Get businesses error:", error);
    res.status(500).json({ error: "Error al obtener negocios" });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    if (!name) return res.status(400).json({ error: "Nombre requerido" });
    const business = await prisma.business.create({ data: { name, address } });
    res.status(201).json(business);
  } catch (error) {
    console.error("Create business error:", error);
    res.status(500).json({ error: "Error al crear negocio" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "Nombre requerido" });
      data.name = name;
    }
    if (req.body.address != null) data.address = String(req.body.address).trim();
    if (req.body.active != null) data.active = Boolean(req.body.active);
    const business = await prisma.business.update({ where: { id: req.params.id }, data });
    res.json(business);
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Negocio no encontrado" });
    console.error("Update business error:", error);
    res.status(500).json({ error: "Error al actualizar negocio" });
  }
});

export default router;
