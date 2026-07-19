import dotenv from "dotenv";
import prisma from "../src/db.js";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configurala en esta terminal o en backend/.env.");
  process.exitCode = 1;
} else {
try {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER" },
    select: {
      username: true,
      name: true,
      active: true,
    },
  });

  if (owners.length === 0) {
    console.log("No hay ningún usuario OWNER en la base de datos.");
  } else {
    console.table(owners);
  }
} finally {
  await prisma.$disconnect();
}
}
