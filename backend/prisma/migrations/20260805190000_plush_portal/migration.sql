CREATE TYPE "PlushMovementStatus" AS ENUM ('ACTIVE', 'VOIDED');

CREATE TABLE "plush_inventory" (
  "id" TEXT NOT NULL DEFAULT 'main', "initialQuantity" INTEGER NOT NULL,
  "initialUnitCost" DECIMAL(14,4) NOT NULL, "locked" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL, "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plush_inventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_machines" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL,
  "location" TEXT NOT NULL, "model" TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true, "consignment" BOOLEAN NOT NULL DEFAULT false,
  "locatorName" TEXT NOT NULL DEFAULT '', "locatorPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "initialCounter" INTEGER NOT NULL, "initialPlushQuantity" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL, "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plush_machines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_machine_photos" (
  "id" TEXT NOT NULL, "machineId" TEXT NOT NULL, "dataUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "isCover" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plush_machine_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_purchases" (
  "id" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "totalCost" DECIMAL(14,2) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL, "supplier" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "status" "PlushMovementStatus" NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL, "voidedById" TEXT, "voidedByName" TEXT,
  "voidReason" TEXT, "voidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plush_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_stock_adjustments" (
  "id" TEXT NOT NULL, "delta" INTEGER NOT NULL, "reason" TEXT NOT NULL,
  "status" "PlushMovementStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL, "createdByName" TEXT NOT NULL, "voidedById" TEXT,
  "voidedByName" TEXT, "voidReason" TEXT, "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plush_stock_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_loads" (
  "id" TEXT NOT NULL, "machineId" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '', "status" "PlushMovementStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL, "createdByName" TEXT NOT NULL, "voidedById" TEXT,
  "voidedByName" TEXT, "voidReason" TEXT, "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plush_loads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plush_settlements" (
  "id" TEXT NOT NULL, "machineId" TEXT NOT NULL, "dayKey" TEXT NOT NULL,
  "initialCounter" INTEGER NOT NULL, "finalCounter" INTEGER NOT NULL, "prizesDelivered" INTEGER NOT NULL,
  "cashAmount" DECIMAL(14,2) NOT NULL, "qrAmount" DECIMAL(14,2) NOT NULL,
  "cppSnapshot" DECIMAL(14,4) NOT NULL, "consignmentSnapshot" BOOLEAN NOT NULL,
  "locatorNameSnapshot" TEXT NOT NULL DEFAULT '', "locatorPercentSnapshot" DECIMAL(7,4) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '', "status" "PlushMovementStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL, "createdByName" TEXT NOT NULL, "voidedById" TEXT,
  "voidedByName" TEXT, "voidReason" TEXT, "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plush_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plush_machines_code_key" ON "plush_machines"("code");
CREATE INDEX "plush_machines_active_name_idx" ON "plush_machines"("active", "name");
CREATE INDEX "plush_machine_photos_machineId_sortOrder_idx" ON "plush_machine_photos"("machineId", "sortOrder");
CREATE INDEX "plush_purchases_status_createdAt_idx" ON "plush_purchases"("status", "createdAt");
CREATE INDEX "plush_stock_adjustments_status_createdAt_idx" ON "plush_stock_adjustments"("status", "createdAt");
CREATE INDEX "plush_loads_machineId_status_createdAt_idx" ON "plush_loads"("machineId", "status", "createdAt");
CREATE INDEX "plush_settlements_machineId_status_createdAt_idx" ON "plush_settlements"("machineId", "status", "createdAt");
CREATE INDEX "plush_settlements_dayKey_status_idx" ON "plush_settlements"("dayKey", "status");

ALTER TABLE "plush_machine_photos" ADD CONSTRAINT "plush_machine_photos_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "plush_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plush_loads" ADD CONSTRAINT "plush_loads_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "plush_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plush_settlements" ADD CONSTRAINT "plush_settlements_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "plush_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
