import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeReceivableSelect, settlementListQuerySchema } from "../_settlements";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const filters = settlementListQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
    });

    const receivables = await prisma.receivable.findMany({
      where: {
        companyId: scope.companyId,
        status: filters.status,
      },
      select: safeReceivableSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ receivables });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid receivable filters.", 400));
    }

    return errorResponse(error);
  }
}
