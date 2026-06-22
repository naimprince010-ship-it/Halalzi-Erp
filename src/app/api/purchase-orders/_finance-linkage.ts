/**
 * HAL-124: Procurement-to-Finance Linkage Helpers
 *
 * These helpers run inside Prisma transactions to atomically link received
 * purchase orders to finance payables, and to safely cancel those payables
 * when a purchase order is cancelled.
 *
 * All companyId values must come from the authenticated server session scope.
 * Never pass request-supplied companyId into these helpers.
 */

import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma } from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

type PurchaseOrderForLinkage = {
  id: string;
  vendorNameSnapshot: string | null;
  totalAmount: Prisma.Decimal | number;
};

/**
 * Creates a payable linked to a newly-received purchase order.
 *
 * Must be called inside an active Prisma transaction *after* the purchase order
 * has been updated to `received` status and stock has been incremented.
 *
 * Returns the created payable (id and status only; callers may log this).
 */
export async function createPayableForReceivedPurchaseOrder(
  tx: TransactionClient,
  companyId: string,
  purchaseOrder: PurchaseOrderForLinkage,
): Promise<{ id: string; status: string }> {
  const payable = await tx.payable.create({
    data: {
      companyId,
      purchaseOrderId: purchaseOrder.id,
      vendorNameSnapshot: purchaseOrder.vendorNameSnapshot || "Unknown Vendor",
      amount: Number(purchaseOrder.totalAmount),
      paidAmount: 0,
      status: "open",
      dueDate: null,
    },
    select: {
      id: true,
      status: true,
    },
  });

  return payable;
}

/**
 * Finds the linked payable for a purchase order and cancels it
 * if it has no payments recorded.
 *
 * Must be called inside an active Prisma transaction.
 *
 * Throws a 400 AppError if the payable has partial or full payments —
 * cancellation with recorded payments is blocked for MVP.
 *
 * Returns the payable id and its new status, or null if no payable
 * was linked (e.g. draft/ordered orders that never had a payable).
 */
export async function cancelPayableForPurchaseOrder(
  tx: TransactionClient,
  companyId: string,
  purchaseOrderId: string,
): Promise<{ id: string; status: string } | null> {
  const payable = await tx.payable.findFirst({
    where: {
      purchaseOrderId,
      companyId,
    },
    select: {
      id: true,
      paidAmount: true,
      status: true,
    },
  });

  if (!payable) {
    // Cancellation of ordered/draft POs with no linked payable — safe to skip.
    return null;
  }

  if (Number(payable.paidAmount) > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cannot cancel a purchase order after payable payments have been recorded.",
      400,
    );
  }

  const cancelled = await tx.payable.update({
    where: { id: payable.id },
    data: { status: "cancelled" },
    select: { id: true, status: true },
  });

  return cancelled;
}
