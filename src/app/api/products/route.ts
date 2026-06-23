import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { recordProductOpeningBalance } from "./_stock-ledger";

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(120),
  sku: z.string().trim().min(1, "SKU is required.").max(64),
  category: z.string().trim().max(80).optional(),
  salePrice: decimalInputSchema.refine((value) => value >= 0, "Sale price must be non-negative."),
  costPrice: decimalInputSchema
    .refine((value) => value >= 0, "Cost price must be non-negative.")
    .optional(),
  stockQuantity: z
    .number()
    .int("Stock quantity must be an integer.")
    .min(0, "Stock quantity must be non-negative."),
  status: z.enum(["active", "inactive"]).optional(),
});

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

const safeProductSelect = {
  id: true,
  name: true,
  sku: true,
  category: true,
  salePrice: true,
  costPrice: true,
  stockQuantity: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  try {
    const currentUser = await requirePermission("products.read");
    const scope = companyScope(currentUser);

    const products = await prisma.product.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: safeProductSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ products });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("products.create");
    const scope = companyScope(currentUser);
    const input = createProductSchema.parse(await request.json());

    let stockLedgerEntryId: string | null = null;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId: scope.companyId,
          name: input.name,
          sku: input.sku,
          category: input.category,
          salePrice: input.salePrice,
          costPrice: input.costPrice,
          stockQuantity: input.stockQuantity,
          status: input.status ?? "active",
        },
        select: safeProductSelect,
      });

      const stockLedgerEntry = await recordProductOpeningBalance(tx, scope.companyId, {
        productId: created.id,
        stockQuantity: created.stockQuantity,
        createdByUserId: currentUser.user.id,
      });

      stockLedgerEntryId = stockLedgerEntry?.id ?? null;

      return created;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "product.create",
      entityType: "product",
      entityId: product.id,
      summary: `Product created: ${product.name}`,
      metadata: {
        sku: product.sku,
        status: product.status,
        stockQuantity: product.stockQuantity,
        stockLedgerEntryId,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A product with this SKU already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
