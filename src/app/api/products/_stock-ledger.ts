import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient, StockLedgerEntryType, StockLedgerSourceType } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

type StockMovementInput = {
  productId: string;
  type: StockLedgerEntryType;
  sourceType: StockLedgerSourceType;
  sourceId: string;
  quantityDelta: number;
  createdByUserId?: string | null;
  note?: string | null;
};

type ProductMovementInput = {
  productId: string;
  quantity: number;
};

export const safeStockLedgerEntrySelect = {
  id: true,
  type: true,
  sourceType: true,
  sourceId: true,
  quantityDelta: true,
  balanceBefore: true,
  balanceAfter: true,
  note: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export async function recordStockLedgerEntry(
  tx: DbClient,
  companyId: string,
  input: StockMovementInput,
) {
  const product = await tx.product.findFirst({
    where: {
      id: input.productId,
      companyId,
    },
    select: {
      id: true,
      stockQuantity: true,
    },
  });

  if (!product) {
    throw new AppError("FORBIDDEN", "One or more products are not accessible.", 403);
  }

  const balanceAfter = product.stockQuantity;
  const balanceBefore = balanceAfter - input.quantityDelta;

  return tx.stockLedgerEntry.create({
    data: {
      companyId,
      productId: input.productId,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      quantityDelta: input.quantityDelta,
      balanceBefore,
      balanceAfter,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function recordProductOpeningBalance(
  tx: DbClient,
  companyId: string,
  input: {
    productId: string;
    stockQuantity: number;
    createdByUserId?: string | null;
  },
) {
  if (input.stockQuantity <= 0) {
    return null;
  }

  return tx.stockLedgerEntry.create({
    data: {
      companyId,
      productId: input.productId,
      type: "opening_balance",
      sourceType: "product",
      sourceId: input.productId,
      quantityDelta: input.stockQuantity,
      balanceBefore: 0,
      balanceAfter: input.stockQuantity,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function recordManualStockAdjustment(
  tx: DbClient,
  companyId: string,
  input: {
    productId: string;
    balanceBefore: number;
    balanceAfter: number;
    createdByUserId?: string | null;
  },
) {
  const quantityDelta = input.balanceAfter - input.balanceBefore;

  if (quantityDelta === 0) {
    return null;
  }

  return tx.stockLedgerEntry.create({
    data: {
      companyId,
      productId: input.productId,
      type: "manual_adjustment",
      sourceType: "product",
      sourceId: input.productId,
      quantityDelta,
      balanceBefore: input.balanceBefore,
      balanceAfter: input.balanceAfter,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function recordSalesStockMovements(
  tx: DbClient,
  companyId: string,
  input: {
    salesOrderId: string;
    type: "sales_order_confirm" | "sales_order_cancel";
    items: ProductMovementInput[];
    createdByUserId?: string | null;
  },
) {
  return Promise.all(
    input.items.map((item) =>
      recordStockLedgerEntry(tx, companyId, {
        productId: item.productId,
        type: input.type,
        sourceType: "sales_order",
        sourceId: input.salesOrderId,
        quantityDelta: input.type === "sales_order_confirm" ? -item.quantity : item.quantity,
        createdByUserId: input.createdByUserId,
      }),
    ),
  );
}

export async function recordPurchaseStockMovements(
  tx: DbClient,
  companyId: string,
  input: {
    purchaseOrderId: string;
    type: "purchase_order_receive" | "purchase_order_cancel";
    items: ProductMovementInput[];
    createdByUserId?: string | null;
  },
) {
  return Promise.all(
    input.items.map((item) =>
      recordStockLedgerEntry(tx, companyId, {
        productId: item.productId,
        type: input.type,
        sourceType: "purchase_order",
        sourceId: input.purchaseOrderId,
        quantityDelta: input.type === "purchase_order_receive" ? item.quantity : -item.quantity,
        createdByUserId: input.createdByUserId,
      }),
    ),
  );
}
