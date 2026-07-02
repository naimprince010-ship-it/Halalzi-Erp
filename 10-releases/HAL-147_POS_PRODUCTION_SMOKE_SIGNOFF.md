# HAL-147 POS Production Smoke and Release Signoff

## Goal

Verify the POS MVP in production after the POS schema/API, dashboard, receipt, session, and high-volume search hardening work.

## Production Target

Default target:

```text
https://halalzi-erp.vercel.app
```

## Smoke Command

Unauthenticated readiness:

```powershell
npm run smoke:pos:prod
```

Authenticated production smoke:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="<type locally only>"
$env:SMOKE_ADMIN_PASSWORD="<type locally only>"
npm run smoke:pos:prod
```

Optional mutating session smoke for a safe production test tenant only:

```powershell
$env:POS_SMOKE_MUTATE="true"
npm run smoke:pos:prod
```

## Safety Rules

- Do not print secrets.
- Do not include credentials in terminal output, commits, Linear comments, or screenshots.
- Mutating smoke only opens and closes a POS session. It does not create a POS sale.
- Run `POS_SMOKE_MUTATE=true` only against a safe test tenant.

## Evidence Artifact

The smoke writes:

- `outputs/HAL-147_pos_production_smoke_signoff.json`
- `../outputs/HAL-147_pos_production_smoke_signoff.json`

## Required Pass Criteria

- Production alias responds.
- POS dashboard route responds.
- POS APIs reject unauthenticated access.
- Authenticated admin/cashier can load:
  - `/api/auth/me`
  - `/api/pos/summary`
  - `/api/pos/products?limit=5`
  - `/api/pos/sales?take=5`
  - `/api/pos/sessions`
- Missing/foreign receipt access returns forbidden.
- If safe mutating smoke is enabled, session open/close succeeds.

## Current Notes

The first production deployment for `fe3c927` failed with Prisma `P1017` during Vercel build-time `prisma db push`. A redeploy retry succeeded and aliased production back to `https://halalzi-erp.vercel.app`.
