import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const safeAuditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  summary: true,
  metadata: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export async function GET() {
  try {
    const currentUser = await requirePermission("audit.read");
    const scope = companyScope(currentUser);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: safeAuditLogSelect,
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json({ auditLogs });
  } catch (error) {
    return errorResponse(error);
  }
}
