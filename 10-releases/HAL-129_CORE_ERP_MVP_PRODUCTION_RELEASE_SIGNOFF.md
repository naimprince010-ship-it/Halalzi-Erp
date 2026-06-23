# HAL-129 Core ERP MVP Production Release Signoff

## Goal

Provide final production release signoff for the Core ERP MVP after release
candidate QA passed.

## Release Target

- App: `https://halalzi-erp.vercel.app`
- Branch: `master`
- Latest local release-candidate commit reviewed: `3ea4624`
- Signoff date: 2026-06-23

## Prerequisite Evidence

| Prerequisite | Result | Evidence |
|---|---:|---|
| HAL-119 finance dashboard signoff | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-119_finance_dashboard_signoff.json` |
| HAL-121 core ERP cross-module regression | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-121_core_erp_cross_module_regression.json` |
| HAL-123 sales-to-finance linkage | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-123_sales_finance_linkage_verification.json` |
| HAL-124 procurement-to-finance linkage | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-124_procurement_finance_linkage_verification.json` |
| HAL-126 inventory stock ledger | PASS | `E:\ERP_AI_Project_NEW\outputs\HAL-126_stock_ledger_verification.json` |
| HAL-127 onboarding readiness | PASS | `10-releases/HAL-127_DEMO_ONBOARDING_READINESS.md` |
| HAL-128 release candidate QA | PASS with security follow-up | `E:\ERP_AI_Project_NEW\outputs\HAL-128_core_erp_mvp_release_candidate_qa.json` |

## Production Smoke

Fresh production smoke was run against `https://halalzi-erp.vercel.app`.

| Check | Result |
|---|---:|
| Public pages render | PASS |
| Protected APIs reject unauthenticated access | PASS |
| Admin credential checks | SKIPPED |

Admin credential checks were skipped because admin smoke credentials were not
provided in this session. This is accepted for this signoff because HAL-128 and
prior runtime artifacts cover authenticated local/stable-database module flows.
Run authenticated production smoke before an external paid-client handoff.

## Production Readiness Checklist

| Gate | Result | Notes |
|---|---:|---|
| Latest code pushed to GitHub | PASS | `master` is pushed through HAL-128 |
| Production app reachable | PASS | Fresh smoke reached public pages |
| Protected API unauthenticated behavior | PASS | Fresh smoke returned `401` |
| Release-candidate QA | PASS | HAL-128 decision: `PASSED_WITH_SECURITY_FOLLOW_UP` |
| Core module regression evidence | PASS | HAL-121/HAL-123/HAL-124/HAL-126 artifacts |
| Monitoring/runbook docs available | PASS | `MONITORING.md`, `OPERATIONS.md`, `DEPLOYMENT.md` |
| Rollback path documented | PASS | Vercel previous deployment rollback plus repo revert path |
| Migration/deploy procedure documented | ATTENTION | Production still uses bootstrap `prisma db push --accept-data-loss` |
| Secret exposure follow-up | ATTENTION | Exposed editor/provider key must be revoked/regenerated provider-side |

## Accepted Limitations

- Authenticated production smoke was not run in this session because admin smoke
  credentials were not available through a secure channel.
- Production migration baseline is not yet applied. Keep the current bootstrap
  build workflow until the baseline is safely applied with trusted production
  database access.
- The provider-side API key exposed in a screenshot must still be rotated from
  the provider dashboard. Local Continue config/backups were sanitized, but
  provider revocation is outside repo automation.
- Email sender domain hardening and verified-email enforcement remain rollout
  items before broader real-client onboarding.

## Rollback Note

If production breaks after this signoff:

1. Use Vercel to roll back to the last known Ready deployment.
2. Reproduce locally with `npm run build:ci` and targeted smoke/regression.
3. Fix forward on `master` with a small scoped commit.
4. Re-run production smoke after deployment.

## GO / NO-GO Decision

GO for Core ERP MVP demo/controlled onboarding.

The Core ERP MVP has passed current release-candidate QA and production smoke
gates. The release is acceptable for controlled demos and internal/client
readiness conversations with the accepted limitations above. Before paid-client
production onboarding, complete provider-side key rotation and rerun
authenticated production smoke through a secure credential channel.
