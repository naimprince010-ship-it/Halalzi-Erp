import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { addPaymentAmount, createPaymentSchema, safePayablePaymentSelect } from "../../../_payments";
import { assertPeriodOpenForDate } from "../../../_periods";
import { deriveSettlementStatus, safePayableSelect } from "../../../_settlements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.payments.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const payable = await prisma.payable.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: { id: true },
    });

    if (!payable) {
      throw forbidden("You do not have permission to access payments for this payable.");
    }

    const payments = await prisma.payablePayment.findMany({
      where: {
        companyId: scope.companyId,
        payableId: id,
      },
      select: safePayablePaymentSelect,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ payments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.payments.create");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = createPaymentSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const payable = await tx.payable.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          status: true,
          vendorNameSnapshot: true,
        },
      });

      if (!payable) {
        throw forbidden("You do not have permission to record payments for this payable.");
      }

      if (payable.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Payments are not allowed for cancelled payables.", 400);
      }

      if (payable.status === "paid") {
        throw new AppError("VALIDATION_ERROR", "This payable is already fully paid.", 400);
      }

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
      await assertPeriodOpenForDate(tx, scope.companyId, paymentDate);

      const nextPaidAmount = addPaymentAmount(Number(payable.paidAmount), input.amount, Number(payable.amount));
      const nextStatus = deriveSettlementStatus(Number(payable.amount), nextPaidAmount);

      const payment = await tx.payablePayment.create({
        data: {
          companyId: scope.companyId,
          payableId: payable.id,
          amount: input.amount,
          paymentDate,
          method: input.method ?? "bank_transfer",
          reference: input.reference,
          note: input.note,
          createdByUserId: currentUser.user.id,
        },
        select: safePayablePaymentSelect,
      });

      const updatedPayable = await tx.payable.update({
        where: { id: payable.id },
        data: {
          paidAmount: nextPaidAmount,
          status: nextStatus,
        },
        select: safePayableSelect,
      });

      return { payment, payable: updatedPayable };
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.payable.payment.create",
      entityType: "payable_payment",
      entityId: result.payment.id,
      summary: `Payable payment recorded for ${result.payable.vendorNameSnapshot}`,
      metadata: {
        payableId: result.payable.id,
        amount: Number(result.payment.amount),
        method: result.payment.method,
        paymentDate: result.payment.paymentDate.toISOString(),
        payableStatus: result.payable.status,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid payment details.", 400));
    }

    return errorResponse(error);
  }
}
