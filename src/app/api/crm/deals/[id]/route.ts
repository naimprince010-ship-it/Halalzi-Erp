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
  assertPipelineStageInCompany,
  safeDealSelect,
  safeDealStageHistorySelect,
  toDealData,
  updateDealSchema,
  validationMessage,
} from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.deals.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const deal = await prisma.deal.findFirst({
      where: { id, companyId: scope.companyId },
      select: {
        ...safeDealSelect,
        stageHistory: { select: safeDealStageHistorySelect, orderBy: { createdAt: "desc" } },
      },
    });

    if (!deal) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this deal.", 403);
    }

    return NextResponse.json({ deal });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.deals.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateDealSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a deal.", 400);
    }

    const existing = await assertDealInCompany(prisma, id, scope.companyId);

    if (existing.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "Only active deals can be updated.", 400);
    }

    if (input.currentStageId) {
      await assertPipelineStageInCompany(prisma, input.currentStageId, scope.companyId, { activeOnly: true });
    }

    if (input.leadId) {
      await assertLeadInCompany(prisma, input.leadId, scope.companyId);
    }

    if (input.customerContactId) {
      await assertCustomerInCompany(prisma, input.customerContactId, scope.companyId);
    }

    const deal = await prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id },
        data: toDealData(input),
        select: safeDealSelect,
      });

      if (input.currentStageId && input.currentStageId !== existing.currentStageId) {
        await tx.dealStageHistory.create({
          data: {
            companyId: scope.companyId,
            dealId: id,
            fromStageId: existing.currentStageId,
            toStageId: input.currentStageId,
            changedByUserId: currentUser.user.id,
            probability: updated.probability,
            value: updated.value,
            note: "Deal stage updated.",
          },
        });
      }

      return updated;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.deal.update",
      entityType: "deal",
      entityId: deal.id,
      summary: `CRM deal updated: ${deal.name}`,
      metadata: { status: deal.status, currentStageId: deal.currentStageId },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
