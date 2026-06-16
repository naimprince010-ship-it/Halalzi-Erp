# HAL-83 Audit Event Writes

## Goal

Start writing real audit events into the audit log foundation added in HAL-82.

## Files Changed

- `src/lib/audit/audit-log.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/route.ts`
- `scripts/production-smoke.mjs`
- `10-releases/HAL-83_AUDIT_EVENT_WRITES.md`

## What Was Implemented

- Added `recordAuditLog` helper.
- Added best-effort audit write behavior so audit write failures do not break core user/product/login workflows.
- Added audit events for:
  - `auth.login`
  - `user.create`
  - `user.update`
  - `user.status.update`
  - `product.create`
  - `product.update`
  - `product.archive`
- Updated production smoke to verify:
  - `/api/audit-logs` returns safe shape
  - audit logs contain at least one `auth.login` event after smoke login
  - audit responses expose no password/session hashes

## Security Behavior

- Audit writes use server-derived company/user context.
- Audit metadata avoids secrets and password data.
- Audit read API remains protected by `audit.read`.
- Audit write helper logs failures server-side but does not expose internal errors to users.

## Verification

- `npx prisma validate`: PASS
- `npx prisma generate`: PASS
- `npm run lint`: PASS
- `npm run build:ci`: PASS

Note: An initial parallel verification run had a Prisma generated-folder conflict because `prisma generate` and `build:ci` both touched generated files at the same time. Sequential rerun passed cleanly.

## Production Verification Plan

After deployment:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="admin@halalzi.local"
$env:SMOKE_ADMIN_PASSWORD="***"
npm run smoke:prod
```

Expected result: 8 smoke checks pass, including audit log shape and login activity.

## Blockers

None in source code.
