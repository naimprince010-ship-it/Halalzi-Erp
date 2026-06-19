import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  assertCustomerInCompany,
  assertLeadInCompany,
  convertLeadSchema,
  safeLeadSelect,
  validationMessage,
} from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.convert");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = convertLeadSchema.parse(await request.json());

    if (!input.customerId && !input.customer) {
      throw new AppError("VALIDATION_ERROR", "Provide customerId or customer details to convert a lead.", 400);
    }

    if (input.customerId && input.customer) {
      throw new AppError("VALIDATION_ERROR", "Provide either customerId or customer details, not both.", 400);
    }

    const lead = await prisma.$transaction(async (tx) => {
      const existing = await assertLeadInCompany(tx, id, scope.companyId);

      if (existing.status === "converted") {
        throw new AppError("VALIDATION_ERROR", "This lead has already been converted.", 400);
      }

      if (existing.status === "archived") {
        throw new AppError("VALIDATION_ERROR", "Archived leads cannot be converted.", 400);
      }

      const customerId =
        input.customerId ??
        (
          await tx.customerContact.create({
            data: {
              companyId: scope.companyId,
              name: input.customer?.name ?? existing.name,
              companyName: input.customer?.companyName ?? existing.companyName,
              email: input.customer?.email ?? existing.email,
              phone: input.customer?.phone ?? existing.phone,
              address: input.customer?.address,
              notes: input.customer?.notes ?? existing.notes,
              status: input.customer?.status ?? "active",
            },
            select: { id: true },
          })
        ).id;

      if (input.customerId) {
        await assertCustomerInCompany(tx, input.customerId, scope.companyId);
      }

      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: "converted",
          stage: "won",
          convertedCustomerId: customerId,
          convertedAt: new Date(),
        },
        select: safeLeadSelect,
      });

      await tx.leadActivity.create({
        data: {
          companyId: scope.companyId,
          leadId: id,
          userId: currentUser.user.id,
          type: "conversion",
          note: "Lead converted to customer.",
        },
      });

      return updated;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.lead.convert",
      entityType: "lead",
      entityId: lead.id,
      summary: `CRM lead converted: ${lead.name}`,
      metadata: { convertedCustomerId: lead.convertedCustomerId },
    });

    return NextResponse.json({ lead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
