-- Add POS-specific enum values used by the new sale foundation.
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'pos_sale';
ALTER TYPE "FinancePaymentMethod" ADD VALUE IF NOT EXISTS 'mobile_money';
ALTER TYPE "StockLedgerEntryType" ADD VALUE IF NOT EXISTS 'pos_sale_complete';
ALTER TYPE "StockLedgerEntryType" ADD VALUE IF NOT EXISTS 'pos_sale_cancel';
ALTER TYPE "StockLedgerSourceType" ADD VALUE IF NOT EXISTS 'pos_sale';

CREATE TYPE "PosSaleStatus" AS ENUM ('completed', 'cancelled');

CREATE TABLE "PosSale" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "saleNumber" TEXT NOT NULL,
  "customerNameSnapshot" TEXT,
  "customerPhoneSnapshot" TEXT,
  "status" "PosSaleStatus" NOT NULL DEFAULT 'completed',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL,
  "changeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'cash',
  "paymentAccountId" TEXT,
  "salesOrderId" TEXT,
  "receivableId" TEXT,
  "journalEntryId" TEXT,
  "cashierUserId" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosSaleItem" (
  "id" TEXT NOT NULL,
  "posSaleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productSkuSnapshot" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosSale_companyId_saleNumber_key" ON "PosSale"("companyId", "saleNumber");
CREATE INDEX "PosSale_companyId_idx" ON "PosSale"("companyId");
CREATE INDEX "PosSale_companyId_status_idx" ON "PosSale"("companyId", "status");
CREATE INDEX "PosSale_companyId_completedAt_idx" ON "PosSale"("companyId", "completedAt");
CREATE INDEX "PosSale_cashierUserId_idx" ON "PosSale"("cashierUserId");
CREATE INDEX "PosSale_paymentAccountId_idx" ON "PosSale"("paymentAccountId");
CREATE INDEX "PosSaleItem_posSaleId_idx" ON "PosSaleItem"("posSaleId");
CREATE INDEX "PosSaleItem_productId_idx" ON "PosSaleItem"("productId");

ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
