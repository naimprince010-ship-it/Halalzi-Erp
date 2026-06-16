import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { buildSettlementUpdate, safeReceivableSelect, updateSettlementSchema } from "../../_settlements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.receivables.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateSettlementSchema.parse(await request.json());

    const existingReceivable = await prisma.receivable.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        amount: true,
      },
    });

    if (!existingReceivable) {
      throw forbidden("You do not have permission to update this receivable.");
    }

    const receivable = await prisma.receivable.update({
      where: { id },
      data: buildSettlementUpdate(input, Number(existingReceivable.amount)),
      select: safeReceivableSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.receivable.update",
      entityType: "receivable",
      entityId: receivable.id,
      summary: `Receivable updated: ${receivable.customerNameSnapshot}`,
      metadata: {
        status: receivable.status,
        amount: Number(receivable.amount),
        paidAmount: Number(receivable.paidAmount),
      },
    });

    return NextResponse.json({ receivable });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid receivable update details.", 400));
    }

    return errorResponse(error);
  }
}
