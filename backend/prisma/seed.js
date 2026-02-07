import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const name = process.env.ADMIN_NAME || "Administrador";
  const email = `${username}@pos.local`;

  const existing = await prisma.user.findFirst({
    where: { username },
  });

  if (existing) {
    console.log(`✓ Admin user "${username}" already exists`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
      name,
      role: "ADMIN",
    },
  });

  console.log(`✓ Created admin user: ${admin.username} (${admin.email})`);
  console.log(`  Password: ${password}`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
