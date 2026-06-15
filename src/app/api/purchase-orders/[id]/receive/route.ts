import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
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
    const currentUser = await requirePermission("purchases.receive");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const received = await prisma.$transaction(async (tx) => {
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
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "received",
          receivedAt: new Date(),
        },
        select: safePurchaseOrderSelect,
      });
    });

    return NextResponse.json({ purchaseOrder: received });
  } catch (error) {
    return errorResponse(error);
  }
}
