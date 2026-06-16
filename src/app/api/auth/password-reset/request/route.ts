import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
} from "@/lib/auth/password-reset";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";

const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
});

function safeResponse(resetToken?: string) {
  const body: {
    ok: true;
    message: string;
    devResetToken?: string;
  } = {
    ok: true,
    message: "If an active account exists, password reset instructions will be sent.",
  };

  if (process.env.NODE_ENV !== "production" && resetToken) {
    body.devResetToken = resetToken;
  }

  return NextResponse.json(body);
}

export async function POST(request: Request) {
  try {
    const input = requestPasswordResetSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        companyId: true,
        company: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!user || user.status !== "active" || user.company.status !== "active") {
      return safeResponse();
    }

    const resetToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(resetToken);

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: passwordResetExpiry(),
        },
      });
    });

    await recordAuditLog({
      companyId: user.companyId,
      userId: user.id,
      action: "auth.password_reset.request",
      entityType: "user",
      entityId: user.id,
      summary: `Password reset requested for ${user.name}.`,
      metadata: {
        email: user.email,
      },
    });

    return safeResponse(resetToken);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide a valid email address.", 400));
    }

    return errorResponse(error);
  }
}
