import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { addPaymentAmount, createPaymentSchema, safeReceivablePaymentSelect } from "../../../_payments";
import { assertPeriodOpenForDate } from "../../../_periods";
import { deriveSettlementStatus, safeReceivableSelect } from "../../../_settlements";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.payments.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const receivable = await prisma.receivable.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: { id: true },
    });

    if (!receivable) {
      throw forbidden("You do not have permission to access payments for this receivable.");
    }

    const payments = await prisma.receivablePayment.findMany({
      where: {
        companyId: scope.companyId,
        receivableId: id,
      },
      select: safeReceivablePaymentSelect,
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
      const receivable = await tx.receivable.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          status: true,
          customerNameSnapshot: true,
        },
      });

      if (!receivable) {
        throw forbidden("You do not have permission to record payments for this receivable.");
      }

      if (receivable.status === "cancelled") {
        throw new AppError("VALIDATION_ERROR", "Payments are not allowed for cancelled receivables.", 400);
      }

      if (receivable.status === "paid") {
        throw new AppError("VALIDATION_ERROR", "This receivable is already fully paid.", 400);
      }

      if (input.accountId) {
        const paymentAccount = await tx.financeAccount.findFirst({
          where: {
            id: input.accountId,
            companyId: scope.companyId,
            status: "active",
            kind: { in: ["cash", "bank", "mobile_money"] },
          },
          select: { id: true },
        });

        if (!paymentAccount) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Please select an active cash or bank account for this payment.",
            400,
          );
        }
      }

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
      await assertPeriodOpenForDate(tx, scope.companyId, paymentDate);

      const nextPaidAmount = addPaymentAmount(Number(receivable.paidAmount), input.amount, Number(receivable.amount));
      const nextStatus = deriveSettlementStatus(Number(receivable.amount), nextPaidAmount);

      const payment = await tx.receivablePayment.create({
        data: {
          companyId: scope.companyId,
          receivableId: receivable.id,
          accountId: input.accountId,
          amount: input.amount,
          paymentDate,
          method: input.method ?? "bank_transfer",
          reference: input.reference,
          note: input.note,
          createdByUserId: currentUser.user.id,
        },
        select: safeReceivablePaymentSelect,
      });

      const updatedReceivable = await tx.receivable.update({
        where: { id: receivable.id },
        data: {
          paidAmount: nextPaidAmount,
          status: nextStatus,
        },
        select: safeReceivableSelect,
      });

      return { payment, receivable: updatedReceivable };
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.receivable.payment.create",
      entityType: "receivable_payment",
      entityId: result.payment.id,
      summary: `Receivable payment recorded for ${result.receivable.customerNameSnapshot}`,
      metadata: {
        receivableId: result.receivable.id,
        accountId: result.payment.accountId,
        journalEntryId: result.payment.journalEntryId,
        amount: Number(result.payment.amount),
        method: result.payment.method,
        paymentDate: result.payment.paymentDate.toISOString(),
        receivableStatus: result.receivable.status,
      },
    });

    if (result.payment.accountId) {
      await recordAuditLog({
        companyId: scope.companyId,
        userId: currentUser.user.id,
        action: "finance.receivable_payment.account_linked",
        entityType: "receivable_payment",
        entityId: result.payment.id,
        summary: `Receivable payment linked to account ${result.payment.account?.code ?? result.payment.accountId}`,
        metadata: {
          receivableId: result.receivable.id,
          paymentId: result.payment.id,
          accountId: result.payment.accountId,
          journalEntryId: result.payment.journalEntryId,
          amount: Number(result.payment.amount),
          method: result.payment.method,
        },
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid payment details.", 400));
    }

    return errorResponse(error);
  }
}
