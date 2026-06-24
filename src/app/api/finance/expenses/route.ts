import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertPeriodOpenForDate } from "../_periods";
import { applyPostedJournalBalances, generateEntryNumber } from "../journal-entries/_shared";
import {
  createExpenseSchema,
  expenseListQuerySchema,
  generateExpenseNumber,
  isUniqueConstraintError,
  safeExpenseSelect,
} from "./_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.expenses.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const query = expenseListQuerySchema.parse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      categoryAccountId: searchParams.get("categoryAccountId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        companyId: scope.companyId,
        categoryAccountId: query.categoryAccountId,
        status: query.status,
        expenseDate:
          fromDate || toDate
            ? {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              }
            : undefined,
      },
      select: safeExpenseSelect,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ expenses });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid expense filters.", 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("finance.expenses.create");
    const scope = companyScope(currentUser);
    const input = createExpenseSchema.parse(await request.json());

    const expense = await prisma.$transaction(async (tx) => {
      const categoryAccount = await tx.financeAccount.findFirst({
        where: {
          id: input.categoryAccountId,
          companyId: scope.companyId,
          status: "active",
          type: "expense",
        },
        select: { id: true, code: true, name: true, type: true },
      });

      if (!categoryAccount) {
        throw new AppError("VALIDATION_ERROR", "Please select an active expense category account.", 400);
      }

      const paidFromAccount = await tx.financeAccount.findFirst({
        where: {
          id: input.paidFromAccountId,
          companyId: scope.companyId,
          status: "active",
          kind: { in: ["cash", "bank", "mobile_money"] },
        },
        select: { id: true, code: true, name: true, kind: true },
      });

      if (!paidFromAccount) {
        throw new AppError("VALIDATION_ERROR", "Please select an active cash or bank account.", 400);
      }

      const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
      await assertPeriodOpenForDate(tx, scope.companyId, expenseDate);

      const entryNumber = generateEntryNumber();
      const expenseNumber = generateExpenseNumber();
      const amount = Number(input.amount);

      const postedLines = [
        {
          accountId: categoryAccount.id,
          debit: amount,
          credit: 0,
          account: { type: "expense" },
        },
        {
          accountId: paidFromAccount.id,
          debit: 0,
          credit: amount,
          account: { type: "asset" },
        },
      ];

      await applyPostedJournalBalances(tx, postedLines);

      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId: scope.companyId,
          entryNumber,
          entryDate: expenseDate,
          sourceType: "manual",
          sourceId: expenseNumber,
          description: input.note ? `Expense ${expenseNumber}: ${input.note}` : `Expense ${expenseNumber}`,
          status: "posted",
          totalDebit: amount,
          totalCredit: amount,
          postedAt: new Date(),
          lines: {
            create: [
              {
                accountId: categoryAccount.id,
                description: `Expense category ${categoryAccount.code}`,
                debit: amount,
                credit: 0,
              },
              {
                accountId: paidFromAccount.id,
                description: `Paid from ${paidFromAccount.code}`,
                debit: 0,
                credit: amount,
              },
            ],
          },
        },
        select: { id: true },
      });

      return tx.expense.create({
        data: {
          companyId: scope.companyId,
          expenseNumber,
          expenseDate,
          amount,
          status: "posted",
          method: input.method ?? "bank_transfer",
          reference: input.reference,
          note: input.note,
          categoryAccountId: categoryAccount.id,
          paidFromAccountId: paidFromAccount.id,
          journalEntryId: journalEntry.id,
          createdByUserId: currentUser.user.id,
        },
        select: safeExpenseSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.expense.create",
      entityType: "expense",
      entityId: expense.id,
      summary: `Expense created: ${expense.expenseNumber}`,
      metadata: {
        expenseId: expense.id,
        categoryAccountId: expense.categoryAccountId,
        paidFromAccountId: expense.paidFromAccountId,
        journalEntryId: expense.journalEntryId,
        amount: Number(expense.amount),
        method: expense.method,
      },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid expense details.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A generated expense number already exists. Please try again.", 409),
      );
    }

    return errorResponse(error);
  }
}
