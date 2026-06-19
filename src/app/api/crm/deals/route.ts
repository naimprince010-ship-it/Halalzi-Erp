import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertCustomerInCompany,
  assertLeadInCompany,
  assertPipelineStageInCompany,
  createDealSchema,
  dealListQuerySchema,
  getDefaultPipelineStage,
  safeDealSelect,
  toDealData,
  validationMessage,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("crm.deals.read");
    const scope = companyScope(currentUser);
    const url = new URL(request.url);
    const query = dealListQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      stageId: url.searchParams.get("stageId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });

    const deals = await prisma.deal.findMany({
      where: {
        companyId: scope.companyId,
        ...(query.status ? { status: query.status } : { status: { not: "archived" } }),
        ...(query.stageId ? { currentStageId: query.stageId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { description: { contains: query.q, mode: "insensitive" } },
                { lead: { name: { contains: query.q, mode: "insensitive" } } },
                { customerContact: { name: { contains: query.q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: safeDealSelect,
      orderBy: [{ expectedCloseDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ deals });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("crm.deals.create");
    const scope = companyScope(currentUser);
    const input = createDealSchema.parse(await request.json());

    const stage = input.currentStageId
      ? await assertPipelineStageInCompany(prisma, input.currentStageId, scope.companyId, { activeOnly: true })
      : await getDefaultPipelineStage(prisma, scope.companyId);

    if (input.leadId) {
      await assertLeadInCompany(prisma, input.leadId, scope.companyId);
    }

    if (input.customerContactId) {
      await assertCustomerInCompany(prisma, input.customerContactId, scope.companyId);
    }

    const deal = await prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          companyId: scope.companyId,
          name: input.name,
          ...toDealData(input),
          currentStageId: stage.id,
        },
        select: safeDealSelect,
      });

      await tx.dealStageHistory.create({
        data: {
          companyId: scope.companyId,
          dealId: created.id,
          toStageId: stage.id,
          changedByUserId: currentUser.user.id,
          probability: created.probability,
          value: created.value,
          note: "Deal created.",
        },
      });

      return created;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.deal.create",
      entityType: "deal",
      entityId: deal.id,
      summary: `CRM deal created: ${deal.name}`,
      metadata: { status: deal.status, currentStageId: deal.currentStageId },
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
