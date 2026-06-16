import { NextResponse } from "next/server";

import {
  createEmailVerificationToken,
  emailVerificationExpiry,
  hashEmailVerificationToken,
} from "@/lib/auth/email-verification";
import { errorResponse } from "@/lib/auth/auth-errors";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { buildEmailVerificationUrl, sendEmailVerificationEmail } from "@/lib/email/resend";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  try {
    const currentUser = await getCurrentUser();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: currentUser.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        companyId: true,
        emailVerifiedAt: true,
      },
    });

    if (user.emailVerifiedAt) {
      return NextResponse.json({
        ok: true,
        message: "Email address is already verified.",
      });
    }

    const verificationToken = createEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(verificationToken);
    let emailDelivered = false;

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: emailVerificationExpiry(),
        },
      });
    });

    try {
      await sendEmailVerificationEmail({
        to: user.email,
        name: user.name,
        verificationUrl: buildEmailVerificationUrl(verificationToken),
      });
      emailDelivered = true;
    } catch (emailError) {
      console.error("Email verification delivery failed", emailError);
    }

    await recordAuditLog({
      companyId: user.companyId,
      userId: user.id,
      action: "auth.email_verification.request",
      entityType: "user",
      entityId: user.id,
      summary: `Email verification requested for ${user.name}.`,
      metadata: {
        email: user.email,
        emailDelivered,
      },
    });

    const body: {
      ok: true;
      message: string;
      devVerificationToken?: string;
    } = {
      ok: true,
      message: "Verification instructions have been sent if email delivery is configured.",
    };

    if (process.env.NODE_ENV !== "production") {
      body.devVerificationToken = verificationToken;
    }

    return NextResponse.json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
