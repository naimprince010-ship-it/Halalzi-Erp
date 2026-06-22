/**
 * HAL-123: Sales-to-Finance Linkage Helpers
 *
 * These helpers run inside Prisma transactions to atomically link confirmed
 * sales orders to finance receivables, and to safely cancel those receivables
 * when a confirmed order is cancelled.
 *
 * All companyId values must come from the authenticated server session scope.
 * Never pass request-supplied companyId into these helpers.
 */

import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma } from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

type SalesOrderForLinkage = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: Prisma.Decimal | number;
};

/**
 * Creates a receivable linked to a newly-confirmed sales order.
 *
 * Must be called inside an active Prisma transaction *after* the sales order
 * has been updated to `confirmed` status and stock has been decremented.
 *
 * Returns the created receivable (id and status only; callers may log this).
 */
export async function createReceivableForConfirmedSalesOrder(
  tx: TransactionClient,
  companyId: string,
  salesOrder: SalesOrderForLinkage,
): Promise<{ id: string; status: string }> {
  const receivable = await tx.receivable.create({
    data: {
      companyId,
      salesOrderId: salesOrder.id,
      customerNameSnapshot: salesOrder.customerName,
      amount: Number(salesOrder.totalAmount),
      paidAmount: 0,
      status: "open",
      dueDate: null,
    },
    select: {
      id: true,
      status: true,
    },
  });

  return receivable;
}

/**
 * Finds the linked receivable for a confirmed sales order and cancels it
 * if it has no payments recorded.
 *
 * Must be called inside an active Prisma transaction.
 *
 * Throws a 400 AppError if the receivable has partial or full payments —
 * cancellation with recorded payments is blocked for MVP.
 *
 * Returns the receivable id and its new status, or null if no receivable
 * was linked (e.g. draft orders that never had a receivable).
 */
export async function cancelReceivableForSalesOrder(
  tx: TransactionClient,
  companyId: string,
  salesOrderId: string,
): Promise<{ id: string; status: string } | null> {
  const receivable = await tx.receivable.findFirst({
    where: {
      salesOrderId,
      companyId,
    },
    select: {
      id: true,
      paidAmount: true,
      status: true,
    },
  });

  if (!receivable) {
    // Draft cancellation or order with no linked receivable — safe to skip.
    return null;
  }

  if (Number(receivable.paidAmount) > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cannot cancel a confirmed sales order after receivable payments have been recorded.",
      400,
    );
  }

  const cancelled = await tx.receivable.update({
    where: { id: receivable.id },
    data: { status: "cancelled" },
    select: { id: true, status: true },
  });

  return cancelled;
}
