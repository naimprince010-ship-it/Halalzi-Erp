import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { createDefaultCompanyRoles } from "@/lib/rbac/default-roles";

async function syncPermissions() {
  const currentUser = await requirePermission("roles.update");
  const scope = companyScope(currentUser);

  const beforePosPermissions = await prisma.permission.findMany({
    where: {
      key: { startsWith: "pos." },
      rolePermissions: {
        some: {
          role: {
            companyId: scope.companyId,
            key: "admin",
          },
        },
      },
    },
    select: { key: true },
    orderBy: { key: "asc" },
  });

  const { adminRole } = await createDefaultCompanyRoles(prisma, scope.companyId);

  await prisma.userRole.createMany({
    data: [{ userId: currentUser.user.id, roleId: adminRole.id }],
    skipDuplicates: true,
  });

  const [permissionCount, adminPermissionCount, posPermissions] = await Promise.all([
    prisma.permission.count(),
    prisma.rolePermission.count({
      where: {
        roleId: adminRole.id,
      },
    }),
    prisma.permission.findMany({
      where: {
        key: { startsWith: "pos." },
        rolePermissions: {
          some: {
            roleId: adminRole.id,
          },
        },
      },
      select: { key: true },
      orderBy: { key: "asc" },
    }),
  ]);

  await recordAuditLog({
    companyId: scope.companyId,
    userId: currentUser.user.id,
    action: "admin.permissions.sync",
    entityType: "role",
    entityId: adminRole.id,
    summary: "Default permissions and role templates synced.",
    metadata: {
      permissionCount,
      adminPermissionCount,
      posPermissionCount: posPermissions.length,
      previousPosPermissionCount: beforePosPermissions.length,
    },
  });

  return {
    permissionCount,
    adminPermissionCount,
    posPermissions: posPermissions.map((permission) => permission.key),
  };
}

export async function POST() {
  try {
    const result = await syncPermissions();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
