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
    const currentUser = await requirePermission("purchases.submit");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const submitted = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id, companyId: scope.companyId },
        select: {
          id: true,
          status: true,
          purchaseOrderNumber: true,
          subtotal: true,
          totalAmount: true,
          _count: { select: { items: true } },
        },
      });

      if (!purchaseOrder) {
        throw forbiddenError();
      }

      if (purchaseOrder.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft purchase orders can be submitted for approval.", 400);
      }

      if (purchaseOrder._count.items < 1) {
        throw new AppError("VALIDATION_ERROR", "Purchase order must have at least one item before approval.", 400);
      }

      if (Number(purchaseOrder.totalAmount) < 0) {
        throw new AppError("VALIDATION_ERROR", "Purchase order total must be valid before approval.", 400);
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "pending_approval",
          submittedAt: new Date(),
          submittedByUserId: currentUser.user.id,
          approvedAt: null,
          approvedByUserId: null,
          rejectedAt: null,
          rejectedByUserId: null,
          approvalNote: null,
          rejectionReason: null,
        },
        select: safePurchaseOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "purchase_order.submit",
      entityType: "purchase_order",
      entityId: submitted.id,
      summary: `Purchase order submitted for approval: ${submitted.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: submitted.purchaseOrderNumber,
        previousStatus: "draft",
        status: submitted.status,
        submittedAt: submitted.submittedAt?.toISOString() ?? null,
        submittedByUserId: currentUser.user.id,
        totalAmount: Number(submitted.totalAmount),
      },
    });

    return NextResponse.json({ purchaseOrder: submitted });
  } catch (error) {
    return errorResponse(error);
  }
}
