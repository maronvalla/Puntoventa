import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const login = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!login || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: login }, { email: login }], active: true }, include: { business: true },
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }
    if (user.role === "CASHIER" && (!user.business || !user.business.active)) {
      return res.status(403).json({ error: "El negocio asignado está desactivado" });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
    res.json({ token, user: {
      id: user.id, username: user.username, email: user.email, name: user.name,
      role: user.role, businessId: user.businessId, business: user.business,
    } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

router.get("/me", authenticate, (req, res) => res.json({ user: req.user }));
router.post("/logout", authenticate, (_req, res) => res.json({ message: "Sesión cerrada" }));

export default router;
