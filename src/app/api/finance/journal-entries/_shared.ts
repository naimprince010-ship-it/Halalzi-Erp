import { z } from "zod";

import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const journalSourceTypes = ["manual", "sales_order", "purchase_order"] as const;
const journalStatuses = ["draft", "posted", "cancelled"] as const;

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Amount must be a valid number.")
  .refine((value) => value >= 0, "Amount must be zero or greater.");

const journalLineSchema = z
  .object({
    accountId: z.string().trim().min(1, "accountId is required."),
    description: z.string().trim().max(255).optional(),
    debit: moneySchema.optional(),
    credit: moneySchema.optional(),
  })
  .superRefine((line, context) => {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;

    if (debit <= 0 && credit <= 0) {
      context.addIssue({
        code: "custom",
        message: "Each journal line must have either debit or credit.",
      });
    }

    if (debit > 0 && credit > 0) {
      context.addIssue({
        code: "custom",
        message: "A journal line cannot have both debit and credit.",
      });
    }
  });

export const createJournalEntrySchema = z.object({
  entryNumber: z.string().trim().min(1).max(64).optional(),
  entryDate: z.string().trim().datetime().optional(),
  sourceType: z.enum(journalSourceTypes).optional(),
  sourceId: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  lines: z.array(journalLineSchema).min(2, "At least two journal lines are required."),
});

export const updateJournalEntrySchema = z
  .object({
    entryNumber: z.string().trim().min(1).max(64).optional(),
    entryDate: z.string().trim().datetime().optional(),
    sourceType: z.enum(journalSourceTypes).optional(),
    sourceId: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    lines: z.array(journalLineSchema).min(2, "At least two journal lines are required.").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one journal field is required.");

export const journalListQuerySchema = z.object({
  status: z.enum(journalStatuses).optional(),
  sourceType: z.enum(journalSourceTypes).optional(),
});

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;

export type PreparedJournalLine = {
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
};

export const safeJournalEntrySelect = {
  id: true,
  entryNumber: true,
  entryDate: true,
  sourceType: true,
  sourceId: true,
  description: true,
  status: true,
  totalDebit: true,
  totalCredit: true,
  postedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    select: {
      id: true,
      accountId: true,
      description: true,
      debit: true,
      credit: true,
      createdAt: true,
      account: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
} as const;

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export function generateEntryNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `JE-${datePart}-${randomPart}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function prepareJournalLines(
  client: DbClient,
  companyId: string,
  lines: Array<{ accountId: string; description?: string; debit?: number; credit?: number }>,
): Promise<PreparedJournalLine[]> {
  const accountIds = lines.map((line) => line.accountId);
  const uniqueAccountIds = new Set(accountIds);

  const accounts = await client.financeAccount.findMany({
    where: {
      id: { in: [...uniqueAccountIds] },
      companyId,
      status: "active",
    },
    select: {
      id: true,
    },
  });

  if (accounts.length !== uniqueAccountIds.size) {
    throw new AppError("FORBIDDEN", "One or more selected finance accounts are not accessible.", 403);
  }

  return lines.map((line) => ({
    accountId: line.accountId,
    description: line.description,
    debit: round2(line.debit ?? 0),
    credit: round2(line.credit ?? 0),
  }));
}

export function computeJournalTotals(lines: PreparedJournalLine[]) {
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));

  return { totalDebit, totalCredit };
}

export function ensureBalanced(totalDebit: number, totalCredit: number) {
  if (round2(totalDebit) !== round2(totalCredit)) {
    throw new AppError("VALIDATION_ERROR", "Journal entry must be balanced before posting.", 400);
  }
}

export async function applyPostedJournalBalances(
  tx: Prisma.TransactionClient,
  lines: Array<{
    accountId: string;
    debit: Prisma.Decimal | number;
    credit: Prisma.Decimal | number;
    account: { type: string };
  }>,
) {
  for (const line of lines) {
    const debit = Number(line.debit);
    const credit = Number(line.credit);
    const normalDebit = line.account.type === "asset" || line.account.type === "expense";
    const delta = normalDebit ? debit - credit : credit - debit;

    await tx.financeAccount.update({
      where: { id: line.accountId },
      data: {
        currentBalance: {
          increment: round2(delta),
        },
      },
    });
  }
}
