import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computePurchaseTotals,
  computePurchaseTotalsFromSubtotal,
  isUniqueConstraintError,
  preparePurchaseItems,
  resolvePurchaseVendor,
  safePurchaseOrderSelect,
  updatePurchaseOrderSchema,
} from "../_shared";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: scope.companyId },
      select: safePurchaseOrderSelect,
    });

    if (!purchaseOrder) {
      throw forbiddenError();
    }

    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("purchases.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const json = await request.json();
    const parsed = updatePurchaseOrderSchema.safeParse(json);

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

    if (Object.keys(parsed.data).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a purchase order.", 400);
    }

    let previousStatus: string | null = null;
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findFirst({
        where: { id, companyId: scope.companyId },
        select: { id: true, status: true, subtotal: true },
      });

      if (!existing) {
        throw forbiddenError();
      }

      previousStatus = existing.status;

      const wantsMarkOrdered = parsed.data.status === "ordered";
      const hasNonStatusUpdates = Object.keys(parsed.data).some((key) => key !== "status");

      if (parsed.data.status !== undefined && !wantsMarkOrdered) {
        throw new AppError("VALIDATION_ERROR", "Invalid purchase order status transition.", 400);
      }

      if (wantsMarkOrdered) {
        if (hasNonStatusUpdates) {
          throw new AppError("VALIDATION_ERROR", "Mark ordered cannot be combined with draft edits.", 400);
        }

        if (existing.status !== "approved") {
          throw new AppError("VALIDATION_ERROR", "Only approved purchase orders can be marked ordered.", 400);
        }
      } else if (existing.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft purchase orders can be updated.", 400);
      }

      let vendorData:
        | { vendorId: string; vendorNameSnapshot: string; vendorPhoneSnapshot: string | null; vendorEmailSnapshot: string | null }
        | undefined;

      if (parsed.data.vendorId) {
        const vendor = await resolvePurchaseVendor(tx, parsed.data.vendorId, scope.companyId);
        vendorData = {
          vendorId: vendor.id,
          vendorNameSnapshot: vendor.name,
          vendorPhoneSnapshot: vendor.phone ?? null,
          vendorEmailSnapshot: vendor.email ?? null,
        };
      }

      let totals:
        | { subtotal: number; discountAmount: number; totalAmount: number }
        | undefined;
      let preparedItems:
        | Array<{
            productId: string;
            productNameSnapshot: string;
            productSkuSnapshot: string;
            quantity: number;
            unitCost: number;
            lineTotal: number;
          }>
        | undefined;

      if (parsed.data.items) {
        preparedItems = await preparePurchaseItems(tx, scope.companyId, parsed.data.items);
        totals = computePurchaseTotals(preparedItems, parsed.data.discountAmount);

        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      } else if (parsed.data.discountAmount !== undefined) {
        const currentItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: id },
          select: { lineTotal: true },
        });
        const subtotal = currentItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
        totals = computePurchaseTotalsFromSubtotal(subtotal, parsed.data.discountAmount);
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(vendorData ?? {}),
          ...(parsed.data.status === "ordered" ? { status: "ordered", orderedAt: new Date() } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes?.trim() || null } : {}),
          ...(totals
            ? {
                subtotal: totals.subtotal,
                discountAmount: totals.discountAmount,
                totalAmount: totals.totalAmount,
              }
            : {}),
          ...(preparedItems
            ? {
                items: {
                  create: preparedItems.map((item) => ({
                    productId: item.productId,
                    productNameSnapshot: item.productNameSnapshot,
                    productSkuSnapshot: item.productSkuSnapshot,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    lineTotal: item.lineTotal,
                  })),
                },
              }
            : {}),
        },
        select: safePurchaseOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: parsed.data.status === "ordered" ? "purchase_order.mark_ordered" : "purchase_order.update",
      entityType: "purchase_order",
      entityId: updated.id,
      summary: `Purchase order updated: ${updated.purchaseOrderNumber}`,
      metadata: {
        purchaseOrderNumber: updated.purchaseOrderNumber,
        previousStatus: previousStatus,
        status: updated.status,
        totalAmount: Number(updated.totalAmount),
      },
    });

    return NextResponse.json({ purchaseOrder: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A purchase order with this number already exists.", 409),
      );
    }

    return errorResponse(error);
  }
}
