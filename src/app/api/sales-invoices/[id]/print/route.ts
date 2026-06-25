import { NextResponse } from "next/server";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requireAnyPermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesInvoiceSelect } from "../../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this invoice.", 403);
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAnyPermission(["sales.invoices.read", "finance.read"]);
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const invoice = await prisma.salesInvoice.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeSalesInvoiceSelect,
    });

    if (!invoice) {
      throw notFoundError();
    }

    const html = renderPrintableDocument({
      title: "Sales Invoice",
      documentNumber: invoice.invoiceNumber,
      companyName: currentUser.company.name,
      partyLabel: "Customer",
      partyName: invoice.customerNameSnapshot,
      partyContact: invoice.customerPhoneSnapshot,
      partyEmail: invoice.customerEmailSnapshot,
      partyAddress: invoice.customerAddressSnapshot,
      status: statusLabel(invoice.status),
      createdAt: invoice.invoiceDate,
      updatedAt: invoice.updatedAt,
      notes: invoice.notes,
      subtotal: String(invoice.subtotal),
      discountAmount: String(invoice.discountAmount),
      totalAmount: String(invoice.totalAmount),
      unitAmountLabel: "Unit price",
      lines: invoice.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: String(item.unitPrice),
        lineTotal: String(item.lineTotal),
      })),
      meta: [
        {
          label: "Due date",
          value: invoice.dueDate ? invoice.dueDate.toISOString() : null,
        },
        {
          label: "Issued",
          value: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
        },
        {
          label: "Receivable",
          value: invoice.receivable ? statusLabel(invoice.receivable.status) : null,
        },
        {
          label: "Paid amount",
          value: invoice.receivable ? String(invoice.receivable.paidAmount) : null,
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
