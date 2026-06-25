import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET() {
  try {
    const currentUser = await requirePermission("pos.read");
    const scope = companyScope(currentUser);
    const today = startOfToday();

    const [todaySummary, latestSales] = await prisma.$transaction([
      prisma.posSale.aggregate({
        where: {
          companyId: scope.companyId,
          status: "completed",
          completedAt: { gte: today },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.posSale.findMany({
        where: {
          companyId: scope.companyId,
        },
        select: {
          id: true,
          saleNumber: true,
          status: true,
          totalAmount: true,
          paymentMethod: true,
          completedAt: true,
        },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      data: {
        today: {
          saleCount: todaySummary._count.id,
          totalAmount: todaySummary._sum.totalAmount ?? 0,
        },
        latestSales,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
