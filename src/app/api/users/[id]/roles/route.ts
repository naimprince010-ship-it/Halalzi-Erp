import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const assignRoleSchema = z.object({
  roleId: z.string().min(1, "Role ID is required."),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requirePermission("roles.assign");
    const scope = companyScope(currentUser);
    const { id } = await params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "User ID is required.", 400);
    }

    const input = assignRoleSchema.parse(await request.json());

    // Verify target user belongs to the same company as the current admin.
    const targetUser = await prisma.user.findFirst({
      where: { id, companyId: scope.companyId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new AppError(
        "FORBIDDEN",
        "You do not have permission to assign roles to this user.",
        403,
      );
    }

    // Verify the selected role belongs to the same company — never trust client-supplied companyId.
    const role = await prisma.role.findFirst({
      where: { id: input.roleId, companyId: scope.companyId },
      select: {
        id: true,
        key: true,
        rolePermissions: {
          select: {
            permission: { select: { key: true } },
          },
        },
      },
    });

    if (!role) {
      throw new AppError(
        "FORBIDDEN",
        "The selected role does not exist in your company.",
        403,
      );
    }

    // Self-demotion guard: prevent an admin from stripping their own roles.assign permission.
    if (id === currentUser.user.id) {
      const newPermissionKeys = role.rolePermissions.map((rp) => rp.permission.key);
      if (!newPermissionKeys.includes("roles.assign")) {
        throw new AppError(
          "FORBIDDEN",
          "You cannot remove your own admin access. Choose a role that retains the roles.assign permission.",
          403,
        );
      }
    }

    // Atomically replace all existing role assignments with the selected role.
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: input.roleId } });
    });

    // Fetch and return safe user fields (no passwordHash) with updated roles.
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, name: true, key: true } },
          },
        },
      },
    });

    if (!updatedUser) {
      throw new AppError("INTERNAL_SERVER_ERROR", "User not found after update.", 500);
    }

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        status: updatedUser.status,
        createdAt: updatedUser.createdAt,
        roles: updatedUser.userRoles.map((ur) => ur.role),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400),
      );
    }

    return errorResponse(error);
  }
}
