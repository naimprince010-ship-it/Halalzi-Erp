CREATE TYPE "PosSessionStatus" AS ENUM ('open', 'closed');

CREATE TABLE "PosSession" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "cashierUserId" TEXT NOT NULL,
  "counterName" TEXT,
  "status" "PosSessionStatus" NOT NULL DEFAULT 'open',
  "openingFloat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "closingCash" DECIMAL(12,2),
  "expectedCash" DECIMAL(12,2),
  "variance" DECIMAL(12,2),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PosSale" ADD COLUMN "posSessionId" TEXT;

CREATE INDEX "PosSession_companyId_idx" ON "PosSession"("companyId");
CREATE INDEX "PosSession_companyId_status_idx" ON "PosSession"("companyId", "status");
CREATE INDEX "PosSession_cashierUserId_idx" ON "PosSession"("cashierUserId");
CREATE INDEX "PosSession_companyId_cashierUserId_status_idx" ON "PosSession"("companyId", "cashierUserId", "status");
CREATE INDEX "PosSession_openedAt_idx" ON "PosSession"("openedAt");
CREATE INDEX "PosSession_closedAt_idx" ON "PosSession"("closedAt");
CREATE INDEX "PosSale_posSessionId_idx" ON "PosSale"("posSessionId");

ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSession" ADD CONSTRAINT "PosSession_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "PosSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
