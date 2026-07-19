import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { authenticate, requireBusiness, requireOwner } from "../middleware/auth.js";

const router = Router();
const publicFields = { id: true, username: true, email: true, name: true, role: true, active: true, businessId: true, createdAt: true };
router.use(authenticate, requireOwner, requireBusiness);

router.get("/", async (req, res) => {
  try {
    res.json(await prisma.user.findMany({
      where: { businessId: req.businessId, role: "CASHIER" },
      select: publicFields,
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }));
  } catch (error) {
    res.status(500).json({ error: "Error al obtener empleados" });
  }
});

router.post("/", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim();
    if (!username || !password || !name) return res.status(400).json({ error: "Usuario, contraseña y nombre requeridos" });
    if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    const email = `${username}@pos.local`;
    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (existing?.active) return res.status(400).json({ error: "El usuario ya existe" });
    const data = {
      username, email, password: await bcrypt.hash(password, 10), name,
      role: "CASHIER", businessId: req.businessId, active: true,
    };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data, select: publicFields })
      : await prisma.user.create({ data, select: publicFields });
    res.status(existing ? 200 : 201).json(user);
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "El usuario ya existe" });
    console.error("Create employee error:", error);
    res.status(500).json({ error: "Error al crear empleado" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, role: "CASHIER" } });
    if (!existing) return res.status(404).json({ error: "Empleado no encontrado" });
    const data = {};
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "Nombre requerido" });
      data.name = name;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      data.password = await bcrypt.hash(String(req.body.password), 10);
    }
    if (req.body.active != null) data.active = Boolean(req.body.active);
    if (req.body.businessId != null) {
      const target = await prisma.business.findFirst({ where: { id: String(req.body.businessId), active: true } });
      if (!target) return res.status(400).json({ error: "Negocio destino inválido" });
      data.businessId = target.id;
    } else if (existing.businessId !== req.businessId) {
      return res.status(404).json({ error: "Empleado no encontrado en este negocio" });
    }
    res.json(await prisma.user.update({ where: { id: existing.id }, data, select: publicFields }));
  } catch (error) {
    console.error("Update employee error:", error);
    res.status(500).json({ error: "Error al actualizar empleado" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await prisma.user.updateMany({
      where: { id: req.params.id, businessId: req.businessId, role: "CASHIER" }, data: { active: false },
    });
    if (!result.count) return res.status(404).json({ error: "Empleado no encontrado" });
    res.json({ message: "Empleado desactivado" });
  } catch (error) {
    res.status(500).json({ error: "Error al desactivar empleado" });
  }
});

export default router;
