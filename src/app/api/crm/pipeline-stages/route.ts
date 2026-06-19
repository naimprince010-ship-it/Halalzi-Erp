import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  ensureDefaultPipelineStages,
  pipelineStageSchema,
  safePipelineStageSelect,
  validationMessage,
} from "../_shared";

export async function GET() {
  try {
    const currentUser = await requirePermission("crm.pipeline.read");
    const scope = companyScope(currentUser);

    await ensureDefaultPipelineStages(prisma, scope.companyId);

    const stages = await prisma.pipelineStage.findMany({
      where: { companyId: scope.companyId },
      select: safePipelineStageSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ stages });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("crm.pipeline.update");
    const scope = companyScope(currentUser);
    const input = pipelineStageSchema.parse(await request.json());

    const stage = await prisma.pipelineStage.create({
      data: {
        companyId: scope.companyId,
        key: input.key,
        name: input.name,
        sortOrder: input.sortOrder,
        description: input.description,
        isActive: input.isActive ?? true,
      },
      select: safePipelineStageSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.pipeline_stage.create",
      entityType: "pipelineStage",
      entityId: stage.id,
      summary: `CRM pipeline stage created: ${stage.name}`,
      metadata: { key: stage.key, sortOrder: stage.sortOrder },
    });

    return NextResponse.json({ stage }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return errorResponse(new AppError("VALIDATION_ERROR", "A pipeline stage with this key already exists.", 409));
    }

    return errorResponse(error);
  }
}
