import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePurchaseOrderSelect } from "../../_shared";
import { cancelPayableForPurchaseOrder } from "../../_finance-linkage";
import { recordStockLedgerEntry } from "@/app/api/products/_stock-ledger";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.cancel");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    let payableId: string | null = null;
    let payableStatus: string | null = null;
    let financeCancellationAction: string | null = null;
    const stockLedgerEntryIds: string[] = [];

    const cancelled = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!purchaseOrder) {
        throw forbiddenError();
      }

      if (purchaseOrder.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Purchase order is already cancelled.", 400);
      }

      if (
        purchaseOrder.status !== "draft" &&
        purchaseOrder.status !== "pending_approval" &&
        purchaseOrder.status !== "approved" &&
        purchaseOrder.status !== "rejected" &&
        purchaseOrder.status !== "ordered" &&
        purchaseOrder.status !== "received"
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Only draft, pending approval, approved, rejected, ordered, or received purchase orders can be cancelled.",
          400,
        );
      }

      if (purchaseOrder.status === "received") {
        // HAL-124: Handle the linked payable before restoring stock.
        // This may throw a 400 if the payable has recorded payments.
        const payableResult = await cancelPayableForPurchaseOrder(tx, scope.companyId, purchaseOrder.id);

        if (payableResult) {
          payableId = payableResult.id;
          payableStatus = payableResult.status;
          financeCancellationAction = "payable_cancelled";
        }

        for (const item of purchaseOrder.items) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              companyId: scope.companyId,
            },
            data: {
              stockQuantity: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new AppError("VALIDATION_ERROR", "Unable to restore stock for cancelled purchase order.", 400);
          }

          const stockLedgerEntry = await recordStockLedgerEntry(tx, scope.companyId, {
            productId: item.productId,
            type: "purchase_order_cancel",
            sourceType: "purchase_order",
            sourceId: purchaseOrder.id,
            quantityDelta: -item.quantity,
            createdByUserId: currentUser.user.id,
          });
          stockLedgerEntryIds.push(stockLedgerEntry.id);
        }
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
        select: safePurchaseOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "purchase_order.cancel",
      entityType: "purchase_order",
      entityId: cancelled.id,
      summary: `Purchase order cancelled: ${cancelled.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: cancelled.purchaseOrderNumber,
        status: cancelled.status,
        totalAmount: Number(cancelled.totalAmount),
        payableId: payableId,
        payableStatus: payableStatus,
        financeCancellationAction: financeCancellationAction,
        stockLedgerEntryIds: stockLedgerEntryIds.join(",") || null,
        stockMovementCount: stockLedgerEntryIds.length,
      },
    });

    return NextResponse.json({ purchaseOrder: cancelled });
  } catch (error) {
    return errorResponse(error);
  }
}
