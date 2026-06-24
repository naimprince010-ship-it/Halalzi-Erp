import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";

const dueDateSchema = z.string().trim().datetime();

export const createSalesInvoiceFromOrderSchema = z.object({
  salesOrderId: z.string().trim().min(1, "salesOrderId is required."),
  quotationId: z.string().trim().min(1).optional(),
  dueDate: dueDateSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateSalesInvoiceSchema = z.object({
  dueDate: dueDateSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const invoiceStatuses = ["draft", "issued", "partial", "paid", "cancelled"] as const;
export type InvoiceStatusValue = (typeof invoiceStatuses)[number];

export const safeSalesInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  salesOrderId: true,
  quotationId: true,
  receivableId: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  customerEmailSnapshot: true,
  customerAddressSnapshot: true,
  status: true,
  invoiceDate: true,
  dueDate: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  notes: true,
  issuedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  receivable: {
    select: {
      id: true,
      salesOrderId: true,
      customerNameSnapshot: true,
      amount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
    },
  },
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

export function generateInvoiceNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `INV-${datePart}-${randomPart}`;
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

export function parseInvoiceStatusFilter(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (!invoiceStatuses.includes(normalized as InvoiceStatusValue)) {
    throw new AppError("VALIDATION_ERROR", "Invalid invoice status filter.", 400);
  }

  return normalized as InvoiceStatusValue;
}
