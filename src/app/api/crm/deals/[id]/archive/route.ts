import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertDealInCompany, safeDealSelect } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.deals.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const existing = await assertDealInCompany(prisma, id, scope.companyId);

    if (existing.status === "archived") {
      throw new AppError("VALIDATION_ERROR", "Deal is already archived.", 400);
    }

    const deal = await prisma.deal.update({
      where: { id },
      data: { status: "archived", archivedAt: new Date() },
      select: safeDealSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.deal.archive",
      entityType: "deal",
      entityId: deal.id,
      summary: `CRM deal archived: ${deal.name}`,
      metadata: { previousStatus: existing.status },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    return errorResponse(error);
  }
}
