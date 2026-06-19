import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertPipelineStageInCompany,
  safePipelineStageSelect,
  updatePipelineStageSchema,
  validationMessage,
} from "../../_shared";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.pipeline.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updatePipelineStageSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a pipeline stage.", 400);
    }

    await assertPipelineStageInCompany(prisma, id, scope.companyId);

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data: input,
      select: safePipelineStageSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.pipeline_stage.update",
      entityType: "pipelineStage",
      entityId: stage.id,
      summary: `CRM pipeline stage updated: ${stage.name}`,
      metadata: { isActive: stage.isActive, sortOrder: stage.sortOrder },
    });

    return NextResponse.json({ stage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
