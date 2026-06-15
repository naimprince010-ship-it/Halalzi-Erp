import { z } from "zod";

import { AppError } from "@/lib/auth/auth-errors";

export const settlementStatuses = ["open", "partial", "paid", "cancelled"] as const;
export type SettlementStatusValue = (typeof settlementStatuses)[number];

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Amount must be a valid number.")
  .refine((value) => value >= 0, "Amount must be zero or greater.");

export const updateSettlementSchema = z
  .object({
    paidAmount: moneySchema.optional(),
    status: z.enum(settlementStatuses).optional(),
    dueDate: z.string().trim().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one settlement field is required.");

export const settlementListQuerySchema = z.object({
  status: z.enum(settlementStatuses).optional(),
});

export const safeReceivableSelect = {
  id: true,
  salesOrderId: true,
  customerNameSnapshot: true,
  amount: true,
  paidAmount: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const safePayableSelect = {
  id: true,
  purchaseOrderId: true,
  vendorNameSnapshot: true,
  amount: true,
  paidAmount: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function deriveSettlementStatus(amount: number, paidAmount: number) {
  if (paidAmount === 0) {
    return "open";
  }

  if (paidAmount >= amount) {
    return "paid";
  }

  return "partial";
}

export function buildSettlementUpdate(
  input: { paidAmount?: number; status?: SettlementStatusValue; dueDate?: string | null },
  amount: number,
) {
  if (input.paidAmount !== undefined && input.paidAmount > amount) {
    throw new AppError("VALIDATION_ERROR", "Paid amount cannot exceed total amount.", 400);
  }

  const nextPaidAmount = input.paidAmount;
  const nextStatus: SettlementStatusValue | undefined =
    input.status ?? (nextPaidAmount !== undefined ? deriveSettlementStatus(amount, nextPaidAmount) : undefined);

  return {
    paidAmount: nextPaidAmount,
    status: nextStatus,
    dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate),
  };
}
