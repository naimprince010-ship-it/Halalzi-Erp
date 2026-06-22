import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { assertPeriodOpenForDate } from "../../../_periods";
import { applyPostedJournalBalances, generateEntryNumber, safeJournalEntrySelect } from "../../_shared";

const reverseJournalSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  reversalDate: z.string().trim().datetime().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.journals.reverse");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = reverseJournalSchema.parse(await request.json().catch(() => ({})));

    const result = await prisma.$transaction(async (tx) => {
      const originalEntry = await tx.journalEntry.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          entryNumber: true,
          status: true,
          totalDebit: true,
          totalCredit: true,
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
          asOriginalReversal: {
            select: { id: true },
          },
        },
      });

      if (!originalEntry) {
        throw forbidden("You do not have permission to reverse this journal entry.");
      }

      if (originalEntry.status !== "posted") {
        throw new AppError("VALIDATION_ERROR", "Only posted journal entries can be reversed.", 400);
      }

      if (originalEntry.asOriginalReversal) {
        throw new AppError("VALIDATION_ERROR", "This journal entry already has a reversal.", 400);
      }

      const reversalDate = input.reversalDate ? new Date(input.reversalDate) : new Date();
      await assertPeriodOpenForDate(tx, scope.companyId, reversalDate);

      const reversedLines = originalEntry.lines.map((line) => ({
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
          sourceId: originalEntry.id,
          description: input.reason
            ? `Reversal of ${originalEntry.entryNumber}: ${input.reason}`
            : `Reversal of ${originalEntry.entryNumber}`,
          status: "posted",
          totalDebit: Number(originalEntry.totalCredit),
          totalCredit: Number(originalEntry.totalDebit),
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
        select: safeJournalEntrySelect,
      });

      const reversal = await tx.journalReversal.create({
        data: {
          companyId: scope.companyId,
          originalJournalEntryId: originalEntry.id,
          reversalJournalEntryId: reversalEntry.id,
          reason: input.reason,
          createdByUserId: currentUser.user.id,
        },
        select: {
          id: true,
          originalJournalEntryId: true,
          reversalJournalEntryId: true,
          reason: true,
          createdByUserId: true,
          createdAt: true,
        },
      });

      return { reversalEntry, reversal };
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.journal.reverse",
      entityType: "journal_reversal",
      entityId: result.reversal.id,
      summary: `Journal entry reversed: ${result.reversal.originalJournalEntryId}`,
      metadata: {
        originalJournalEntryId: result.reversal.originalJournalEntryId,
        reversalJournalEntryId: result.reversal.reversalJournalEntryId,
        reason: result.reversal.reason,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid reversal details.", 400));
    }

    return errorResponse(error);
  }
}
