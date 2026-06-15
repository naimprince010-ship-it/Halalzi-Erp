import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePayableSelect, settlementListQuerySchema } from "../_settlements";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const filters = settlementListQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
    });

    const payables = await prisma.payable.findMany({
      where: {
        companyId: scope.companyId,
        status: filters.status,
      },
      select: safePayableSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ payables });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid payable filters.", 400));
    }

    return errorResponse(error);
  }
}
