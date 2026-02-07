import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /api/users - List all users
router.get("/", authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// POST /api/users - Create cashier (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, name } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: "Usuario, contraseña y nombre requeridos" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const usernameClean = username.toLowerCase().trim();
    const email = `${usernameClean}@pos.local`;

    // Check if username exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username: usernameClean }, { email }],
      },
    });

    if (existing) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: usernameClean,
        email,
        password: hashedPassword,
        name: name.trim(),
        role: "CASHIER",
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// PATCH /api/users/:id - Update user (admin only)
router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, password, role } = req.body;
    const updateData = {};

    if (name) updateData.name = name.trim();
    if (role && ["ADMIN", "CASHIER"].includes(role)) updateData.role = role;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error("Update user error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

// DELETE /api/users/:id - Deactivate user (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "No podés eliminarte a vos mismo" });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { active: false },
    });

    res.json({ message: "Usuario desactivado" });
  } catch (error) {
    console.error("Delete user error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

export default router;
