import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertLeadInCompany,
  safeLeadSelect,
  toLeadData,
  updateLeadSchema,
  validationMessage,
} from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const lead = await prisma.lead.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeLeadSelect,
    });

    if (!lead) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this lead.", 403);
    }

    return NextResponse.json({ lead });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateLeadSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a lead.", 400);
    }

    const existing = await assertLeadInCompany(prisma, id, scope.companyId);

    if (existing.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "Only active leads can be updated.", 400);
    }

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: toLeadData(input),
        select: safeLeadSelect,
      });

      if (input.stage !== undefined && input.stage !== existing.stage) {
        await tx.leadActivity.create({
          data: {
            companyId: scope.companyId,
            leadId: id,
            userId: currentUser.user.id,
            type: "stage_change",
            note: `Stage changed from ${existing.stage} to ${input.stage}.`,
          },
        });
      }

      return updated;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.lead.update",
      entityType: "lead",
      entityId: lead.id,
      summary: `CRM lead updated: ${lead.name}`,
      metadata: { stage: lead.stage, status: lead.status },
    });

    return NextResponse.json({ lead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
