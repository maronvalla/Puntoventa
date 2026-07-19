import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import prisma from "../src/db.js";

dotenv.config();

const password = process.env.OWNER_NEW_PASSWORD || "";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configurala en esta terminal o en backend/.env.");
  process.exitCode = 1;
} else if (password.length < 6) {
  console.error("La nueva contraseña debe tener al menos 6 caracteres.");
  process.exitCode = 1;
} else {
  try {
    const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    if (!owner) {
      console.error("No hay ningún usuario OWNER en la base de datos.");
      process.exitCode = 1;
    } else {
      await prisma.user.update({
        where: { id: owner.id },
        data: { password: await bcrypt.hash(password, 10), active: true },
      });
      console.log(`Contraseña actualizada para el dueño: ${owner.username}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
