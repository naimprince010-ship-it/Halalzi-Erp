import { NextResponse } from "next/server";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { applyPostedJournalBalances, ensureBalanced, safeJournalEntrySelect } from "../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.journals.post");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const journalEntry = await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.journalEntry.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
          totalDebit: true,
          totalCredit: true,
          lines: {
            select: {
              accountId: true,
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
      });

      if (!existingEntry) {
        throw forbidden("You do not have permission to post this journal entry.");
      }

      if (existingEntry.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft journal entries can be posted.", 400);
      }

      if (existingEntry.lines.length < 2) {
        throw new AppError("VALIDATION_ERROR", "At least two journal lines are required before posting.", 400);
      }

      ensureBalanced(Number(existingEntry.totalDebit), Number(existingEntry.totalCredit));
      await applyPostedJournalBalances(tx, existingEntry.lines);

      return tx.journalEntry.update({
        where: { id },
        data: {
          status: "posted",
          postedAt: new Date(),
        },
        select: safeJournalEntrySelect,
      });
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.journal.post",
      entityType: "journal_entry",
      entityId: journalEntry.id,
      summary: `Journal entry posted: ${journalEntry.entryNumber}`,
      metadata: {
        entryNumber: journalEntry.entryNumber,
        status: journalEntry.status,
        totalDebit: Number(journalEntry.totalDebit),
        totalCredit: Number(journalEntry.totalCredit),
      },
    });

    return NextResponse.json({ journalEntry });
  } catch (error) {
    return errorResponse(error);
  }
}
