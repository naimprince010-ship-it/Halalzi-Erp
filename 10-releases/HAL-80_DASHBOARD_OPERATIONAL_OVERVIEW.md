# HAL-80 Dashboard Operational Overview

## Goal

Improve the root dashboard so the Core ERP MVP has a practical operational overview instead of a mostly static landing dashboard.

## Files Changed

- `src/app/api/dashboard/summary/route.ts`
- `src/components/dashboard/DashboardClient.tsx`
- `src/app/globals.css`
- `scripts/production-smoke.mjs`
- `10-releases/HAL-80_DASHBOARD_OPERATIONAL_OVERVIEW.md`

## What Was Implemented

- Added `GET /api/dashboard/summary`.
- The summary route requires `dashboard.read`.
- The route derives tenant scope from the authenticated session.
- The route never reads or trusts client-supplied `companyId`.
- Dashboard summary queries are permission-aware:
  - `users.read` for user count
  - `products.read` for product/low-stock counts
  - `sales.read` for sales order counts
  - `purchases.read` for purchase order counts
  - `finance.read` for receivable/payable/account totals
- Updated root dashboard UI with an operational summary section:
  - Users
  - Active products
  - Low-stock products
  - Draft/confirmed sales
  - Draft/ordered procurement
  - Open receivables
  - Open payables
- Added responsive CSS for the new overview cards.
- Added `/api/dashboard/summary` to production smoke protected API coverage.

## Security Notes

- Authentication and RBAC are enforced server-side.
- Hidden frontend controls are not trusted.
- Response includes counts/totals only, not row-level sensitive records.
- No password/session hashes are exposed.

## Verification

- `npm run lint`: PASS
- `npm run build:ci`: PASS
- Build route output includes `ƒ /api/dashboard/summary`.

## Local Runtime Note

An isolated local server on port `3002` was used for a smoke attempt.

- `/api/dashboard/summary` unauthenticated returned `401`.
- Admin login succeeded.
- Authenticated module reads returned `500` due the existing local database/runtime issue:
  - PostgreSQL error `58P01`, missing relation storage file under local database storage.

The same local database issue affected existing module routes, so it was not specific to the new dashboard summary code. The temporary local server and log files were cleaned up.

## Production Verification Plan

After this change deploys, rerun:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="admin@halalzi.local"
$env:SMOKE_ADMIN_PASSWORD="***"
npm run smoke:prod
```

Expected: all production smoke checks pass, including `/api/dashboard/summary`.

## Blockers

- No source-code blocker.
- Local database storage issue blocks meaningful authenticated local runtime testing until the local DB is repaired or replaced.
