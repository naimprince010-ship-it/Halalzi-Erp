import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeJournalTotals,
  createJournalEntrySchema,
  generateEntryNumber,
  isUniqueConstraintError,
  journalListQuerySchema,
  prepareJournalLines,
  safeJournalEntrySelect,
} from "./_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const filters = journalListQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      sourceType: searchParams.get("sourceType") ?? undefined,
    });

    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        companyId: scope.companyId,
        status: filters.status,
        sourceType: filters.sourceType,
      },
      select: safeJournalEntrySelect,
      orderBy: {
        entryDate: "desc",
      },
    });

    return NextResponse.json({ journalEntries });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid journal filters.", 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("finance.journals.create");
    const scope = companyScope(currentUser);
    const input = createJournalEntrySchema.parse(await request.json());

    const journalEntry = await prisma.$transaction(async (tx) => {
      const lines = await prepareJournalLines(tx, scope.companyId, input.lines);
      const totals = computeJournalTotals(lines);

      return tx.journalEntry.create({
        data: {
          companyId: scope.companyId,
          entryNumber: input.entryNumber ?? generateEntryNumber(),
          entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
          sourceType: input.sourceType ?? "manual",
          sourceId: input.sourceId,
          description: input.description,
          totalDebit: totals.totalDebit,
          totalCredit: totals.totalCredit,
          lines: {
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

    return NextResponse.json({ journalEntry }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid journal entry details.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A journal entry with this number already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
