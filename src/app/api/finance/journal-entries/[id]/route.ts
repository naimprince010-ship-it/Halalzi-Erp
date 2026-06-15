import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeJournalTotals,
  isUniqueConstraintError,
  prepareJournalLines,
  safeJournalEntrySelect,
  updateJournalEntrySchema,
} from "../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeJournalEntrySelect,
    });

    if (!journalEntry) {
      throw forbidden("You do not have permission to access this journal entry.");
    }

    return NextResponse.json({ journalEntry });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.journals.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateJournalEntrySchema.parse(await request.json());

    const journalEntry = await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.journalEntry.findFirst({
        where: {
          id,
          companyId: scope.companyId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existingEntry) {
        throw forbidden("You do not have permission to update this journal entry.");
      }

      if (existingEntry.status !== "draft") {
        throw new AppError("VALIDATION_ERROR", "Only draft journal entries can be edited.", 400);
      }

      const data = {
        entryNumber: input.entryNumber,
        entryDate: input.entryDate ? new Date(input.entryDate) : undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description,
      };

      if (!input.lines) {
        return tx.journalEntry.update({
          where: { id },
          data,
          select: safeJournalEntrySelect,
        });
      }

      const lines = await prepareJournalLines(tx, scope.companyId, input.lines);
      const totals = computeJournalTotals(lines);

      return tx.journalEntry.update({
        where: { id },
        data: {
          ...data,
          totalDebit: totals.totalDebit,
          totalCredit: totals.totalCredit,
          lines: {
            deleteMany: {},
            create: lines.map((line) => ({
              accountId: line.accountId,
              description: line.description,
              debit: line.debit,
              credit: line.credit,
            })),
          },
        },
        select: safeJournalEntrySelect,
      });
    });

    return NextResponse.json({ journalEntry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid journal entry update details.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A journal entry with this number already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
