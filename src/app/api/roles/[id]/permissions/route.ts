import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requireAnyPermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().trim().min(1)).max(100),
});

const criticalSelfManagementPermissions = ["roles.read", "roles.assign", "roles.update"] as const;

const safeRoleSelect = {
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
} as const;

type SafeRole = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  createdAt: Date;
  rolePermissions: { permission: { id: string; key: string; description: string | null } }[];
};

function toSafeRole(role: SafeRole) {
  return {
    id: role.id,
    name: role.name,
    key: role.key,
    description: role.description,
    createdAt: role.createdAt,
    permissions: role.rolePermissions.map((rolePermission) => rolePermission.permission),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireAnyPermission(["roles.update", "roles.assign"]);
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateRolePermissionsSchema.parse(await request.json());
    const uniquePermissionIds = [...new Set(input.permissionIds)];

    const role = await prisma.role.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        key: true,
        userRoles: {
          where: {
            userId: currentUser.user.id,
          },
          select: {
            userId: true,
          },
        },
      },
    });

    if (!role) {
      throw forbidden("You do not have permission to update this role.");
    }

    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: uniquePermissionIds,
        },
      },
      select: {
        id: true,
        key: true,
      },
    });

    if (permissions.length !== uniquePermissionIds.length) {
      throw new AppError("VALIDATION_ERROR", "One or more permissions are invalid.", 400);
    }

    const permissionKeys = permissions.map((permission) => permission.key);
    const updatesCurrentUserRole = role.userRoles.length > 0;

    if (
      updatesCurrentUserRole &&
      criticalSelfManagementPermissions.some((permissionKey) => !permissionKeys.includes(permissionKey))
    ) {
      throw forbidden("You cannot remove your own role management access.");
    }

    const updatedRole = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return tx.role.findUniqueOrThrow({
        where: {
          id: role.id,
        },
        select: safeRoleSelect,
      });
    });

    return NextResponse.json({ role: toSafeRole(updatedRole) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid permissions.", 400));
    }

    return errorResponse(error);
  }
}
