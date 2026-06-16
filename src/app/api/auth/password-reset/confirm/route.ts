import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { hashPassword } from "@/lib/auth/password";
import { hashPasswordResetToken } from "@/lib/auth/password-reset";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";

const confirmPasswordResetSchema = z
  .object({
    token: z.string().trim().min(32).max(256),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    const input = confirmPasswordResetSchema.parse(await request.json());
    const tokenHash = hashPasswordResetToken(input.token);
    const passwordHash = await hashPassword(input.password);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            companyId: true,
            status: true,
            company: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (!resetToken || resetToken.user.status !== "active" || resetToken.user.company.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "This password reset link is invalid or expired.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      await tx.session.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await recordAuditLog({
      companyId: resetToken.user.companyId,
      userId: resetToken.user.id,
      action: "auth.password_reset.confirm",
      entityType: "user",
      entityId: resetToken.user.id,
      summary: `Password reset completed for ${resetToken.user.name}.`,
    });

    return NextResponse.json({
      ok: true,
      message: "Password reset complete. Please sign in with your new password.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide a valid password reset request.", 400));
    }

    return errorResponse(error);
  }
}
