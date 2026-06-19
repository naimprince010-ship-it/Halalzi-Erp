import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertSalesTaskInCompany, safeSalesTaskSelect } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.tasks.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    await assertSalesTaskInCompany(prisma, id, scope.companyId);

    const task = await prisma.salesTask.update({
      where: { id },
      data: { status: "cancelled", completedAt: null },
      select: safeSalesTaskSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.task.cancel",
      entityType: "salesTask",
      entityId: task.id,
      summary: `CRM task cancelled: ${task.title}`,
      metadata: { status: task.status },
    });

    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
