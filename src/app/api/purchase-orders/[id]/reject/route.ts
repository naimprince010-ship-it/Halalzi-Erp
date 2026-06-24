import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { rejectionReasonSchema, safePurchaseOrderSelect } from "../../_shared";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.reject");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const json = await request.json().catch(() => ({}));
    const parsed = rejectionReasonSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the submitted fields.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const rejected = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id, companyId: scope.companyId },
        select: { id: true, status: true },
      });

      if (!purchaseOrder) {
        throw forbiddenError();
      }

      if (purchaseOrder.status !== "pending_approval") {
        throw new AppError("VALIDATION_ERROR", "Only pending approval purchase orders can be rejected.", 400);
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedByUserId: currentUser.user.id,
          rejectionReason: parsed.data.reason.trim(),
          approvedAt: null,
          approvedByUserId: null,
          approvalNote: null,
        },
        select: safePurchaseOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "purchase_order.reject",
      entityType: "purchase_order",
      entityId: rejected.id,
      summary: `Purchase order rejected: ${rejected.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: rejected.purchaseOrderNumber,
        previousStatus: "pending_approval",
        status: rejected.status,
        rejectedAt: rejected.rejectedAt?.toISOString() ?? null,
        rejectedByUserId: currentUser.user.id,
        rejectionReason: rejected.rejectionReason,
        totalAmount: Number(rejected.totalAmount),
      },
    });

    return NextResponse.json({ purchaseOrder: rejected });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    return errorResponse(error);
  }
}
