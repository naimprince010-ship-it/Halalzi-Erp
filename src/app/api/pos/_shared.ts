import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const moneyInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const posSaleItemSchema = z.object({
  productId: z.string().trim().min(1, "productId is required."),
  quantity: z.number().int("quantity must be an integer.").positive("quantity must be greater than 0."),
});

export const POS_PAYMENT_METHODS = ["cash", "bank_transfer", "card", "cheque", "mobile_money", "other"] as const;

export const createPosSaleSchema = z.object({
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  discountAmount: moneyInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  paidAmount: moneyInputSchema.refine((value) => value > 0, "paidAmount must be greater than 0."),
  paymentMethod: z.enum(POS_PAYMENT_METHODS).default("cash"),
  paymentAccountId: z.string().trim().min(1).optional(),
  items: z.array(posSaleItemSchema).min(1, "At least one POS item is required."),
});

export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;

export type PreparedPosSaleItem = {
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export const safePosSaleSelect = {
  id: true,
  saleNumber: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  paidAmount: true,
  changeAmount: true,
  paymentMethod: true,
  paymentAccountId: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  cashierUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  paymentAccount: {
    select: {
      id: true,
      name: true,
      code: true,
      kind: true,
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

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

export function generatePosSaleNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `POS-${datePart}-${randomPart}`;
}

export async function preparePosSaleItems(
  client: DbClient,
  companyId: string,
  items: Array<{ productId: string; quantity: number }>,
): Promise<PreparedPosSaleItem[]> {
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
      stockQuantity: true,
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

    if (product.stockQuantity < item.quantity) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Insufficient stock for product ${product.sku}. Available ${product.stockQuantity}, required ${item.quantity}.`,
        400,
      );
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

export function computePosSaleTotals(items: PreparedPosSaleItem[], discountAmountInput: number | undefined) {
  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountAmount = round2(discountAmountInput ?? 0);
  const totalAmount = round2(subtotal - discountAmount);

  if (totalAmount < 0) {
    throw new AppError("VALIDATION_ERROR", "totalAmount cannot be negative.", 400);
  }

  return { subtotal, discountAmount, totalAmount };
}
