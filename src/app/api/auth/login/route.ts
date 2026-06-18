import { NextResponse } from "next/server";
import {
  companySuspended,
  emailNotVerified,
  errorResponse,
  invalidCredentials,
  userDisabled,
} from "@/lib/auth/auth-errors";
import { validateLoginInput } from "@/lib/auth/auth-validation";
import { toCurrentUserPayload } from "@/lib/auth/current-user";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCompanyRoles } from "@/lib/rbac/default-roles";

const userLoginSelect = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  passwordHash: true,
  status: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  },
  userRoles: {
    select: {
      role: {
        select: {
          key: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  key: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  try {
    const input = validateLoginInput(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: userLoginSelect,
    });

    if (!user) {
      throw invalidCredentials();
    }

    const validPassword = await verifyPassword(input.password, user.passwordHash);

    if (!validPassword) {
      throw invalidCredentials();
    }

    if (user.status !== "active") {
      throw userDisabled();
    }

    if (!user.emailVerifiedAt) {
      throw emailNotVerified();
    }

    if (user.company.status !== "active") {
      throw companySuspended();
    }

    await createDefaultCompanyRoles(prisma, user.company.id);

    const refreshedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userLoginSelect,
    });

    const session = await createSession(user.id, input.rememberMe);
    await recordAuditLog({
      companyId: refreshedUser.company.id,
      userId: refreshedUser.id,
      action: "auth.login",
      entityType: "user",
      entityId: refreshedUser.id,
      summary: `${refreshedUser.name} signed in.`,
      metadata: {
        rememberMe: Boolean(input.rememberMe),
      },
    });

    const response = NextResponse.json(
      toCurrentUserPayload({
        id: refreshedUser.id,
        name: refreshedUser.name,
        email: refreshedUser.email,
        status: refreshedUser.status,
        company: refreshedUser.company,
        userRoles: refreshedUser.userRoles,
      }),
    );
    setSessionCookie(response, session.token, session.maxAge);

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
