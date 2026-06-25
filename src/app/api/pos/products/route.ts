import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? 20);

  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("pos.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = parseLimit(searchParams.get("limit"));

    const products = await prisma.product.findMany({
      where: {
        companyId: scope.companyId,
        status: "active",
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        salePrice: true,
        stockQuantity: true,
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      take: limit * 2,
    });

    const sortedProducts = search
      ? products.sort((left, right) => {
          const leftExact = left.sku.toLowerCase() === search.toLowerCase() ? 0 : 1;
          const rightExact = right.sku.toLowerCase() === search.toLowerCase() ? 0 : 1;
          return leftExact - rightExact || left.name.localeCompare(right.name);
        })
      : products;

    return NextResponse.json({
      data: sortedProducts.slice(0, limit),
      meta: {
        limit,
        search: search || null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
