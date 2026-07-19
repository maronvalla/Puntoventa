import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireOwner } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, requireOwner);

router.get("/", async (_req, res) => {
  try {
    res.json(await prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }));
  } catch (error) {
    console.error("Get catalog error:", error);
    res.status(500).json({ error: "Error al obtener catálogo" });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const code = String(req.body.code || "").trim().toLowerCase();
    const barcode = String(req.body.barcode || "").trim() || null;
    if (!name || !code) return res.status(400).json({ error: "Nombre y código requeridos" });
    const product = await prisma.product.create({ data: { name, code, barcode } });
    res.status(201).json(product);
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "El código ya existe" });
    console.error("Create catalog product error:", error);
    res.status(500).json({ error: "Error al crear producto de catálogo" });
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
    if (req.body.code != null) {
      const code = String(req.body.code).trim().toLowerCase();
      if (!code) return res.status(400).json({ error: "Código requerido" });
      data.code = code;
    }
    if (req.body.barcode != null) data.barcode = String(req.body.barcode).trim() || null;
    if (req.body.active != null) data.active = Boolean(req.body.active);
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(product);
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "El código ya existe" });
    if (error.code === "P2025") return res.status(404).json({ error: "Producto no encontrado" });
    console.error("Update catalog product error:", error);
    res.status(500).json({ error: "Error al actualizar catálogo" });
  }
});

export default router;
