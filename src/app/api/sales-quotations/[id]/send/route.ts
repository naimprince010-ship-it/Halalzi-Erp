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
    const currentUser = await requirePermission("sales.quotations.send");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const updated = await prisma.salesQuotation.updateMany({
      where: {
        id,
        companyId: scope.companyId,
        status: "draft",
      },
      data: {
        status: "sent",
        sentAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      const existing = await prisma.salesQuotation.findFirst({ where: { id, companyId: scope.companyId }, select: { id: true, status: true } });
      if (!existing) throw notFoundError();
      throw new AppError("VALIDATION_ERROR", "Only draft quotations can be sent.", 400);
    }

    const quotation = await prisma.salesQuotation.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeSalesQuotationSelect,
    });

    if (!quotation) {
      throw notFoundError();
    }

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.send",
      entityType: "sales_quote",
      entityId: quotation.id,
      summary: `Sales quotation sent: ${quotation.quoteNumber}`,
      metadata: {
        quoteNumber: quotation.quoteNumber,
        status: quotation.status,
        totalAmount: Number(quotation.totalAmount),
      },
    });

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return errorResponse(error);
  }
}
