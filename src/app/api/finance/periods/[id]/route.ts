import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  ensureNoPeriodOverlap,
  isUniqueConstraintError,
  safeFinancePeriodSelect,
  updateFinancePeriodSchema,
} from "../../_periods";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.periods.manage");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateFinancePeriodSchema.parse(await request.json());

    const period = await prisma.$transaction(async (tx) => {
      const existing = await tx.financePeriod.findFirst({
        where: { id, companyId: scope.companyId },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });

      if (!existing) {
        throw forbidden("You do not have permission to update this finance period.");
      }

      if (existing.status === "closed") {
        throw new AppError("VALIDATION_ERROR", "Closed periods cannot be edited directly.", 400);
      }

      const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
      const endDate = input.endDate ? new Date(input.endDate) : existing.endDate;

      if (endDate < startDate) {
        throw new AppError("VALIDATION_ERROR", "endDate must be the same or later than startDate.", 400);
      }

      await ensureNoPeriodOverlap(tx, scope.companyId, startDate, endDate, existing.id);

      return tx.financePeriod.update({
        where: { id },
        data: {
          periodKey: input.periodKey,
          startDate,
          endDate,
        },
        select: safeFinancePeriodSelect,
      });
    });

    return NextResponse.json({ period });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid period update details.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A finance period with this key already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
