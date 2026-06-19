import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertCustomerInCompany, safeCustomerSelect } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.archive");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const existing = await assertCustomerInCompany(prisma, id, scope.companyId);

    if (existing.status === "archived") {
      throw new AppError("VALIDATION_ERROR", "This customer is already archived.", 400);
    }

    const customer = await prisma.customerContact.update({
      where: { id },
      data: { status: "archived" },
      select: safeCustomerSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.customer.archive",
      entityType: "customerContact",
      entityId: customer.id,
      summary: `CRM customer archived: ${customer.name}`,
      metadata: { status: customer.status },
    });

    return NextResponse.json({ customer });
  } catch (error) {
    return errorResponse(error);
  }
}
