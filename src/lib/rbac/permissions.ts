import type { PermissionKey } from "./default-permissions";
import type { CurrentUser } from "@/lib/auth/current-user";

export function getPermissionKeys(currentUser: CurrentUser) {
  return [...new Set(currentUser.permissions)];
}

export function hasPermission(currentUser: CurrentUser, permission: PermissionKey) {
  return getPermissionKeys(currentUser).includes(permission);
}

export function hasAllPermissions(currentUser: CurrentUser, permissions: PermissionKey[]) {
  const keys = new Set(getPermissionKeys(currentUser));
  return permissions.every((permission) => keys.has(permission));
}

export function hasAnyPermission(currentUser: CurrentUser, permissions: PermissionKey[]) {
  const keys = new Set(getPermissionKeys(currentUser));
  return permissions.some((permission) => keys.has(permission));
}
