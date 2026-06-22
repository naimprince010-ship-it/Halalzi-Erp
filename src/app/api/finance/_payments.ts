import { z } from "zod";

import { AppError } from "@/lib/auth/auth-errors";

const paymentMethods = ["cash", "bank_transfer", "card", "cheque", "other"] as const;

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Amount must be a valid number.")
  .refine((value) => value > 0, "Amount must be greater than zero.");

export const createPaymentSchema = z.object({
  amount: moneySchema,
  paymentDate: z.string().trim().datetime().optional(),
  method: z.enum(paymentMethods).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export const safeReceivablePaymentSelect = {
  id: true,
  receivableId: true,
  amount: true,
  paymentDate: true,
  method: true,
  reference: true,
  note: true,
  createdByUserId: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export const safePayablePaymentSelect = {
  id: true,
  payableId: true,
  amount: true,
  paymentDate: true,
  method: true,
  reference: true,
  note: true,
  createdByUserId: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function addPaymentAmount(currentPaidAmount: number, paymentAmount: number, totalAmount: number) {
  const nextPaidAmount = round2(currentPaidAmount + paymentAmount);

  if (nextPaidAmount > round2(totalAmount)) {
    throw new AppError("VALIDATION_ERROR", "Payment amount exceeds remaining balance.", 400);
  }

  return nextPaidAmount;
}
