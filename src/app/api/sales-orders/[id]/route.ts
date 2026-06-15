import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeOrderTotals,
  computeOrderTotalsFromSubtotal,
  normalizeNullableText,
  prepareOrderItems,
  safeSalesOrderSelect,
  updateSalesOrderSchema,
} from "../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this sales order.", 403);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const salesOrder = await prisma.salesOrder.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeSalesOrderSelect,
    });

    if (!salesOrder) {
      throw notFoundError();
    }

    return NextResponse.json({ data: salesOrder });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const json = await request.json();
    const parsed = updateSalesOrderSchema.safeParse(json);

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
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a sales order.", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.salesOrder.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existingOrder) {
        throw notFoundError();
      }

      if (existingOrder.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft sales orders can be updated.", 400);
      }

      let totals:
        | {
            subtotal: number;
            discountAmount: number;
            totalAmount: number;
          }
        | undefined;
      let preparedItems:
        | Array<{
            productId: string;
            productNameSnapshot: string;
            productSkuSnapshot: string;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
          }>
        | undefined;

      if (parsed.data.items) {
        preparedItems = await prepareOrderItems(tx, scope.companyId, parsed.data.items);
        totals = computeOrderTotals(preparedItems, parsed.data.discountAmount);

        await tx.salesOrderItem.deleteMany({
          where: {
            salesOrderId: id,
          },
        });
      } else if (parsed.data.discountAmount !== undefined) {
        const currentItems = await tx.salesOrderItem.findMany({
          where: { salesOrderId: id },
          select: {
            lineTotal: true,
          },
        });

        const subtotal = currentItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
        totals = computeOrderTotalsFromSubtotal(subtotal, parsed.data.discountAmount);
      }

      return tx.salesOrder.update({
        where: { id },
        data: {
          ...(parsed.data.customerName !== undefined ? { customerName: parsed.data.customerName } : {}),
          ...(parsed.data.customerPhone !== undefined
            ? { customerPhone: normalizeNullableText(parsed.data.customerPhone) }
            : {}),
          ...(parsed.data.customerEmail !== undefined
            ? { customerEmail: normalizeNullableText(parsed.data.customerEmail) }
            : {}),
          ...(parsed.data.customerAddress !== undefined
            ? { customerAddress: normalizeNullableText(parsed.data.customerAddress) }
            : {}),
          ...(parsed.data.notes !== undefined ? { notes: normalizeNullableText(parsed.data.notes) } : {}),
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
                    unitPrice: item.unitPrice,
                    lineTotal: item.lineTotal,
                  })),
                },
              }
            : {}),
        },
        select: safeSalesOrderSelect,
      });
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
