import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeStockLedgerEntrySelect } from "../../_stock-ledger";

const entryTypes = [
  "opening_balance",
  "manual_adjustment",
  "sales_order_confirm",
  "sales_order_cancel",
  "purchase_order_receive",
  "purchase_order_cancel",
] as const;

const sourceTypes = ["product", "sales_order", "purchase_order"] as const;

const stockLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  type: z.enum(entryTypes).optional(),
  sourceType: z.enum(sourceTypes).optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("products.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Product id is required.", 400);
    }

    const product = await prisma.product.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
      },
    });

    if (!product) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this product.", 403);
    }

    const { searchParams } = new URL(request.url);
    const filters = stockLedgerQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      sourceType: searchParams.get("sourceType") ?? undefined,
    });

    const where = {
      companyId: scope.companyId,
      productId: id,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
    };

    const [total, entries] = await Promise.all([
      prisma.stockLedgerEntry.count({ where }),
      prisma.stockLedgerEntry.findMany({
        where,
        select: safeStockLedgerEntrySelect,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    ]);

    return NextResponse.json({
      entries,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.ceil(total / filters.pageSize),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid stock ledger filters.", 400));
    }

    return errorResponse(error);
  }
}
