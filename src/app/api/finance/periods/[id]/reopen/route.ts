import { NextResponse } from "next/server";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeFinancePeriodSelect } from "../../../_periods";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.periods.manage");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const period = await prisma.$transaction(async (tx) => {
      const existing = await tx.financePeriod.findFirst({
        where: { id, companyId: scope.companyId },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw forbidden("You do not have permission to reopen this finance period.");
      }

      if (existing.status === "open") {
        throw new AppError("VALIDATION_ERROR", "Finance period is already open.", 400);
      }

      return tx.financePeriod.update({
        where: { id },
        data: {
          status: "open",
          closedAt: null,
          closedByUserId: null,
        },
        select: safeFinancePeriodSelect,
      });
    });

    return NextResponse.json({ period });
  } catch (error) {
    return errorResponse(error);
  }
}
