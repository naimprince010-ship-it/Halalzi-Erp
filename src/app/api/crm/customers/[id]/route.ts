import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertCustomerInCompany,
  safeCustomerSelect,
  toCustomerData,
  updateCustomerSchema,
  validationMessage,
} from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const customer = await prisma.customerContact.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeCustomerSelect,
    });

    if (!customer) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this customer.", 403);
    }

    return NextResponse.json({ customer });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateCustomerSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a customer.", 400);
    }

    const existing = await assertCustomerInCompany(prisma, id, scope.companyId);

    if (existing.status === "archived") {
      throw new AppError("VALIDATION_ERROR", "Archived customers cannot be updated.", 400);
    }

    const customer = await prisma.customerContact.update({
      where: { id },
      data: toCustomerData(input),
      select: safeCustomerSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.customer.update",
      entityType: "customerContact",
      entityId: customer.id,
      summary: `CRM customer updated: ${customer.name}`,
      metadata: { status: customer.status },
    });

    return NextResponse.json({ customer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
