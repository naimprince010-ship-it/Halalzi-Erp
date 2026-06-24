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
    const currentUser = await requirePermission("sales.quotations.reject");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const quotation = await prisma.salesQuotation.findFirst({
      where: { id, companyId: scope.companyId },
      select: { id: true, status: true },
    });

    if (!quotation) throw notFoundError();
    if (quotation.status !== "draft" && quotation.status !== "sent") {
      throw new AppError("VALIDATION_ERROR", "Only draft or sent quotations can be rejected.", 400);
    }

    const updated = await prisma.salesQuotation.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
      },
      select: safeSalesQuotationSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.reject",
      entityType: "sales_quote",
      entityId: updated.id,
      summary: `Sales quotation rejected: ${updated.quoteNumber}`,
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
