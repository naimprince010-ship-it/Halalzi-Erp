import { z } from "zod";

const expenseStatuses = ["posted", "reversed"] as const;
const paymentMethods = ["cash", "bank_transfer", "card", "cheque", "other"] as const;

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Amount must be a valid number.")
  .refine((value) => value > 0, "Amount must be greater than zero.");

export const createExpenseSchema = z.object({
  expenseDate: z.string().trim().datetime().optional(),
  amount: moneySchema,
  categoryAccountId: z.string().trim().min(1, "Category account is required."),
  paidFromAccountId: z.string().trim().min(1, "Paid-from account is required."),
  method: z.enum(paymentMethods).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export const reverseExpenseSchema = z.object({
  reversalDate: z.string().trim().datetime().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const expenseListQuerySchema = z
  .object({
    from: z.string().trim().datetime().optional(),
    to: z.string().trim().datetime().optional(),
    categoryAccountId: z.string().trim().min(1).optional(),
    status: z.enum(expenseStatuses).optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) return true;
      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    { message: "from must be earlier than or equal to to." },
  );

export const safeExpenseSelect = {
  id: true,
  expenseNumber: true,
  expenseDate: true,
  amount: true,
  status: true,
  method: true,
  reference: true,
  note: true,
  categoryAccountId: true,
  paidFromAccountId: true,
  journalEntryId: true,
  reversalJournalEntryId: true,
  reversedAt: true,
  createdByUserId: true,
  reversedByUserId: true,
  createdAt: true,
  updatedAt: true,
  categoryAccount: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      kind: true,
    },
  },
  paidFromAccount: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      kind: true,
    },
  },
  journalEntry: {
    select: {
      id: true,
      entryNumber: true,
      status: true,
      entryDate: true,
      totalDebit: true,
      totalCredit: true,
    },
  },
  reversalJournalEntry: {
    select: {
      id: true,
      entryNumber: true,
      status: true,
      entryDate: true,
      totalDebit: true,
      totalCredit: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  reversedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export function generateExpenseNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");

  return `EXP-${datePart}-${randomPart}`;
}

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
