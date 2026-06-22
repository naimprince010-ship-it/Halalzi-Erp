import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const querySchema = z.object({
  asOfDate: z.string().trim().datetime().optional(),
});

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toBucket(daysPastDue: number | null) {
  if (daysPastDue === null || daysPastDue <= 0) {
    return "current" as const;
  }

  if (daysPastDue <= 30) {
    return "days_1_30" as const;
  }

  if (daysPastDue <= 60) {
    return "days_31_60" as const;
  }

  if (daysPastDue <= 90) {
    return "days_61_90" as const;
  }

  return "days_90_plus" as const;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.reports.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      asOfDate: searchParams.get("asOfDate") ?? undefined,
    });

    const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();

    const payables = await prisma.payable.findMany({
      where: {
        companyId: scope.companyId,
        status: { in: ["open", "partial"] },
      },
      select: {
        id: true,
        vendorNameSnapshot: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
        status: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const items = payables
      .map((payable) => {
        const amount = Number(payable.amount);
        const paidAmount = Number(payable.paidAmount);
        const outstanding = round2(amount - paidAmount);

        if (outstanding <= 0) {
          return null;
        }

        const daysPastDue = payable.dueDate
          ? Math.floor((asOfDate.getTime() - payable.dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const bucket = toBucket(daysPastDue);

        return {
          id: payable.id,
          vendorNameSnapshot: payable.vendorNameSnapshot,
          dueDate: payable.dueDate,
          status: payable.status,
          amount: round2(amount),
          paidAmount: round2(paidAmount),
          outstanding,
          daysPastDue,
          bucket,
        };
      })
      .filter((item) => item !== null);

    const totals = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      totalOutstanding: 0,
    };

    for (const item of items) {
      totals[item.bucket] += item.outstanding;
      totals.totalOutstanding += item.outstanding;
    }

    return NextResponse.json({
      report: {
        asOfDate: asOfDate.toISOString(),
        items,
        totals: {
          current: round2(totals.current),
          days_1_30: round2(totals.days_1_30),
          days_31_60: round2(totals.days_31_60),
          days_61_90: round2(totals.days_61_90),
          days_90_plus: round2(totals.days_90_plus),
          totalOutstanding: round2(totals.totalOutstanding),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid report query filters.", 400));
    }

    return errorResponse(error);
  }
}
