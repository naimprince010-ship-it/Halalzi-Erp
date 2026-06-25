# HAL-142 Development Regression Hardening

**Date:** 2026-06-25  
**Status:** Implemented  
**Parent roadmap:** HAL-139 Product development phase roadmap

## Goal

Make development safer before the next product-depth work by consolidating the
core regression checks into a repeatable, non-destructive command.

The existing project already has several runtime verification scripts, but they
are spread across individual HAL issues and many of them create temporary data.
HAL-142 adds a static development gate that can run quickly without touching the
database or requiring credentials.

## New Command

```powershell
npm run regression:dev
```

This command runs:

```powershell
node scripts/hal142-development-regression-hardening.mjs
```

It writes:

```text
outputs/HAL-142_development_regression_hardening.json
```

## What The Gate Checks

- Required package verification scripts exist.
- Core module API routes exist.
- Core dashboard pages exist.
- Major module API routes keep authentication and company-scope guard patterns.
- Print routes exist for:
  - sales orders
  - purchase orders
  - sales quotations
  - sales invoices
- Print routes use RBAC, company scope, shared HTML renderer, and `no-store`.
- Finance reports use explicit supported endpoints:
  - `/api/finance/reports/trial-balance`
  - `/api/finance/reports/ar-aging`
  - `/api/finance/reports/ap-aging`
  - `/api/finance/reports/cash-bank-summary`
  - `/api/finance/reports/expense-summary`
- Verification scripts do not target nonexistent `/api/finance/reports`.
- Runtime regression scripts remain available.
- API routes do not select sensitive hash/session fields outside the auth login
  allowlist.

## Runtime Regression Inventory

The static gate also documents the deeper runtime commands that remain available
when a local app/database is running:

```powershell
npm run regression:hal99
npm run verify:hal137
npm run verify:hal141
npm run verify:hal143
npm run smoke:prod
```

Those scripts are useful for deeper end-to-end checks. They are intentionally
not bundled into `regression:dev` because they can require a running app,
credentials, or generated fixture data.

## Result

`npm run regression:dev` passed with 21/21 checks.

This gives the project a quick, repeatable development safety gate before
future modules such as UX polish, warehouse, POS, or BI work.

## Verification

- `npm run regression:dev`
- `npm run lint`
- `npm run build:ci`
