import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const purchaseOrderItemSchema = z.object({
  productId: z.string().trim().min(1, "productId is required."),
  quantity: z.number().int("quantity must be an integer.").positive("quantity must be greater than 0."),
  unitCost: decimalInputSchema.refine((value) => value >= 0, "unitCost must be non-negative.").optional(),
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().trim().min(1, "vendorId is required."),
  notes: z.string().trim().max(500).optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "At least one order item is required."),
});

export const updatePurchaseOrderSchema = z.object({
  vendorId: z.string().trim().min(1, "vendorId is required.").optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["draft", "pending_approval", "approved", "rejected", "ordered", "received", "cancelled"]).optional(),
  discountAmount: decimalInputSchema
    .refine((value) => value >= 0, "discountAmount must be non-negative.")
    .optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "At least one order item is required.").optional(),
});

export const approvalNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const rejectionReasonSchema = z.object({
  reason: z.string().trim().min(1, "reason is required.").max(500, "reason must be 500 characters or less."),
});

export const purchaseOrderStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "ordered",
  "received",
  "cancelled",
] as const;

export type PurchaseOrderStatusInput = (typeof purchaseOrderStatuses)[number];

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export type PreparedPurchaseOrderItem = {
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

export const safePurchaseOrderSelect = {
  id: true,
  purchaseOrderNumber: true,
  vendorId: true,
  vendorNameSnapshot: true,
  vendorPhoneSnapshot: true,
  vendorEmailSnapshot: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  notes: true,
  submittedAt: true,
  submittedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  approvedAt: true,
  approvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  rejectedAt: true,
  rejectedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  rejectionReason: true,
  approvalNote: true,
  orderedAt: true,
  receivedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      productSkuSnapshot: true,
      quantity: true,
      unitCost: true,
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

export function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

export function generatePurchaseOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `PO-${datePart}-${randomPart}`;
}

export async function resolvePurchaseVendor(
  client: DbClient,
  vendorId: string,
  companyId: string,
) {
  const vendor = await client.vendor.findFirst({
    where: { id: vendorId, companyId },
    select: { id: true, name: true, phone: true, email: true },
  });

  if (!vendor) {
    throw new AppError("FORBIDDEN", "Vendor not found or not accessible.", 403);
  }

  return vendor;
}

export async function preparePurchaseItems(
  client: DbClient,
  companyId: string,
  items: Array<{ productId: string; quantity: number; unitCost?: number }>,
): Promise<PreparedPurchaseOrderItem[]> {
  const productIds = items.map((item) => item.productId);
  const uniqueProductIds = new Set(productIds);

  if (uniqueProductIds.size !== items.length) {
    throw new AppError("VALIDATION_ERROR", "Duplicate product items are not allowed.", 400);
  }

  const products = await client.product.findMany({
    where: {
      id: { in: [...uniqueProductIds] },
      companyId,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true,
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

    const unitCost =
      item.unitCost !== undefined
        ? round2(item.unitCost)
        : product.costPrice !== null
          ? round2(Number(product.costPrice))
          : round2(Number(product.salePrice));

    const lineTotal = round2(unitCost * item.quantity);

    return {
      productId: product.id,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      quantity: item.quantity,
      unitCost,
      lineTotal,
    };
  });
}

export function computePurchaseTotals(
  items: PreparedPurchaseOrderItem[],
  discountAmountInput: number | undefined,
) {
  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountAmount = round2(discountAmountInput ?? 0);
  const totalAmount = round2(subtotal - discountAmount);

  if (totalAmount < 0) {
    throw new AppError("VALIDATION_ERROR", "totalAmount cannot be negative.", 400);
  }

  return { subtotal, discountAmount, totalAmount };
}

export function computePurchaseTotalsFromSubtotal(
  subtotalInput: number,
  discountAmountInput: number | undefined,
) {
  const subtotal = round2(subtotalInput);
  const discountAmount = round2(discountAmountInput ?? 0);
  const totalAmount = round2(subtotal - discountAmount);

  if (totalAmount < 0) {
    throw new AppError("VALIDATION_ERROR", "totalAmount cannot be negative.", 400);
  }

  return { subtotal, discountAmount, totalAmount };
}
