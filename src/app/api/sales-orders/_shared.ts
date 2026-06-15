import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const salesOrderItemSchema = z.object({
  productId: z.string().trim().min(1, "productId is required."),
  quantity: z.number().int("quantity must be an integer.").positive("quantity must be greater than 0."),
});

export const createSalesOrderSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required.").max(120),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.string().trim().email("Please provide a valid customerEmail.").max(255).optional(),
  customerAddress: z.string().trim().max(255).optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(salesOrderItemSchema).min(1, "At least one order item is required."),
});

export const updateSalesOrderSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required.").max(120).optional(),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  customerEmail: z.string().trim().email("Please provide a valid customerEmail.").max(255).nullable().optional(),
  customerAddress: z.string().trim().max(255).nullable().optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z.array(salesOrderItemSchema).min(1, "At least one order item is required.").optional(),
});

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;

export type PreparedOrderItem = {
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export const safeSalesOrderSelect = {
  id: true,
  orderNumber: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerAddress: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  notes: true,
  confirmedAt: true,
  cancelledAt: true,
  completedAt: true,
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeNullableText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

export function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `SO-${datePart}-${randomPart}`;
}

export async function prepareOrderItems(
  client: DbClient,
  companyId: string,
  items: Array<{ productId: string; quantity: number }>,
): Promise<PreparedOrderItem[]> {
  const productIds = items.map((item) => item.productId);
  const uniqueProductIds = new Set(productIds);

  if (uniqueProductIds.size !== items.length) {
    throw new AppError("VALIDATION_ERROR", "Duplicate product items are not allowed.", 400);
  }

  const products = await client.product.findMany({
    where: {
      id: { in: [...uniqueProductIds] },
      companyId,
      status: "active",
    },
    select: {
      id: true,
      name: true,
      sku: true,
      salePrice: true,
    },
  });

  if (products.length !== uniqueProductIds.size) {
    throw new AppError("FORBIDDEN", "One or more selected products are not accessible.", 403);
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const product = productById.get(item.productId);

    if (!product) {
      throw new AppError("FORBIDDEN", "One or more selected products are not accessible.", 403);
    }

    const unitPrice = round2(Number(product.salePrice));
    const lineTotal = round2(unitPrice * item.quantity);

    return {
      productId: product.id,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    };
  });
}

export function computeOrderTotals(items: PreparedOrderItem[], discountAmountInput: number | undefined) {
  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountAmount = round2(discountAmountInput ?? 0);
  const totalAmount = round2(subtotal - discountAmount);

  if (totalAmount < 0) {
    throw new AppError("VALIDATION_ERROR", "totalAmount cannot be negative.", 400);
  }

  return { subtotal, discountAmount, totalAmount };
}

export function computeOrderTotalsFromSubtotal(subtotalInput: number, discountAmountInput: number | undefined) {
  const subtotal = round2(subtotalInput);
  const discountAmount = round2(discountAmountInput ?? 0);
  const totalAmount = round2(subtotal - discountAmount);

  if (totalAmount < 0) {
    throw new AppError("VALIDATION_ERROR", "totalAmount cannot be negative.", 400);
  }

  return { subtotal, discountAmount, totalAmount };
}
