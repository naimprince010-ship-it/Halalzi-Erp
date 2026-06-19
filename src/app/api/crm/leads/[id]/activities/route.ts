import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertLeadInCompany,
  createLeadActivitySchema,
  safeLeadActivitySelect,
  validationMessage,
} from "../../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    await assertLeadInCompany(prisma, id, scope.companyId);

    const activities = await prisma.leadActivity.findMany({
      where: { leadId: id, companyId: scope.companyId },
      select: safeLeadActivitySelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ activities });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.create");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = createLeadActivitySchema.parse(await request.json());

    const existing = await assertLeadInCompany(prisma, id, scope.companyId);

    if (existing.status === "archived") {
      throw new AppError("VALIDATION_ERROR", "Cannot add activity to an archived lead.", 400);
    }

    const activity = await prisma.leadActivity.create({
      data: {
        companyId: scope.companyId,
        leadId: id,
        userId: currentUser.user.id,
        type: input.type,
        note: input.note,
      },
      select: safeLeadActivitySelect,
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
