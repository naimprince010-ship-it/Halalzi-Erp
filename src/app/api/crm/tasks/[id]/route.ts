import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertCustomerInCompany,
  assertDealInCompany,
  assertLeadInCompany,
  assertSalesTaskInCompany,
  assertUserInCompany,
  safeSalesTaskSelect,
  toSalesTaskData,
  updateSalesTaskSchema,
  validationMessage,
} from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.tasks.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const task = await prisma.salesTask.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeSalesTaskSelect,
    });

    if (!task) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this task.", 403);
    }

    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.tasks.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateSalesTaskSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a task.", 400);
    }

    await assertSalesTaskInCompany(prisma, id, scope.companyId);

    if (input.dealId) {
      await assertDealInCompany(prisma, input.dealId, scope.companyId);
    }

    if (input.leadId) {
      await assertLeadInCompany(prisma, input.leadId, scope.companyId);
    }

    if (input.customerContactId) {
      await assertCustomerInCompany(prisma, input.customerContactId, scope.companyId);
    }

    if (input.assignedToUserId) {
      await assertUserInCompany(prisma, input.assignedToUserId, scope.companyId);
    }

    const task = await prisma.salesTask.update({
      where: { id },
      data: toSalesTaskData(input),
      select: safeSalesTaskSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.task.update",
      entityType: "salesTask",
      entityId: task.id,
      summary: `CRM task updated: ${task.title}`,
      metadata: { status: task.status, priority: task.priority },
    });

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
