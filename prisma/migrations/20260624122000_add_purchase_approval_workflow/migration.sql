-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'rejected';

-- AlterTable
ALTER TABLE "PurchaseOrder"
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "submittedByUserId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedByUserId" TEXT,
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "approvalNote" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_status_idx" ON "PurchaseOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_submittedByUserId_idx" ON "PurchaseOrder"("submittedByUserId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_approvedByUserId_idx" ON "PurchaseOrder"("approvedByUserId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_rejectedByUserId_idx" ON "PurchaseOrder"("rejectedByUserId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
