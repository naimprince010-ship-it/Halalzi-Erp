import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { createDefaultCompanyRoles } from "@/lib/rbac/default-roles";

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email.")
    .max(255)
    .transform((value) => value.toLowerCase()),
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters.")
    .max(128),
});

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

export async function GET() {
  try {
    const currentUser = await requirePermission("users.read");
    const scope = companyScope(currentUser);

    const users = await prisma.user.findMany({
      where: {
        companyId: scope.companyId,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        roles: user.userRoles.map((ur) => ur.role),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("users.create");
    const scope = companyScope(currentUser);
    const input = createUserSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppError("EMAIL_ALREADY_EXISTS", "An account with this email already exists.", 409);
    }

    const passwordHash = await hashPassword(input.temporaryPassword);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId: scope.companyId,
          name: input.name,
          email: input.email,
          passwordHash,
          status: "active",
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
        },
      });

      let staffRole = await tx.role.findUnique({
        where: {
          companyId_key: {
            companyId: scope.companyId,
            key: "staff",
          },
        },
        select: { id: true },
      });

      // Ensure least-privilege default role exists before assigning.
      if (!staffRole) {
        await createDefaultCompanyRoles(tx, scope.companyId);
        staffRole = await tx.role.findUnique({
          where: {
            companyId_key: {
              companyId: scope.companyId,
              key: "staff",
            },
          },
          select: { id: true },
        });
      }

      if (staffRole) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: staffRole.id,
          },
        });
      }

      return user;
    });

    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("EMAIL_ALREADY_EXISTS", "An account with this email already exists.", 409),
      );
    }

    return errorResponse(error);
  }
}
