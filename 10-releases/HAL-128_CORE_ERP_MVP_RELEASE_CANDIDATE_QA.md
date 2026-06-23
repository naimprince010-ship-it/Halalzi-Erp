# HAL-128 Core ERP MVP Release Candidate QA

## Goal

Run the final release-candidate QA pass across the Core ERP MVP before the
production signoff issue.

## Current Release Candidate

- Branch: `master`
- Production URL: `https://halalzi-erp.vercel.app`
- Release-candidate scope includes auth, tenant/RBAC, products/inventory,
  stock ledger, sales, procurement, finance, CRM, audit/export, and production
  smoke coverage.

## Fresh Gates Run

| Gate | Result | Evidence |
|---|---:|---|
| `npm run lint` | PASS | Local run on 2026-06-23 |
| `npm run build:ci` | PASS | Local Next production build on 2026-06-23 |
| Production smoke | PASS | `SMOKE_BASE_URL=https://halalzi-erp.vercel.app npm run smoke:prod` |

## Production Smoke Summary

Fresh production smoke passed 3/3 checks:

- Public pages render: `/`, `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/verify-email`.
- Protected APIs reject unauthenticated access with `401`.
- Authenticated admin checks were skipped because admin smoke credentials were
  not provided in this session.

## Regression Evidence Matrix

| Area | Result | Evidence Artifact |
|---|---:|---|
| Core ERP cross-module regression | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-121_core_erp_cross_module_regression.json` |
| Finance dashboard signoff | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-119_finance_dashboard_signoff.json` |
| Sales to finance linkage | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-123_sales_finance_linkage_verification.json` |
| Procurement to finance linkage | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-124_procurement_finance_linkage_verification.json` |
| Inventory stock ledger | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-126_stock_ledger_verification.json` |
| CRM Phase 2 runtime/security | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-112_runtime_verification.json` |
| CRM Phase 2 browser UI | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-112_browser_ui_verification.json` |
| CRM Phase 2 post-release smoke | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-113_post_release_smoke.json` |

## Security Checks

| Check | Result | Notes |
|---|---:|---|
| Unauthenticated protected APIs reject access | PASS | Fresh production smoke returned `401` for protected APIs |
| Sensitive response fields | PASS | Covered by prior runtime artifacts and production smoke script |
| Tenant isolation | PASS | Covered by HAL-121, HAL-123, HAL-124, and HAL-126 runtime checks |
| Staff/RBAC boundaries | PASS | Covered by HAL-121, HAL-123, HAL-124, and HAL-126 runtime checks |
| Secret handling | ATTENTION | A local editor API key was exposed in a screenshot; local config/backups were sanitized, but the provider-side key must still be revoked/regenerated |

## Known Non-Blocking Follow-Ups

- Production migration baseline still needs trusted production `DATABASE_URL`
  handling before switching from `prisma db push` to `prisma migrate deploy`.
- Authenticated production smoke should be rerun when admin smoke credentials are
  available through a secure operator channel.
- The exposed editor/provider API key must be rotated in the provider dashboard.
- External demos should use the HAL-127 onboarding/demo checklist and avoid real
  client data in demo records.

## Decision

PASS with security follow-up.

The Core ERP MVP release candidate passes current static, build, production
smoke, and regression evidence gates. It is ready to proceed to HAL-129
production release signoff after the provider-side exposed API key is rotated
and the open follow-ups are accepted.
