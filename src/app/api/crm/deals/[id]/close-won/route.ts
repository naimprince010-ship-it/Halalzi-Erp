import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertDealInCompany,
  closeWonSchema,
  ensureDefaultPipelineStages,
  safeDealSelect,
  validationMessage,
} from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.deals.close");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = closeWonSchema.parse(await request.json().catch(() => ({})));
    const existing = await assertDealInCompany(prisma, id, scope.companyId);

    if (existing.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "Only active deals can be closed.", 400);
    }

    const deal = await prisma.$transaction(async (tx) => {
      await ensureDefaultPipelineStages(tx, scope.companyId);
      const wonStage = await tx.pipelineStage.findFirst({
        where: { companyId: scope.companyId, key: "closed_won", isActive: true },
        select: { id: true },
      });

      if (!wonStage) {
        throw new AppError("VALIDATION_ERROR", "Closed won pipeline stage is not available.", 400);
      }

      const updated = await tx.deal.update({
        where: { id },
        data: {
          status: "won",
          currentStageId: wonStage.id,
          probability: 100,
          wonAt: new Date(),
          lostAt: null,
          lostReason: null,
        },
        select: safeDealSelect,
      });

      await tx.dealStageHistory.create({
        data: {
          companyId: scope.companyId,
          dealId: id,
          fromStageId: existing.currentStageId,
          toStageId: wonStage.id,
          changedByUserId: currentUser.user.id,
          probability: 100,
          value: updated.value,
          note: input.note ?? "Deal closed as won.",
        },
      });

      return updated;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.deal.close_won",
      entityType: "deal",
      entityId: deal.id,
      summary: `CRM deal closed won: ${deal.name}`,
      metadata: { status: deal.status },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
