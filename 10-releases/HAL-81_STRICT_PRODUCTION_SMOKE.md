# HAL-81 Strict Production Smoke

## Goal

Strengthen production smoke testing so the dashboard summary endpoint is validated for response shape, not only HTTP status.

## Files Changed

- `scripts/production-smoke.mjs`
- `10-releases/HAL-81_STRICT_PRODUCTION_SMOKE.md`

## What Was Implemented

- Added a dedicated smoke check for `/api/dashboard/summary`.
- The check verifies:
  - authenticated request returns `200`
  - response has a `summary` object
  - expected top-level keys exist:
    - `users`
    - `products`
    - `sales`
    - `procurement`
    - `finance`
  - module summary values are either permission-null or finite numbers
  - no unsafe `passwordHash` or `tokenHash` values appear anywhere in the response

## Verification

- `npm run lint`: PASS
- `npm run build:ci`: PASS
- `npm run smoke:prod`: PASS

Production smoke result:

```json
{
  "baseUrl": "https://halalzi-erp.vercel.app",
  "total": 7,
  "passed": 7,
  "failed": 0
}
```

## Passed Smoke Checks

1. Public pages render.
2. Protected APIs reject unauthenticated access.
3. Admin login succeeds.
4. `/api/auth/me` returns safe user context.
5. Dashboard summary has safe operational shape.
6. Admin can read core module APIs.
7. Module API responses expose no password/session hashes.

## Outcome

The production smoke gate is now stricter and covers the new dashboard operational overview with explicit shape validation.

## Blockers

None.
