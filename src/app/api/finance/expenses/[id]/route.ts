import { NextResponse } from "next/server";

import { errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeExpenseSelect } from "../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.expenses.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const expense = await prisma.expense.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeExpenseSelect,
    });

    if (!expense) {
      throw forbidden("You do not have permission to access this expense.");
    }

    return NextResponse.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}
