# HAL-82 Audit Log Foundation

## Goal

Add a basic company-scoped audit/activity log foundation for Core ERP traceability before real client onboarding.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260615164500_add_audit_log/migration.sql`
- `src/lib/rbac/default-permissions.ts`
- `src/lib/rbac/default-roles.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/audit-logs/route.ts`
- `src/app/dashboard/audit/page.tsx`
- dashboard nav arrays across existing dashboard pages
- `src/app/globals.css`
- `scripts/production-smoke.mjs`
- `10-releases/HAL-82_AUDIT_LOG_FOUNDATION.md`

## What Was Implemented

- Added `AuditLog` Prisma model.
- Added PostgreSQL migration SQL for `AuditLog`.
- Added `audit.read` permission.
- Added `audit.read` to Company Admin default role.
- Added login-time default role/permission sync so existing companies can pick up newly added default permissions.
- Added secure `GET /api/audit-logs`.
- Added `/dashboard/audit` read-only page.
- Added Audit navigation entry for users with `audit.read`.
- Added `/api/audit-logs` to production smoke protected API coverage.

## Security Behavior

- Audit API requires authenticated session.
- Audit API requires `audit.read`.
- Tenant scope is derived from the current session company.
- Client-supplied `companyId` is not accepted.
- Response returns safe audit fields and safe user identity fields only.

## Verification

- `npx prisma validate`: PASS
- `npx prisma generate`: PASS
- `npm run lint`: PASS
- `npm run build:ci`: PASS

Build output includes:

- `ƒ /api/audit-logs`
- `○ /dashboard/audit`

## Production Note

The production build still uses `prisma db push`, so deployment should add the `AuditLog` table to the current Neon schema. The migration SQL is also present for the future migrate-deploy workflow.

## Next Step

After deployment, run production smoke. Expected result should include `/api/audit-logs=401` for unauthenticated access and `200` for authenticated admin module reads after login-time permission sync.

## Blockers

None in source code.
