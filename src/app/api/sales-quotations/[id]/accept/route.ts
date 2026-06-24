import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesQuotationSelect } from "../../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this quotation.", 403);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.quotations.accept");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const quotation = await prisma.salesQuotation.findFirst({
      where: { id, companyId: scope.companyId },
      select: { id: true, status: true, salesOrderId: true },
    });

    if (!quotation) throw notFoundError();
    if (quotation.status !== "draft" && quotation.status !== "sent") {
      throw new AppError("VALIDATION_ERROR", "Only draft or sent quotations can be accepted.", 400);
    }

    const updated = await prisma.salesQuotation.update({
      where: { id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
      },
      select: safeSalesQuotationSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.accept",
      entityType: "sales_quote",
      entityId: updated.id,
      summary: `Sales quotation accepted: ${updated.quoteNumber}`,
      metadata: {
        quoteNumber: updated.quoteNumber,
        status: updated.status,
        linkedSalesOrderId: updated.salesOrderId,
        totalAmount: Number(updated.totalAmount),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
