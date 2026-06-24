import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { generateOrderNumber, isUniqueConstraintError, safeSalesOrderSelect } from "@/app/api/sales-orders/_shared";
import { safeSalesQuotationSelect } from "../../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this quotation.", 403);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.quotations.convert");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    let createdOrderId: string | null = null;
    const quotation = await prisma.$transaction(async (tx) => {
      const existing = await tx.salesQuotation.findFirst({
        where: { id, companyId: scope.companyId },
        select: {
          id: true,
          quoteNumber: true,
          salesOrderId: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          customerAddress: true,
          status: true,
          subtotal: true,
          discountAmount: true,
          totalAmount: true,
          notes: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              productId: true,
              productNameSnapshot: true,
              productSkuSnapshot: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
            },
          },
        },
      });

      if (!existing) throw notFoundError();
      if (existing.status !== "accepted") {
        throw new AppError("VALIDATION_ERROR", "Only accepted quotations can be converted to a sales order.", 400);
      }
      if (existing.salesOrderId) {
        throw new AppError("VALIDATION_ERROR", "This quotation has already been converted to a sales order.", 400);
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderNumber = generateOrderNumber();

        try {
          const order = await tx.salesOrder.create({
            data: {
              companyId: scope.companyId,
              orderNumber,
              customerName: existing.customerName,
              customerPhone: existing.customerPhone,
              customerEmail: existing.customerEmail,
              customerAddress: existing.customerAddress,
              status: "draft",
              subtotal: existing.subtotal,
              discountAmount: existing.discountAmount,
              totalAmount: existing.totalAmount,
              notes: existing.notes,
              items: {
                create: existing.items.map((item) => ({
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot,
                  productSkuSnapshot: item.productSkuSnapshot,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  lineTotal: item.lineTotal,
                })),
              },
            },
            select: safeSalesOrderSelect,
          });

          createdOrderId = order.id;

          return await tx.salesQuotation.update({
            where: { id: existing.id },
            data: {
              salesOrderId: order.id,
            },
            select: safeSalesQuotationSelect,
          });
        } catch (error) {
          if (attempt < 4 && isUniqueConstraintError(error)) {
            continue;
          }

          throw error;
        }
      }

      throw new AppError("INTERNAL_SERVER_ERROR", "Unable to generate sales order number.", 500);
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.convert_to_sales_order",
      entityType: "sales_quote",
      entityId: quotation.id,
      summary: `Sales quotation converted: ${quotation.quoteNumber}`,
      metadata: {
        quoteNumber: quotation.quoteNumber,
        status: quotation.status,
        linkedSalesOrderId: createdOrderId,
        totalAmount: Number(quotation.totalAmount),
      },
    });

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return errorResponse(error);
  }
}
