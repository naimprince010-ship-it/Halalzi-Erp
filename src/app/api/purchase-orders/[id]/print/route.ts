import { NextResponse } from "next/server";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePurchaseOrderSelect } from "../../_shared";

function forbiddenError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this purchase order.", 403);
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("purchases.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safePurchaseOrderSelect,
    });

    if (!purchaseOrder) {
      throw forbiddenError();
    }

    const html = renderPrintableDocument({
      title: "Purchase Order",
      documentNumber: purchaseOrder.purchaseOrderNumber,
      companyName: currentUser.company.name,
      partyLabel: "Vendor",
      partyName: purchaseOrder.vendorNameSnapshot,
      partyContact: purchaseOrder.vendorPhoneSnapshot,
      partyEmail: purchaseOrder.vendorEmailSnapshot,
      status: statusLabel(purchaseOrder.status),
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      notes: purchaseOrder.notes,
      subtotal: String(purchaseOrder.subtotal),
      discountAmount: String(purchaseOrder.discountAmount),
      totalAmount: String(purchaseOrder.totalAmount),
      unitAmountLabel: "Unit cost",
      lines: purchaseOrder.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: String(item.unitCost),
        lineTotal: String(item.lineTotal),
      })),
      meta: [
        {
          label: "Submitted",
          value: purchaseOrder.submittedAt ? purchaseOrder.submittedAt.toISOString() : null,
        },
        {
          label: "Approved",
          value: purchaseOrder.approvedAt ? purchaseOrder.approvedAt.toISOString() : null,
        },
        {
          label: "Approval note",
          value: purchaseOrder.approvalNote,
        },
        {
          label: "Rejection reason",
          value: purchaseOrder.rejectionReason,
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
