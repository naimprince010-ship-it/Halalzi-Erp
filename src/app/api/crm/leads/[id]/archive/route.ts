import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertLeadInCompany, safeLeadSelect } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.archive");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const lead = await prisma.$transaction(async (tx) => {
      const existing = await assertLeadInCompany(tx, id, scope.companyId);

      if (existing.status === "archived") {
        throw new AppError("VALIDATION_ERROR", "This lead is already archived.", 400);
      }

      const archived = await tx.lead.update({
        where: { id },
        data: { status: "archived" },
        select: safeLeadSelect,
      });

      await tx.leadActivity.create({
        data: {
          companyId: scope.companyId,
          leadId: id,
          userId: currentUser.user.id,
          type: "archive",
          note: "Lead archived.",
        },
      });

      return archived;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.lead.archive",
      entityType: "lead",
      entityId: lead.id,
      summary: `CRM lead archived: ${lead.name}`,
      metadata: { status: lead.status },
    });

    return NextResponse.json({ lead });
  } catch (error) {
    return errorResponse(error);
  }
}
