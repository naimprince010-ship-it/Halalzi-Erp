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
  assertUserInCompany,
  createSalesTaskSchema,
  safeSalesTaskSelect,
  taskListQuerySchema,
  toSalesTaskData,
  validationMessage,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("crm.tasks.read");
    const scope = companyScope(currentUser);
    const url = new URL(request.url);
    const query = taskListQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      dealId: url.searchParams.get("dealId") ?? undefined,
      leadId: url.searchParams.get("leadId") ?? undefined,
      customerContactId: url.searchParams.get("customerContactId") ?? undefined,
      assignedToUserId: url.searchParams.get("assignedToUserId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });

    const tasks = await prisma.salesTask.findMany({
      where: {
        companyId: scope.companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.dealId ? { dealId: query.dealId } : {}),
        ...(query.leadId ? { leadId: query.leadId } : {}),
        ...(query.customerContactId ? { customerContactId: query.customerContactId } : {}),
        ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { description: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: safeSalesTaskSelect,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("crm.tasks.create");
    const scope = companyScope(currentUser);
    const input = createSalesTaskSchema.parse(await request.json());

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

    const task = await prisma.salesTask.create({
      data: {
        companyId: scope.companyId,
        createdByUserId: currentUser.user.id,
        title: input.title,
        ...toSalesTaskData(input),
      },
      select: safeSalesTaskSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.task.create",
      entityType: "salesTask",
      entityId: task.id,
      summary: `CRM task created: ${task.title}`,
      metadata: { status: task.status, priority: task.priority },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
