import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { buildSettlementUpdate, safePayableSelect, updateSettlementSchema } from "../../_settlements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.payables.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateSettlementSchema.parse(await request.json());

    const existingPayable = await prisma.payable.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        amount: true,
      },
    });

    if (!existingPayable) {
      throw forbidden("You do not have permission to update this payable.");
    }

    const payable = await prisma.payable.update({
      where: { id },
      data: buildSettlementUpdate(input, Number(existingPayable.amount)),
      select: safePayableSelect,
    });

    return NextResponse.json({ payable });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid payable update details.", 400));
    }

    return errorResponse(error);
  }
}
