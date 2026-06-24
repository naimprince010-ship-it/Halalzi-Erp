-- CreateEnum
CREATE TYPE "FinanceAccountKind" AS ENUM ('general', 'cash', 'bank', 'mobile_money');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('posted', 'reversed');

-- AlterTable
ALTER TABLE "FinanceAccount"
ADD COLUMN "kind" "FinanceAccountKind" NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "ReceivablePayment"
ADD COLUMN "accountId" TEXT,
ADD COLUMN "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "PayablePayment"
ADD COLUMN "accountId" TEXT,
ADD COLUMN "journalEntryId" TEXT;

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'posted',
    "method" "FinancePaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "reference" TEXT,
    "note" TEXT,
    "categoryAccountId" TEXT NOT NULL,
    "paidFromAccountId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "reversalJournalEntryId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "reversedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_kind_idx" ON "FinanceAccount"("kind");

-- CreateIndex
CREATE INDEX "ReceivablePayment_accountId_idx" ON "ReceivablePayment"("accountId");

-- CreateIndex
CREATE INDEX "ReceivablePayment_journalEntryId_idx" ON "ReceivablePayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "PayablePayment_accountId_idx" ON "PayablePayment"("accountId");

-- CreateIndex
CREATE INDEX "PayablePayment_journalEntryId_idx" ON "PayablePayment"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_expenseNumber_key" ON "Expense"("companyId", "expenseNumber");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_categoryAccountId_idx" ON "Expense"("categoryAccountId");

-- CreateIndex
CREATE INDEX "Expense_paidFromAccountId_idx" ON "Expense"("paidFromAccountId");

-- CreateIndex
CREATE INDEX "Expense_journalEntryId_idx" ON "Expense"("journalEntryId");

-- CreateIndex
CREATE INDEX "Expense_reversalJournalEntryId_idx" ON "Expense"("reversalJournalEntryId");

-- AddForeignKey
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryAccountId_fkey" FOREIGN KEY ("categoryAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
