import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const querySchema = z
  .object({
    from: z.string().trim().datetime().optional(),
    to: z.string().trim().datetime().optional(),
    categoryAccountId: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) return true;
      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    { message: "from must be earlier than or equal to to." },
  );

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.reports.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      categoryAccountId: searchParams.get("categoryAccountId") ?? undefined,
    });

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        companyId: scope.companyId,
        categoryAccountId: query.categoryAccountId,
        expenseDate:
          fromDate || toDate
            ? {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              }
            : undefined,
      },
      select: {
        id: true,
        expenseNumber: true,
        expenseDate: true,
        amount: true,
        method: true,
        status: true,
        reference: true,
        categoryAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    });

    const totalAmount = round2(expenses.reduce((sum, item) => sum + Number(item.amount), 0));

    const totalsByCategory = new Map<string, { categoryAccountId: string; code: string; name: string; amount: number }>();
    const totalsByMethod = new Map<string, number>();

    for (const expense of expenses) {
      const amount = Number(expense.amount);
      const categoryKey = expense.categoryAccount.id;
      const existingCategory = totalsByCategory.get(categoryKey);
      totalsByCategory.set(categoryKey, {
        categoryAccountId: expense.categoryAccount.id,
        code: expense.categoryAccount.code,
        name: expense.categoryAccount.name,
        amount: round2((existingCategory?.amount ?? 0) + amount),
      });

      totalsByMethod.set(expense.method, round2((totalsByMethod.get(expense.method) ?? 0) + amount));
    }

    return NextResponse.json({
      report: {
        generatedAt: new Date().toISOString(),
        filters: {
          from: fromDate?.toISOString() ?? null,
          to: toDate?.toISOString() ?? null,
          categoryAccountId: query.categoryAccountId ?? null,
        },
        totals: {
          totalAmount,
        },
        totalsByCategory: [...totalsByCategory.values()].sort((a, b) => b.amount - a.amount),
        totalsByMethod: [...totalsByMethod.entries()].map(([method, amount]) => ({ method, amount })),
        recentExpenses: expenses.slice(0, 10).map((item) => ({
          id: item.id,
          expenseNumber: item.expenseNumber,
          expenseDate: item.expenseDate,
          amount: round2(Number(item.amount)),
          method: item.method,
          status: item.status,
          reference: item.reference,
          categoryAccount: item.categoryAccount,
        })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid expense summary filters.", 400));
    }

    return errorResponse(error);
  }
}
