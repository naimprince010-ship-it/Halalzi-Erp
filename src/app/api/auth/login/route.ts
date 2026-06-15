import { NextResponse } from "next/server";
import { companySuspended, errorResponse, invalidCredentials, userDisabled } from "@/lib/auth/auth-errors";
import { validateLoginInput } from "@/lib/auth/auth-validation";
import { toCurrentUserPayload } from "@/lib/auth/current-user";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const input = validateLoginInput(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        email: true,
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
      },
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

    if (user.company.status !== "active") {
      throw companySuspended();
    }

    const session = await createSession(user.id, input.rememberMe);
    const response = NextResponse.json(
      toCurrentUserPayload({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        company: user.company,
        userRoles: user.userRoles,
      }),
    );
    setSessionCookie(response, session.token, session.maxAge);

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
