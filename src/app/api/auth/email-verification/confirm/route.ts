import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { hashEmailVerificationToken } from "@/lib/auth/email-verification";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";

const confirmEmailVerificationSchema = z.object({
  token: z.string().trim().min(32).max(256),
});

export async function POST(request: Request) {
  try {
    const input = confirmEmailVerificationSchema.parse(await request.json());
    const tokenHash = hashEmailVerificationToken(input.token);

    const verificationToken = await prisma.emailVerificationToken.findFirst({
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
            email: true,
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

    if (!verificationToken || verificationToken.user.status !== "active" || verificationToken.user.company.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "This email verification link is invalid or expired.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: {
          emailVerifiedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: {
          usedAt: new Date(),
        },
      });
    });

    await recordAuditLog({
      companyId: verificationToken.user.companyId,
      userId: verificationToken.user.id,
      action: "auth.email_verification.confirm",
      entityType: "user",
      entityId: verificationToken.user.id,
      summary: `Email verified for ${verificationToken.user.name}.`,
      metadata: {
        email: verificationToken.user.email,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Email address verified.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide a valid email verification request.", 400));
    }

    return errorResponse(error);
  }
}
