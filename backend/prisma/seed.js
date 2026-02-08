import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin";
  const name = process.env.ADMIN_NAME || "Administrador";
  const email = `${username}@pos.local`;

  const hashedPassword = await bcrypt.hash(password, 10);

  const existingByUsername = await prisma.user.findUnique({
    where: { username },
  });
  const existingByEmail = existingByUsername
    ? null
    : await prisma.user.findUnique({ where: { email } });

  const admin = existingByUsername || existingByEmail
    ? await prisma.user.update({
        where: { id: (existingByUsername || existingByEmail).id },
        data: {
          username,
          email,
          password: hashedPassword,
          name,
          role: "ADMIN",
          active: true,
        },
      })
    : await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          name,
          role: "ADMIN",
          active: true,
        },
      });

  await prisma.user.updateMany({
    where: { id: { not: admin.id } },
    data: { active: false },
  });

  console.log(`✓ Admin user: ${admin.username} (${admin.email})`);
  console.log(`  Password: ${password}`);
  console.log("✓ Otros usuarios desactivados");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
