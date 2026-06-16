import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

export async function GET() {
  try {
    const currentUser = await requirePermission("roles.read");
    const scope = companyScope(currentUser);

    const roles = await prisma.role.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        createdAt: true,
        rolePermissions: {
          select: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    const permissions = await prisma.permission.findMany({
      select: {
        id: true,
        key: true,
        module: true,
        action: true,
        description: true,
      },
      orderBy: [
        {
          module: "asc",
        },
        {
          key: "asc",
        },
      ],
    });

    return NextResponse.json({
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        key: role.key,
        description: role.description,
        createdAt: role.createdAt,
        permissions: role.rolePermissions.map((rolePermission) => rolePermission.permission),
      })),
      permissions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
