import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  createLeadSchema,
  leadListQuerySchema,
  safeLeadSelect,
  toLeadData,
  validationMessage,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const url = new URL(request.url);
    const query = leadListQuerySchema.parse({
      stage: url.searchParams.get("stage") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      followUp: url.searchParams.get("followUp") ?? undefined,
    });

    const now = new Date();
    const leads = await prisma.lead.findMany({
      where: {
        companyId: scope.companyId,
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.followUp === "due" ? { nextFollowUpAt: { lte: now } } : {}),
        ...(query.followUp === "overdue" ? { nextFollowUpAt: { lt: now } } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { companyName: { contains: query.q, mode: "insensitive" } },
                { email: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: safeLeadSelect,
      orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ leads });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("crm.create");
    const scope = companyScope(currentUser);
    const input = createLeadSchema.parse(await request.json());

    const lead = await prisma.lead.create({
      data: {
        companyId: scope.companyId,
        name: input.name,
        ...toLeadData(input),
      },
      select: safeLeadSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.lead.create",
      entityType: "lead",
      entityId: lead.id,
      summary: `CRM lead created: ${lead.name}`,
      metadata: { stage: lead.stage, status: lead.status, source: lead.source },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
