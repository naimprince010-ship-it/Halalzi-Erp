import { companySuspended, unauthenticated, userDisabled } from "./auth-errors";
import { getSessionTokenFromRequest, hashSessionToken } from "./session";
import { prisma } from "@/lib/db/prisma";

export type CurrentUser = {
  user: {
    id: string;
    name: string;
    email: string;
    status: "active" | "invited" | "disabled";
  };
  company: {
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended";
  };
  roles: string[];
  permissions: string[];
};

export function toCurrentUserPayload(user: {
  id: string;
  name: string;
  email: string;
  status: "active" | "invited" | "disabled";
  company: {
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended";
  };
  userRoles: {
    role: {
      key: string;
      rolePermissions: {
        permission: {
          key: string;
        };
      }[];
    };
  }[];
}): CurrentUser {
  const roles = user.userRoles.map((userRole) => userRole.role.key);
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((userRole) =>
        userRole.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
      ),
    ),
  ];

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
    },
    company: {
      id: user.company.id,
      name: user.company.name,
      slug: user.company.slug,
      status: user.company.status,
    },
    roles,
    permissions,
  };
}

export async function getUserContextById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
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
    throw unauthenticated();
  }

  if (user.status !== "active") {
    throw userDisabled();
  }

  if (user.company.status !== "active") {
    throw companySuspended();
  }

  return toCurrentUserPayload(user);
}

export async function getCurrentUser() {
  const token = await getSessionTokenFromRequest();

  if (!token) {
    throw unauthenticated();
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      userId: true,
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw unauthenticated();
  }

  return getUserContextById(session.userId);
}
