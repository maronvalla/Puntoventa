import jwt from "jsonwebtoken";
import prisma from "../db.js";

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token no proporcionado" });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        active: true,
        businessId: true,
        business: { select: { id: true, name: true, address: true, active: true } },
      },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: "Usuario no encontrado o desactivado" });
    }
    if (user.role === "CASHIER" && (!user.business || !user.business.active)) {
      return res.status(403).json({ error: "El negocio asignado está desactivado" });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") return res.status(401).json({ error: "Token inválido" });
    if (error.name === "TokenExpiredError") return res.status(401).json({ error: "Token expirado" });
    return res.status(500).json({ error: "Error de autenticación" });
  }
}

export function requireOwner(req, res, next) {
  if (req.user.role !== "OWNER") {
    return res.status(403).json({ error: "Acceso exclusivo del dueño" });
  }
  next();
}

export async function requireBusiness(req, res, next) {
  try {
    const businessId = req.user.role === "OWNER"
      ? String(req.headers["x-business-id"] || "").trim()
      : req.user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "Seleccioná un negocio" });
    }
    if (req.user.role === "CASHIER" && businessId !== req.user.businessId) {
      return res.status(403).json({ error: "No autorizado para este negocio" });
    }

    const business = await prisma.business.findFirst({ where: { id: businessId, active: true } });
    if (!business) return res.status(403).json({ error: "Negocio inexistente o desactivado" });

    req.business = business;
    req.businessId = business.id;
    next();
  } catch (error) {
    console.error("Business context error:", error);
    res.status(500).json({ error: "Error al resolver el negocio" });
  }
}
