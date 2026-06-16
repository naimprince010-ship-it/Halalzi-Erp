import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { validateRegisterInput } from "@/lib/auth/auth-validation";
import { getUserContextById } from "@/lib/auth/current-user";
import {
  createEmailVerificationToken,
  emailVerificationExpiry,
  hashEmailVerificationToken,
} from "@/lib/auth/email-verification";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { buildEmailVerificationUrl, sendEmailVerificationEmail } from "@/lib/email/resend";
import { createDefaultCompanyRoles, assignAdminRole } from "@/lib/rbac/default-roles";
import { generateUniqueCompanySlug } from "@/lib/tenant/slug";

export async function POST(request: Request) {
  try {
    const input = validateRegisterInput(await request.json());

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppError("EMAIL_ALREADY_EXISTS", "An account with this email already exists.", 409);
    }

    const passwordHash = await hashPassword(input.password);

    const userId = await prisma.$transaction(
      async (tx) => {
        const slug = await generateUniqueCompanySlug(tx, input.companyName);

        const company = await tx.company.create({
          data: {
            name: input.companyName,
            slug,
          },
        });

        const user = await tx.user.create({
          data: {
            companyId: company.id,
            name: input.name,
            email: input.email,
            passwordHash,
          },
        });

        await tx.company.update({
          where: { id: company.id },
          data: { createdByUserId: user.id },
        });

        await createDefaultCompanyRoles(tx, company.id);
        await assignAdminRole(tx, user.id, company.id);

        return user.id;
      },
      { timeout: 20_000 },
    );

    const session = await createSession(userId);
    const currentUser = await getUserContextById(userId);
    const verificationToken = createEmailVerificationToken();
    let emailDelivered = false;

    await prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt: emailVerificationExpiry(),
      },
    });

    try {
      await sendEmailVerificationEmail({
        to: currentUser.user.email,
        name: currentUser.user.name,
        verificationUrl: buildEmailVerificationUrl(verificationToken),
      });
      emailDelivered = true;
    } catch (emailError) {
      console.error("Registration email verification delivery failed", emailError);
    }

    await recordAuditLog({
      companyId: currentUser.company.id,
      userId,
      action: "auth.email_verification.request",
      entityType: "user",
      entityId: userId,
      summary: `Email verification requested for ${currentUser.user.name}.`,
      metadata: {
        email: currentUser.user.email,
        emailDelivered,
        source: "register",
      },
    });

    const response = NextResponse.json(currentUser);
    setSessionCookie(response, session.token, session.maxAge);

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
