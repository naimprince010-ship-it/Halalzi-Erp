import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const updateProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(120).optional(),
  sku: z.string().trim().min(1, "SKU is required.").max(64).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  salePrice: decimalInputSchema.refine((value) => value >= 0, "Sale price must be non-negative.").optional(),
  costPrice: decimalInputSchema
    .refine((value) => value >= 0, "Cost price must be non-negative.")
    .nullable()
    .optional(),
  stockQuantity: z
    .number()
    .int("Stock quantity must be an integer.")
    .min(0, "Stock quantity must be non-negative.")
    .optional(),
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

async function findCompanyScopedProduct(productId: string, companyId: string) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      companyId,
    },
    select: {
      id: true,
      stockQuantity: true,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("products.read");
    const scope = companyScope(currentUser);
    const { id } = await params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Product id is required.", 400);
    }

    const product = await prisma.product.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeProductSelect,
    });

    if (!product) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this product.", 403);
    }

    return NextResponse.json({ product });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("products.update");
    const scope = companyScope(currentUser);
    const { id } = await params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Product id is required.", 400);
    }

    const input = updateProductSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a product.", 400);
    }

    const existingProduct = await findCompanyScopedProduct(id, scope.companyId);

    if (!existingProduct) {
      throw new AppError("FORBIDDEN", "You do not have permission to update this product.", 403);
    }

    if (
      input.stockQuantity !== undefined &&
      input.stockQuantity !== existingProduct.stockQuantity &&
      !currentUser.permissions.includes("inventory.adjust")
    ) {
      throw new AppError("FORBIDDEN", "You do not have permission to adjust stock quantity.", 403);
    }

    const product = await prisma.product.update({
      where: {
        id,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
        ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
        ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: safeProductSelect,
    });

    return NextResponse.json({ product });
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("products.delete");
    const scope = companyScope(currentUser);
    const { id } = await params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Product id is required.", 400);
    }

    const existingProduct = await findCompanyScopedProduct(id, scope.companyId);

    if (!existingProduct) {
      throw new AppError("FORBIDDEN", "You do not have permission to archive this product.", 403);
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        status: "inactive",
      },
      select: safeProductSelect,
    });

    return NextResponse.json({ product });
  } catch (error) {
    return errorResponse(error);
  }
}