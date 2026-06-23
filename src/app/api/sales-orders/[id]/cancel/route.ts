import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesOrderSelect } from "../../_shared";
import { cancelReceivableForSalesOrder } from "../../_finance-linkage";
import { recordStockLedgerEntry } from "@/app/api/products/_stock-ledger";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this sales order.", 403);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.cancel");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    let receivableId: string | null = null;
    let receivableStatus: string | null = null;
    let financeCancellationAction: string | null = null;
    const stockLedgerEntryIds: string[] = [];

    const cancelled = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
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

      if (!order) {
        throw notFoundError();
      }

      if (order.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Sales order is already cancelled.", 400);
      }

      if (order.status !== "draft" && order.status !== "confirmed") {
        throw new AppError("VALIDATION_ERROR", "Only draft or confirmed sales orders can be cancelled.", 400);
      }

      if (order.status === "confirmed") {
        // HAL-123: Handle the linked receivable before restoring stock.
        // This may throw a 400 if the receivable has recorded payments.
        const receivableResult = await cancelReceivableForSalesOrder(tx, scope.companyId, order.id);

        if (receivableResult) {
          receivableId = receivableResult.id;
          receivableStatus = receivableResult.status;
          financeCancellationAction = "receivable_cancelled";
        }

        for (const item of order.items) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              companyId: scope.companyId,
            },
            data: {
              stockQuantity: { increment: item.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new AppError("VALIDATION_ERROR", "Unable to restore stock for cancelled order.", 400);
          }

          const stockLedgerEntry = await recordStockLedgerEntry(tx, scope.companyId, {
            productId: item.productId,
            type: "sales_order_cancel",
            sourceType: "sales_order",
            sourceId: order.id,
            quantityDelta: item.quantity,
            createdByUserId: currentUser.user.id,
          });
          stockLedgerEntryIds.push(stockLedgerEntry.id);
        }
      }

      return tx.salesOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
        select: safeSalesOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_order.cancel",
      entityType: "sales_order",
      entityId: cancelled.id,
      summary: `Sales order cancelled: ${cancelled.orderNumber}`,
      metadata: {
        orderNumber: cancelled.orderNumber,
        status: cancelled.status,
        totalAmount: Number(cancelled.totalAmount),
        receivableId: receivableId,
        receivableStatus: receivableStatus,
        financeCancellationAction: financeCancellationAction,
        stockLedgerEntryIds: stockLedgerEntryIds.join(",") || null,
        stockMovementCount: stockLedgerEntryIds.length,
      },
    });

    return NextResponse.json({ data: cancelled });
  } catch (error) {
    return errorResponse(error);
  }
}
