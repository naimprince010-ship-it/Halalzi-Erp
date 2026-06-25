import { NextResponse } from "next/server";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesQuotationSelect } from "../../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this quotation.", 403);
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

    const html = renderPrintableDocument({
      title: "Sales Quotation",
      documentNumber: quotation.quoteNumber,
      companyName: currentUser.company.name,
      partyLabel: "Customer",
      partyName: quotation.customerName,
      partyContact: quotation.customerPhone,
      partyEmail: quotation.customerEmail,
      partyAddress: quotation.customerAddress,
      status: statusLabel(quotation.status),
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
      notes: quotation.notes,
      subtotal: String(quotation.subtotal),
      discountAmount: String(quotation.discountAmount),
      totalAmount: String(quotation.totalAmount),
      unitAmountLabel: "Unit price",
      lines: quotation.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: String(item.unitPrice),
        lineTotal: String(item.lineTotal),
      })),
      meta: [
        {
          label: "Valid until",
          value: quotation.validUntil ? quotation.validUntil.toISOString() : null,
        },
        {
          label: "Sent",
          value: quotation.sentAt ? quotation.sentAt.toISOString() : null,
        },
        {
          label: "Accepted",
          value: quotation.acceptedAt ? quotation.acceptedAt.toISOString() : null,
        },
        {
          label: "Converted order",
          value: quotation.salesOrderId ? "Yes" : null,
        },
      ],
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
