import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePurchaseOrderSelect } from "../../_shared";

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

    const cancelled = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!purchaseOrder) {
        throw forbiddenError();
      }

      if (purchaseOrder.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Purchase order is already cancelled.", 400);
      }

      if (purchaseOrder.status === "received") {
        throw new AppError("VALIDATION_ERROR", "Received purchase orders cannot be cancelled in MVP.", 400);
      }

      if (purchaseOrder.status !== "draft" && purchaseOrder.status !== "ordered") {
        throw new AppError("VALIDATION_ERROR", "Only draft or ordered purchase orders can be cancelled.", 400);
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
      },
    });

    return NextResponse.json({ purchaseOrder: cancelled });
  } catch (error) {
    return errorResponse(error);
  }
}
