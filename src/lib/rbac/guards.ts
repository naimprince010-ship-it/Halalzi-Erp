import type { PermissionKey } from "./default-permissions";
import { hasAllPermissions, hasAnyPermission, hasPermission } from "./permissions";
import { forbidden } from "@/lib/auth/auth-errors";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function requireAuth() {
  return getCurrentUser();
}

export async function requirePermission(permission: PermissionKey) {
  const currentUser = await getCurrentUser();

  if (!hasPermission(currentUser, permission)) {
    throw forbidden();
  }

  return currentUser;
}

export async function requireAnyPermission(permissions: PermissionKey[]) {
  const currentUser = await getCurrentUser();

  if (!hasAnyPermission(currentUser, permissions)) {
    throw forbidden();
  }

  return currentUser;
}

export async function requireAllPermissions(permissions: PermissionKey[]) {
  const currentUser = await getCurrentUser();

  if (!hasAllPermissions(currentUser, permissions)) {
    throw forbidden();
  }

  return currentUser;
}
