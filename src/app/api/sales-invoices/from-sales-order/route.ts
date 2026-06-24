import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { findOrCreateReceivableForSalesOrder } from "@/app/api/sales-orders/_finance-linkage";
import { createSalesInvoiceFromOrderSchema, generateInvoiceNumber, safeSalesInvoiceSelect } from "../_shared";

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("sales.invoices.create");
    const scope = companyScope(currentUser);
    const parsed = createSalesInvoiceFromOrderSchema.safeParse(await request.json());

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

    const invoice = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.salesInvoice.findFirst({
        where: {
          companyId: scope.companyId,
          salesOrderId: parsed.data.salesOrderId,
        },
        select: { id: true },
      });

      if (existingInvoice) {
        throw new AppError("VALIDATION_ERROR", "An invoice already exists for this sales order.", 400);
      }

      const salesOrder = await tx.salesOrder.findFirst({
        where: {
          id: parsed.data.salesOrderId,
          companyId: scope.companyId,
          status: { in: ["confirmed", "completed"] },
        },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          customerAddress: true,
          subtotal: true,
          discountAmount: true,
          totalAmount: true,
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

      if (!salesOrder) {
        throw new AppError("FORBIDDEN", "You do not have permission to invoice this sales order.", 403);
      }

      if (parsed.data.quotationId) {
        const quotation = await tx.salesQuotation.findFirst({
          where: {
            id: parsed.data.quotationId,
            companyId: scope.companyId,
          },
          select: {
            id: true,
            salesOrderId: true,
            status: true,
          },
        });

        if (!quotation) {
          throw new AppError("FORBIDDEN", "You do not have permission to use this quotation.", 403);
        }

        if (quotation.salesOrderId && quotation.salesOrderId !== salesOrder.id) {
          throw new AppError("VALIDATION_ERROR", "The selected quotation is already linked to another sales order.", 400);
        }
      }

      const receivable = await findOrCreateReceivableForSalesOrder(tx, scope.companyId, {
        id: salesOrder.id,
        orderNumber: salesOrder.orderNumber,
        customerName: salesOrder.customerName,
        totalAmount: salesOrder.totalAmount,
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const invoiceNumber = generateInvoiceNumber();

        try {
          return await tx.salesInvoice.create({
            data: {
              companyId: scope.companyId,
              salesOrderId: salesOrder.id,
              quotationId: parsed.data.quotationId ?? null,
              receivableId: receivable.id,
              invoiceNumber,
              customerNameSnapshot: salesOrder.customerName,
              customerPhoneSnapshot: salesOrder.customerPhone,
              customerEmailSnapshot: salesOrder.customerEmail,
              customerAddressSnapshot: salesOrder.customerAddress,
              status: "issued",
              invoiceDate: new Date(),
              dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
              subtotal: salesOrder.subtotal,
              discountAmount: salesOrder.discountAmount,
              totalAmount: salesOrder.totalAmount,
              notes: parsed.data.notes?.trim() || null,
              issuedAt: new Date(),
              items: {
                create: salesOrder.items.map((item) => ({
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot,
                  productSkuSnapshot: item.productSkuSnapshot,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  lineTotal: item.lineTotal,
                })),
              },
            },
            select: safeSalesInvoiceSelect,
          });
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002" && attempt < 4) {
            continue;
          }
          throw error;
        }
      }

      throw new AppError("INTERNAL_SERVER_ERROR", "Unable to generate invoice number.", 500);
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_invoice.create",
      entityType: "sales_invoice",
      entityId: invoice.id,
      summary: `Sales invoice created: ${invoice.invoiceNumber}`,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        linkedSalesOrderId: invoice.salesOrderId,
        linkedQuotationId: invoice.quotationId,
        linkedReceivableId: invoice.receivableId,
        totalAmount: Number(invoice.totalAmount),
      },
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_invoice.link_receivable",
      entityType: "sales_invoice",
      entityId: invoice.id,
      summary: `Sales invoice linked to receivable: ${invoice.invoiceNumber}`,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        linkedReceivableId: invoice.receivableId,
        linkedSalesOrderId: invoice.salesOrderId,
      },
    });

    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
