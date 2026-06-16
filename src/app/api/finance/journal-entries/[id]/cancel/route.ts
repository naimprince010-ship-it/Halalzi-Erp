import { NextResponse } from "next/server";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeJournalEntrySelect } from "../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.journals.cancel");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const existingEntry = await prisma.journalEntry.findFirst({
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
      throw forbidden("You do not have permission to cancel this journal entry.");
    }

    if (existingEntry.status !== "draft") {
      throw new AppError("VALIDATION_ERROR", "Only draft journal entries can be cancelled in this MVP.", 400);
    }

    const journalEntry = await prisma.journalEntry.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      select: safeJournalEntrySelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "finance.journal.cancel",
      entityType: "journal_entry",
      entityId: journalEntry.id,
      summary: `Journal entry cancelled: ${journalEntry.entryNumber}`,
      metadata: {
        entryNumber: journalEntry.entryNumber,
        status: journalEntry.status,
      },
    });

    return NextResponse.json({ journalEntry });
  } catch (error) {
    return errorResponse(error);
  }
}
