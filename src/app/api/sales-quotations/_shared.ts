import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";
import {
  computeOrderTotals,
  computeOrderTotalsFromSubtotal,
  isUniqueConstraintError,
  normalizeNullableText,
  normalizeOptionalText,
  prepareOrderItems,
} from "@/app/api/sales-orders/_shared";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const quotationItemSchema = z.object({
  productId: z.string().trim().min(1, "productId is required."),
  quantity: z.number().int("quantity must be an integer.").positive("quantity must be greater than 0."),
});

export const createSalesQuotationSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required.").max(120),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.string().trim().email("Please provide a valid customerEmail.").max(255).optional(),
  customerAddress: z.string().trim().max(255).optional(),
  validUntil: z.string().trim().datetime().optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(quotationItemSchema).min(1, "At least one quotation item is required."),
});

export const updateSalesQuotationSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required.").max(120).optional(),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  customerEmail: z.string().trim().email("Please provide a valid customerEmail.").max(255).nullable().optional(),
  customerAddress: z.string().trim().max(255).nullable().optional(),
  validUntil: z.string().trim().datetime().nullable().optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z.array(quotationItemSchema).min(1, "At least one quotation item is required.").optional(),
});

export const quotationStatuses = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuotationStatusValue = (typeof quotationStatuses)[number];

export const safeSalesQuotationSelect = {
  id: true,
  quoteNumber: true,
  salesOrderId: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerAddress: true,
  status: true,
  validUntil: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  notes: true,
  sentAt: true,
  acceptedAt: true,
  rejectedAt: true,
  expiredAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      productSkuSnapshot: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
} as const;

export function generateQuoteNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `QT-${datePart}-${randomPart}`;
}

export function parseQuotationStatusFilter(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (!quotationStatuses.includes(normalized as QuotationStatusValue)) {
    throw new AppError("VALIDATION_ERROR", "Invalid quotation status filter.", 400);
  }

  return normalized as QuotationStatusValue;
}

export function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid pagination values.", 400);
  }

  return parsed;
}

export async function createPreparedQuotationItems(
  client: DbClient,
  companyId: string,
  items: Array<{ productId: string; quantity: number }>,
) {
  return prepareOrderItems(client, companyId, items);
}

export {
  computeOrderTotals,
  computeOrderTotalsFromSubtotal,
  isUniqueConstraintError,
  normalizeNullableText,
  normalizeOptionalText,
};
