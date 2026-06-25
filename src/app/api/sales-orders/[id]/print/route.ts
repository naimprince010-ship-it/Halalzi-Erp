import { NextResponse } from "next/server";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesOrderSelect } from "../../_shared";

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

    const html = renderPrintableDocument({
      title: "Sales Order",
      documentNumber: salesOrder.orderNumber,
      companyName: currentUser.company.name,
      partyLabel: "Customer",
      partyName: salesOrder.customerName,
      partyContact: salesOrder.customerPhone,
      partyEmail: salesOrder.customerEmail,
      partyAddress: salesOrder.customerAddress,
      status: salesOrder.status,
      createdAt: salesOrder.createdAt,
      updatedAt: salesOrder.updatedAt,
      notes: salesOrder.notes,
      subtotal: String(salesOrder.subtotal),
      discountAmount: String(salesOrder.discountAmount),
      totalAmount: String(salesOrder.totalAmount),
      unitAmountLabel: "Unit price",
      lines: salesOrder.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: String(item.unitPrice),
        lineTotal: String(item.lineTotal),
      })),
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
