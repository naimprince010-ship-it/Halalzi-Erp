import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesOrderSelect } from "../../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this sales order.", 403);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.confirm");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const confirmed = await prisma.$transaction(async (tx) => {
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

      if (order.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft sales orders can be confirmed.", 400);
      }

      const productIds = [...new Set(order.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          companyId: scope.companyId,
        },
        select: {
          id: true,
          stockQuantity: true,
          status: true,
        },
      });

      if (products.length !== productIds.length) {
        throw new AppError("VALIDATION_ERROR", "One or more products are unavailable.", 400);
      }

      const productById = new Map(products.map((product) => [product.id, product]));

      for (const item of order.items) {
        const product = productById.get(item.productId);

        if (!product || product.status !== "active") {
          throw new AppError("VALIDATION_ERROR", "One or more products are unavailable.", 400);
        }

        if (product.stockQuantity < item.quantity) {
          throw new AppError(
            "VALIDATION_ERROR",
            `Insufficient stock for product ${item.productId}. Available ${product.stockQuantity}, required ${item.quantity}.`,
            400,
          );
        }
      }

      for (const item of order.items) {
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            companyId: scope.companyId,
            stockQuantity: { gte: item.quantity },
          },
          data: {
            stockQuantity: { decrement: item.quantity },
          },
        });

        if (updated.count !== 1) {
          throw new AppError("VALIDATION_ERROR", "Insufficient stock while confirming order.", 400);
        }
      }

      return tx.salesOrder.update({
        where: { id },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
        },
        select: safeSalesOrderSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_order.confirm",
      entityType: "sales_order",
      entityId: confirmed.id,
      summary: `Sales order confirmed: ${confirmed.orderNumber}`,
      metadata: {
        orderNumber: confirmed.orderNumber,
        status: confirmed.status,
        totalAmount: Number(confirmed.totalAmount),
      },
    });

    return NextResponse.json({ data: confirmed });
  } catch (error) {
    return errorResponse(error);
  }
}
