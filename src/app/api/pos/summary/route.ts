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

    const [todaySummary, latestSales, activeSession, todaySessionSummary] = await prisma.$transaction([
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
      prisma.posSession.findFirst({
        where: {
          companyId: scope.companyId,
          cashierUserId: currentUser.user.id,
          status: "open",
        },
        select: {
          id: true,
          counterName: true,
          status: true,
          openingFloat: true,
          openedAt: true,
        },
        orderBy: { openedAt: "desc" },
      }),
      prisma.posSession.aggregate({
        where: {
          companyId: scope.companyId,
          openedAt: { gte: today },
        },
        _count: { id: true },
        _sum: {
          openingFloat: true,
          closingCash: true,
          expectedCash: true,
          variance: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: {
        today: {
          saleCount: todaySummary._count.id,
          totalAmount: todaySummary._sum.totalAmount ?? 0,
          sessionCount: todaySessionSummary._count.id,
          openingFloat: todaySessionSummary._sum.openingFloat ?? 0,
          closingCash: todaySessionSummary._sum.closingCash ?? 0,
          expectedCash: todaySessionSummary._sum.expectedCash ?? 0,
          variance: todaySessionSummary._sum.variance ?? 0,
        },
        activeSession,
        latestSales,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
