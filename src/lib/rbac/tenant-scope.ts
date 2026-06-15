import { forbidden } from "@/lib/auth/auth-errors";
import type { CurrentUser } from "@/lib/auth/current-user";

export function companyScope(currentUser: CurrentUser) {
  return { companyId: currentUser.company.id };
}

export function assertSameCompany(currentUser: CurrentUser, companyId: string) {
  if (currentUser.company.id !== companyId) {
    throw forbidden();
  }
}
