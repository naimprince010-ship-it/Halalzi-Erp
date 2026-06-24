import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeOrderTotals,
  computeOrderTotalsFromSubtotal,
  createPreparedQuotationItems,
  normalizeNullableText,
  safeSalesQuotationSelect,
  updateSalesQuotationSchema,
} from "../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this quotation.", 403);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.quotations.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const quotation = await prisma.salesQuotation.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeSalesQuotationSelect,
    });

    if (!quotation) {
      throw notFoundError();
    }

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.quotations.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const json = await request.json();
    const parsed = updateSalesQuotationSchema.safeParse(json);

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
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a quotation.", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.salesQuotation.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw notFoundError();
      }

      if (existing.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft quotations can be updated.", 400);
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
        preparedItems = await createPreparedQuotationItems(tx, scope.companyId, parsed.data.items);
        totals = computeOrderTotals(preparedItems, parsed.data.discountAmount);

        await tx.salesQuotationItem.deleteMany({
          where: {
            quotationId: id,
          },
        });
      } else if (parsed.data.discountAmount !== undefined) {
        const currentItems = await tx.salesQuotationItem.findMany({
          where: { quotationId: id },
          select: {
            lineTotal: true,
          },
        });

        const subtotal = currentItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
        totals = computeOrderTotalsFromSubtotal(subtotal, parsed.data.discountAmount);
      }

      return tx.salesQuotation.update({
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
          ...(parsed.data.validUntil !== undefined
            ? { validUntil: parsed.data.validUntil === null ? null : new Date(parsed.data.validUntil) }
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
        select: safeSalesQuotationSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.update",
      entityType: "sales_quote",
      entityId: updated.id,
      summary: `Sales quotation updated: ${updated.quoteNumber}`,
      metadata: {
        quoteNumber: updated.quoteNumber,
        status: updated.status,
        totalAmount: Number(updated.totalAmount),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
