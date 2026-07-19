-- Create the initial business before adding tenant foreign keys.
CREATE TABLE "businesses" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

INSERT INTO "businesses" ("id", "name", "address")
VALUES ('business-main', 'Negocio principal', '');

-- Keep exactly one legacy administrator as owner.
UPDATE "users"
SET "role" = 'CASHIER'
WHERE "role" = 'ADMIN'
  AND "id" <> COALESCE(
    (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' AND "active" = true ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1)
  );

CREATE TYPE "Role_new" AS ENUM ('OWNER', 'CASHIER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new"
USING (CASE WHEN "role"::text = 'ADMIN' THEN 'OWNER' ELSE 'CASHIER' END)::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CASHIER';
UPDATE "users" SET "active" = true WHERE "role" = 'OWNER';

ALTER TABLE "users" ADD COLUMN "businessId" TEXT;
UPDATE "users" SET "businessId" = 'business-main' WHERE "role" = 'CASHIER';
CREATE INDEX "users_businessId_idx" ON "users"("businessId");
ALTER TABLE "users" ADD CONSTRAINT "users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "business_products" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "costPrice" DECIMAL(12,2) NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_products_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_products" ("id", "businessId", "productId", "price", "costPrice", "stock", "active", "createdAt", "updatedAt")
SELECT 'bp_' || "id", 'business-main', "id", "price", "costPrice", "stock", "active", "createdAt", "updatedAt" FROM "products";

CREATE UNIQUE INDEX "business_products_businessId_productId_key" ON "business_products"("businessId", "productId");
CREATE INDEX "business_products_businessId_active_idx" ON "business_products"("businessId", "active");
ALTER TABLE "business_products" ADD CONSTRAINT "business_products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_products" ADD CONSTRAINT "business_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "businessId" TEXT;
UPDATE "sales" SET "businessId" = 'business-main';
ALTER TABLE "sales" ALTER COLUMN "businessId" SET NOT NULL;
CREATE INDEX "sales_businessId_dayKey_idx" ON "sales"("businessId", "dayKey");
CREATE INDEX "sales_businessId_sellerId_idx" ON "sales"("businessId", "sellerId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD COLUMN "businessId" TEXT;
UPDATE "purchases" SET "businessId" = 'business-main';
ALTER TABLE "purchases" ALTER COLUMN "businessId" SET NOT NULL;
CREATE INDEX "purchases_businessId_dayKey_idx" ON "purchases"("businessId", "dayKey");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_adjustments" ADD COLUMN "businessId" TEXT;
UPDATE "stock_adjustments" SET "businessId" = 'business-main';
ALTER TABLE "stock_adjustments" ALTER COLUMN "businessId" SET NOT NULL;
CREATE INDEX "stock_adjustments_businessId_idx" ON "stock_adjustments"("businessId");
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD COLUMN "businessProductId" TEXT;
UPDATE "sale_items" SET "businessProductId" = 'bp_' || "productId";
ALTER TABLE "sale_items" ALTER COLUMN "businessProductId" SET NOT NULL;
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_productId_fkey";
ALTER TABLE "sale_items" DROP COLUMN "productId";
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_businessProductId_fkey" FOREIGN KEY ("businessProductId") REFERENCES "business_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items" ADD COLUMN "businessProductId" TEXT;
UPDATE "purchase_items" SET "businessProductId" = 'bp_' || "productId";
ALTER TABLE "purchase_items" ALTER COLUMN "businessProductId" SET NOT NULL;
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_productId_fkey";
ALTER TABLE "purchase_items" DROP COLUMN "productId";
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_businessProductId_fkey" FOREIGN KEY ("businessProductId") REFERENCES "business_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_adjustments" ADD COLUMN "businessProductId" TEXT;
UPDATE "stock_adjustments" SET "businessProductId" = 'bp_' || "productId";
ALTER TABLE "stock_adjustments" ALTER COLUMN "businessProductId" SET NOT NULL;
ALTER TABLE "stock_adjustments" DROP CONSTRAINT "stock_adjustments_productId_fkey";
ALTER TABLE "stock_adjustments" DROP COLUMN "productId";
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_businessProductId_fkey" FOREIGN KEY ("businessProductId") REFERENCES "business_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" DROP COLUMN "price";
ALTER TABLE "products" DROP COLUMN "costPrice";
ALTER TABLE "products" DROP COLUMN "stock";
