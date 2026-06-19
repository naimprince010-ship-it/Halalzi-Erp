-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('active', 'won', 'lost', 'archived', 'cancelled');

-- CreateEnum
CREATE TYPE "SalesTaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "SalesTaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value" DECIMAL(12,2),
    "probability" INTEGER NOT NULL DEFAULT 50,
    "expectedCloseDate" TIMESTAMP(3),
    "currentStageId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerContactId" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'active',
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "probability" INTEGER,
    "value" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT,
    "leadId" TEXT,
    "customerContactId" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "SalesTaskStatus" NOT NULL DEFAULT 'pending',
    "priority" "SalesTaskPriority" NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineStage_companyId_idx" ON "PipelineStage"("companyId");

-- CreateIndex
CREATE INDEX "PipelineStage_companyId_sortOrder_idx" ON "PipelineStage"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "PipelineStage_isActive_idx" ON "PipelineStage"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_companyId_key_key" ON "PipelineStage"("companyId", "key");

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX "Deal_currentStageId_idx" ON "Deal"("currentStageId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_expectedCloseDate_idx" ON "Deal"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "Deal_leadId_idx" ON "Deal"("leadId");

-- CreateIndex
CREATE INDEX "Deal_customerContactId_idx" ON "Deal"("customerContactId");

-- CreateIndex
CREATE INDEX "Deal_companyId_status_idx" ON "Deal"("companyId", "status");

-- CreateIndex
CREATE INDEX "DealStageHistory_companyId_idx" ON "DealStageHistory"("companyId");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");

-- CreateIndex
CREATE INDEX "DealStageHistory_toStageId_idx" ON "DealStageHistory"("toStageId");

-- CreateIndex
CREATE INDEX "DealStageHistory_changedByUserId_idx" ON "DealStageHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "DealStageHistory_createdAt_idx" ON "DealStageHistory"("createdAt");

-- CreateIndex
CREATE INDEX "SalesTask_companyId_idx" ON "SalesTask"("companyId");

-- CreateIndex
CREATE INDEX "SalesTask_dealId_idx" ON "SalesTask"("dealId");

-- CreateIndex
CREATE INDEX "SalesTask_leadId_idx" ON "SalesTask"("leadId");

-- CreateIndex
CREATE INDEX "SalesTask_customerContactId_idx" ON "SalesTask"("customerContactId");

-- CreateIndex
CREATE INDEX "SalesTask_assignedToUserId_idx" ON "SalesTask"("assignedToUserId");

-- CreateIndex
CREATE INDEX "SalesTask_createdByUserId_idx" ON "SalesTask"("createdByUserId");

-- CreateIndex
CREATE INDEX "SalesTask_dueAt_idx" ON "SalesTask"("dueAt");

-- CreateIndex
CREATE INDEX "SalesTask_status_idx" ON "SalesTask"("status");

-- CreateIndex
CREATE INDEX "SalesTask_companyId_status_idx" ON "SalesTask"("companyId", "status");

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
