import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const updateUserStatusSchema = z.object({
  status: z.enum(["active", "invited", "disabled"]),
});

const updateUserBasicInfoSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80).optional(),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email.")
    .max(255)
    .transform((value) => value.toLowerCase())
    .optional(),
});

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireAuth();
    const scope = companyScope(currentUser);
    const { id } = await params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "User id is required.", 400);
    }

    const rawInput = await request.json();

    if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
      throw new AppError("VALIDATION_ERROR", "Invalid request payload.", 400);
    }

    const input = rawInput as Record<string, unknown>;

    // Route intent by known update fields only; ignore unrelated injected keys like companyId.
    const hasStatusField = "status" in input;
    const hasBasicInfoField = "name" in input || "email" in input;
    const isStatusUpdate = hasStatusField && !hasBasicInfoField;
    const isBasicInfoUpdate = hasBasicInfoField && !hasStatusField;

    if (!isStatusUpdate && !isBasicInfoUpdate) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Request must contain either 'status' OR 'name'/'email', not both.",
        400,
      );
    }

    // Verify target user belongs to the same company
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingUser) {
      throw new AppError("FORBIDDEN", "You do not have permission to update this user.", 403);
    }

    // Handle status update
    if (isStatusUpdate) {
      const statusInput = updateUserStatusSchema.parse(input);

      if (id === currentUser.user.id && statusInput.status === "disabled") {
        throw new AppError("FORBIDDEN", "You cannot disable your own account.", 403);
      }

      const canDisable = currentUser.permissions.includes("users.disable");
      const canUpdate = currentUser.permissions.includes("users.update");

      if (statusInput.status === "disabled" && !canDisable) {
        throw new AppError("FORBIDDEN", "You do not have permission to disable users.", 403);
      }

      if (statusInput.status !== "disabled" && !canUpdate) {
        throw new AppError("FORBIDDEN", "You do not have permission to update user status.", 403);
      }

      const user = await prisma.user.update({
        where: {
          id,
        },
        data: {
          status: statusInput.status,
        },
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

      await recordAuditLog({
        companyId: scope.companyId,
        userId: currentUser.user.id,
        action: "user.status.update",
        entityType: "user",
        entityId: user.id,
        summary: `User status updated: ${user.name}`,
        metadata: {
          previousStatus: existingUser.status,
          nextStatus: user.status,
        },
      });

      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt,
          roles: user.userRoles.map((ur) => ur.role),
        },
      });
    }

    // Handle basic info update
    if (isBasicInfoUpdate) {
      const canUpdate = currentUser.permissions.includes("users.update");

      if (!canUpdate) {
        throw new AppError("FORBIDDEN", "You do not have permission to update user information.", 403);
      }

      const basicInfoInput = updateUserBasicInfoSchema.parse(input);

      if (!basicInfoInput.name && !basicInfoInput.email) {
        throw new AppError(
          "VALIDATION_ERROR",
          "At least one field (name or email) is required.",
          400,
        );
      }

      try {
        const user = await prisma.user.update({
          where: {
            id,
          },
          data: {
            ...(basicInfoInput.name && { name: basicInfoInput.name }),
            ...(basicInfoInput.email && { email: basicInfoInput.email }),
          },
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

        await recordAuditLog({
          companyId: scope.companyId,
          userId: currentUser.user.id,
          action: "user.update",
          entityType: "user",
          entityId: user.id,
          summary: `User updated: ${user.name}`,
          metadata: {
            nameChanged: Boolean(basicInfoInput.name),
            emailChanged: Boolean(basicInfoInput.email),
          },
        });

        return NextResponse.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            status: user.status,
            createdAt: user.createdAt,
            roles: user.userRoles.map((ur) => ur.role),
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new AppError(
            "EMAIL_ALREADY_EXISTS",
            "An account with this email already exists.",
            409,
          );
        }

        throw error;
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError(
          "VALIDATION_ERROR",
          error.issues[0]?.message ?? "Invalid input.",
          400,
        ),
      );
    }

    return errorResponse(error);
  }
}
