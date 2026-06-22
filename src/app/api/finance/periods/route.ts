import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  createFinancePeriodSchema,
  ensureNoPeriodOverlap,
  isUniqueConstraintError,
  periodListQuerySchema,
  safeFinancePeriodSelect,
} from "../_periods";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.periods.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const filters = periodListQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
    });

    const periods = await prisma.financePeriod.findMany({
      where: {
        companyId: scope.companyId,
        status: filters.status,
      },
      select: safeFinancePeriodSelect,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ periods });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid period filters.", 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("finance.periods.manage");
    const scope = companyScope(currentUser);
    const input = createFinancePeriodSchema.parse(await request.json());
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    const period = await prisma.$transaction(async (tx) => {
      await ensureNoPeriodOverlap(tx, scope.companyId, startDate, endDate);

      return tx.financePeriod.create({
        data: {
          companyId: scope.companyId,
          periodKey: input.periodKey,
          startDate,
          endDate,
          status: "open",
        },
        select: safeFinancePeriodSelect,
      });
    });

    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid period details.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A finance period with this key already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
