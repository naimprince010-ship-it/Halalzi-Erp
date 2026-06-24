import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requireAnyPermission, requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeSalesInvoiceSelect, updateSalesInvoiceSchema } from "../_shared";

function notFoundError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this invoice.", 403);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAnyPermission(["sales.invoices.read", "finance.read"]);
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const invoice = await prisma.salesInvoice.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeSalesInvoiceSelect,
    });

    if (!invoice) {
      throw notFoundError();
    }

    return NextResponse.json({ data: invoice });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("sales.invoices.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const parsed = updateSalesInvoiceSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the submitted fields.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update an invoice.", 400);
    }

    const existing = await prisma.salesInvoice.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      throw notFoundError();
    }

    if (existing.status === "paid" || existing.status === "cancelled") {
      throw new AppError("VALIDATION_ERROR", "Paid or cancelled invoices cannot be updated.", 400);
    }

    const invoice = await prisma.salesInvoice.update({
      where: { id },
      data: {
        ...(parsed.data.dueDate !== undefined
          ? { dueDate: parsed.data.dueDate === null ? null : new Date(parsed.data.dueDate) }
          : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes?.trim() || null } : {}),
      },
      select: safeSalesInvoiceSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_invoice.update",
      entityType: "sales_invoice",
      entityId: invoice.id,
      summary: `Sales invoice updated: ${invoice.invoiceNumber}`,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        linkedReceivableId: invoice.receivableId,
        totalAmount: Number(invoice.totalAmount),
      },
    });

    return NextResponse.json({ data: invoice });
  } catch (error) {
    return errorResponse(error);
  }
}
