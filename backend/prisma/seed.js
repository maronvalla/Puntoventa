import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const existingOwner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (existingOwner) {
    if (!existingOwner.active) {
      await prisma.user.update({ where: { id: existingOwner.id }, data: { active: true, businessId: null } });
    }
    console.log(`✓ Dueño ya existe: ${existingOwner.username}`);
    return;
  }

  const username = String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin";
  const name = process.env.ADMIN_NAME || "Administrador";
  const email = `${username}@pos.local`;
  await prisma.business.upsert({
    where: { id: "business-main" }, update: {},
    create: { id: "business-main", name: "Negocio principal", address: "" },
  });
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  const data = { username, email, password: await bcrypt.hash(password, 10), name, role: "OWNER", active: true, businessId: null };
  const owner = existing
    ? await prisma.user.update({ where: { id: existing.id }, data })
    : await prisma.user.create({ data });
  console.log(`✓ Dueño creado: ${owner.username}`);
}

main().catch((error) => { console.error("Seed error:", error); process.exit(1); })
  .finally(async () => prisma.$disconnect());
