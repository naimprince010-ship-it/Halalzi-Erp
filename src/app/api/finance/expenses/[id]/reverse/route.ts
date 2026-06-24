import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertPeriodOpenForDate } from "../../../_periods";
import { applyPostedJournalBalances, generateEntryNumber } from "../../../journal-entries/_shared";
import { reverseExpenseSchema, safeExpenseSelect } from "../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.expenses.reverse");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = reverseExpenseSchema.parse(await request.json().catch(() => ({})));

    const expense = await prisma.$transaction(async (tx) => {
      const existingExpense = await tx.expense.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          expenseNumber: true,
          status: true,
          journalEntryId: true,
          reversalJournalEntryId: true,
          journalEntry: {
            select: {
              id: true,
              entryNumber: true,
              lines: {
                select: {
                  accountId: true,
                  description: true,
                  debit: true,
                  credit: true,
                  account: {
                    select: {
                      type: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingExpense) {
        throw forbidden("You do not have permission to reverse this expense.");
      }

      if (existingExpense.status !== "posted") {
        throw new AppError("VALIDATION_ERROR", "Only posted expenses can be reversed.", 400);
      }

      if (existingExpense.reversalJournalEntryId) {
        throw new AppError("VALIDATION_ERROR", "This expense is already reversed.", 400);
      }

      const reversalDate = input.reversalDate ? new Date(input.reversalDate) : new Date();
      await assertPeriodOpenForDate(tx, scope.companyId, reversalDate);

      const reversedLines = existingExpense.journalEntry.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description,
        debit: Number(line.credit),
        credit: Number(line.debit),
        account: {
          type: line.account.type,
        },
      }));

      await applyPostedJournalBalances(tx, reversedLines);

      const reversalEntry = await tx.journalEntry.create({
        data: {
          companyId: scope.companyId,
          entryNumber: generateEntryNumber(),
          entryDate: reversalDate,
          sourceType: "manual",
          sourceId: existingExpense.id,
          description: input.reason
            ? `Expense reversal ${existingExpense.expenseNumber}: ${input.reason}`
            : `Expense reversal ${existingExpense.expenseNumber}`,
          status: "posted",
          totalDebit: existingExpense.journalEntry.lines.reduce((sum, line) => sum + Number(line.credit), 0),
          totalCredit: existingExpense.journalEntry.lines.reduce((sum, line) => sum + Number(line.debit), 0),
          postedAt: new Date(),
          lines: {
            create: reversedLines.map((line) => ({
              accountId: line.accountId,
              description: line.description,
              debit: line.debit,
              credit: line.credit,
            })),
          },
        },
        select: { id: true },
      });

      await tx.expense.update({
        where: { id: existingExpense.id },
        data: {
          status: "reversed",
          reversalJournalEntryId: reversalEntry.id,
          reversedAt: new Date(),
          reversedByUserId: currentUser.user.id,
        },
      });

      return tx.expense.findFirstOrThrow({
        where: {
          id: existingExpense.id,
          companyId: scope.companyId,
        },
        select: safeExpenseSelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.expense.reverse",
      entityType: "expense",
      entityId: expense.id,
      summary: `Expense reversed: ${expense.expenseNumber}`,
      metadata: {
        expenseId: expense.id,
        journalEntryId: expense.journalEntryId,
        reversalJournalEntryId: expense.reversalJournalEntryId,
        amount: Number(expense.amount),
      },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid reversal details.", 400));
    }

    return errorResponse(error);
  }
}
