import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { approvalNoteSchema, safePurchaseOrderSelect } from "../../_shared";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.approve");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const json = await request.json().catch(() => ({}));
    const parsed = approvalNoteSchema.safeParse(json);

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

    const approved = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id, companyId: scope.companyId },
        select: { id: true, status: true },
      });

      if (!purchaseOrder) {
        throw forbiddenError();
      }

      if (purchaseOrder.status !== "pending_approval") {
        throw new AppError("VALIDATION_ERROR", "Only pending approval purchase orders can be approved.", 400);
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedByUserId: currentUser.user.id,
          approvalNote: parsed.data.note?.trim() || null,
          rejectedAt: null,
          rejectedByUserId: null,
          rejectionReason: null,
        },
        select: safePurchaseOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "purchase_order.approve",
      entityType: "purchase_order",
      entityId: approved.id,
      summary: `Purchase order approved: ${approved.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: approved.purchaseOrderNumber,
        previousStatus: "pending_approval",
        status: approved.status,
        approvedAt: approved.approvedAt?.toISOString() ?? null,
        approvedByUserId: currentUser.user.id,
        approvalNote: approved.approvalNote,
        totalAmount: Number(approved.totalAmount),
      },
    });

    return NextResponse.json({ purchaseOrder: approved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    return errorResponse(error);
  }
}
