-- AddUniqueConstraint: Receivable.salesOrderId
-- Prevents duplicate receivables from concurrent or repeated sales order confirmation.

CREATE UNIQUE INDEX "Receivable_salesOrderId_key" ON "Receivable"("salesOrderId");
