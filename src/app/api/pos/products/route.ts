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

function parseCursor(value: string | null) {
  const cursor = value?.trim();
  return cursor ? cursor : null;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("pos.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = parseLimit(searchParams.get("limit"));
    const cursor = parseCursor(searchParams.get("cursor"));

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
      orderBy: [{ name: "asc" }, { sku: "asc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });

    const pageProducts = products.slice(0, limit);
    const nextCursor = products.length > limit ? pageProducts.at(-1)?.id ?? null : null;

    return NextResponse.json({
      data: pageProducts,
      meta: {
        limit,
        search: search || null,
        cursor,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
