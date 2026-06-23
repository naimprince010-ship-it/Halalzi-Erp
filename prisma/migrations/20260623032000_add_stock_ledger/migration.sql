-- CreateEnum
CREATE TYPE "StockLedgerEntryType" AS ENUM ('opening_balance', 'manual_adjustment', 'sales_order_confirm', 'sales_order_cancel', 'purchase_order_receive', 'purchase_order_cancel');

-- CreateEnum
CREATE TYPE "StockLedgerSourceType" AS ENUM ('product', 'sales_order', 'purchase_order');

-- CreateTable
CREATE TABLE "StockLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockLedgerEntryType" NOT NULL,
    "sourceType" "StockLedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_idx" ON "StockLedgerEntry"("companyId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_productId_idx" ON "StockLedgerEntry"("productId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_createdByUserId_idx" ON "StockLedgerEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_sourceType_sourceId_idx" ON "StockLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_productId_createdAt_idx" ON "StockLedgerEntry"("companyId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_sourceType_sourceId_idx" ON "StockLedgerEntry"("companyId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
