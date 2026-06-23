import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePurchaseOrderSelect } from "../../_shared";
import { createPayableForReceivedPurchaseOrder } from "../../_finance-linkage";
import { recordStockLedgerEntry } from "@/app/api/products/_stock-ledger";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.receive");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    let payableId: string | null = null;
    const stockLedgerEntryIds: string[] = [];

    const received = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
          vendorNameSnapshot: true,
          totalAmount: true,
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

      if (purchaseOrder.status === "received") {
        throw new AppError("VALIDATION_ERROR", "Purchase order is already received.", 400);
      }

      if (purchaseOrder.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Cancelled purchase orders cannot be received.", 400);
      }

      if (purchaseOrder.status !== "ordered") {
        throw new AppError("VALIDATION_ERROR", "Only ordered purchase orders can be received.", 400);
      }

      for (const item of purchaseOrder.items) {
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
          throw new AppError("FORBIDDEN", "One or more products are not accessible.", 403);
        }

        const stockLedgerEntry = await recordStockLedgerEntry(tx, scope.companyId, {
          productId: item.productId,
          type: "purchase_order_receive",
          sourceType: "purchase_order",
          sourceId: purchaseOrder.id,
          quantityDelta: item.quantity,
          createdByUserId: currentUser.user.id,
        });
        stockLedgerEntryIds.push(stockLedgerEntry.id);
      }

      const updatedOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "received",
          receivedAt: new Date(),
        },
        select: safePurchaseOrderSelect,
      });

      // HAL-124: Create the linked payable in the same transaction.
      // companyId always comes from the authenticated scope — never from the request.
      const payable = await createPayableForReceivedPurchaseOrder(tx, scope.companyId, {
        id: updatedOrder.id,
        vendorNameSnapshot: updatedOrder.vendorNameSnapshot,
        totalAmount: updatedOrder.totalAmount,
      });

      payableId = payable.id;

      return updatedOrder;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "purchase_order.receive",
      entityType: "purchase_order",
      entityId: received.id,
      summary: `Purchase order received: ${received.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: received.purchaseOrderNumber,
        status: received.status,
        totalAmount: Number(received.totalAmount),
        payableId: payableId ?? null,
        financeLinkageCreated: true,
        stockLedgerEntryIds: stockLedgerEntryIds.join(",") || null,
        stockMovementCount: stockLedgerEntryIds.length,
      },
    });

    return NextResponse.json({ purchaseOrder: received });
  } catch (error) {
    return errorResponse(error);
  }
}
