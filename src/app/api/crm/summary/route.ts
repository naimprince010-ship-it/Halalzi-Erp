import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { ensureDefaultPipelineStages, safePipelineStageSelect } from "../_shared";

export async function GET() {
  try {
    const currentUser = await requirePermission("crm.deals.read");
    const scope = companyScope(currentUser);
    const now = new Date();

    await ensureDefaultPipelineStages(prisma, scope.companyId);

    const [dealCounts, activeDealAggregate, taskCounts, overdueTasks, stages] = await Promise.all([
      prisma.deal.groupBy({
        by: ["status"],
        where: { companyId: scope.companyId },
        _count: { _all: true },
      }),
      prisma.deal.aggregate({
        where: { companyId: scope.companyId, status: "active" },
        _sum: { value: true },
      }),
      prisma.salesTask.groupBy({
        by: ["status"],
        where: { companyId: scope.companyId },
        _count: { _all: true },
      }),
      prisma.salesTask.count({
        where: {
          companyId: scope.companyId,
          dueAt: { lt: now },
          status: { in: ["pending", "in_progress"] },
        },
      }),
      prisma.pipelineStage.findMany({
        where: { companyId: scope.companyId },
        select: {
          ...safePipelineStageSelect,
          _count: { select: { activeDeals: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return NextResponse.json({
      summary: {
        dealCounts,
        activeDealValue: activeDealAggregate._sum.value ?? 0,
        taskCounts,
        overdueTasks,
        stages,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
