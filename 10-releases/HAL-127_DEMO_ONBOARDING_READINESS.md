# HAL-127 Demo Data and Client Onboarding Readiness

## Goal

Provide a practical, production-safe package for:

- Demo readiness
- Fresh client onboarding readiness
- Operator checklists with clear guardrails

Scope is limited to safe operations and documented runbooks. This package does not authorize uncontrolled writes to production data.

## Current Baseline

- HAL-104 is in progress.
- Latest production deployment status: Ready.
- Latest production smoke result: 3/3 passed against https://halalzi-erp.vercel.app.
- Existing runbooks are available in `README.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `MONITORING.md`, and `BACKUP_RESTORE.md`.
- No dedicated Prisma seed implementation currently exists under `prisma/`.

## Fresh Company and Admin Onboarding Checklist

Use this sequence for each new client company.

- Confirm production sender domain readiness and email configuration before real-client onboarding.
- Register the new company from the production register flow.
- Create/confirm first company admin user.
- Verify admin email status.
- Confirm admin can login and reach dashboard modules.
- Ensure baseline master data exists:
  - at least one product category and initial products
  - at least one vendor
  - initial finance account set
- Ensure RBAC baseline is assigned (admin role plus least-privilege staff roles).
- Run production smoke checks after onboarding changes.
- Record onboarding completion, owner, and date in internal tracking.

## Role and Permission Setup Checklist

Apply least privilege by default.

- Confirm `Company Admin` role is present and mapped to required permissions.
- Create role sets for staff personas, for example:
  - Sales Staff
  - Procurement Staff
  - Finance Staff
  - CRM Staff
  - Read-only Auditor
- Validate each role by login-level verification:
  - Allowed endpoints return success.
  - Disallowed endpoints return `403`.
- Confirm cross-company access remains blocked.
- Confirm disabled users are blocked from login.
- Capture role matrix and approver for client handoff.

## Safe Demo Data Setup Guidance

### Safety Principles

- Never run bulk demo writes directly on production client data.
- Use a sandbox/demo tenant or a restored non-production branch for data rehearsal.
- Keep demo records clearly labeled (for example, `DEMO-` prefixes).
- Avoid real customer PII in demo datasets.
- Keep demo credentials separate from client credentials.

### Environment Guidance

- Preferred: non-production environment mirroring production behavior.
- If production demonstration is unavoidable, use a dedicated demo company with explicit approval and no client-owned records.
- After demo sessions, review audit logs and disable temporary demo users.

## Demo Data Coverage Checklist

Prepare realistic, internally consistent data across modules.

- Products:
  - 15-30 active products
  - mixed categories, SKU patterns, stock levels
  - some low-stock examples
- Vendors:
  - 5-10 vendors
  - contact basics and status mix
- Purchase Orders:
  - draft and ordered states
  - at least one partially received scenario
- Sales Orders:
  - draft and confirmed states
  - item-level totals aligned with products
- Finance Accounts:
  - core chart accounts (cash, receivable, payable, revenue, expense)
  - active account statuses
- Receivables/Payables:
  - open and settled examples
  - due-date spread for aging demonstrations
- CRM Leads/Deals/Tasks:
  - leads in multiple stages
  - deals/pipeline examples where available
  - follow-up tasks with varied due dates and assignees

## Production Smoke Checklist

Run after onboarding changes, role changes, or credential rotations.

1. Deployment check:
   - Vercel latest deployment is `Ready`.
2. Unauthenticated smoke:
   - set `SMOKE_BASE_URL`
   - run `npm run smoke:prod`
   - confirm zero failures
3. Authenticated smoke:
   - set `SMOKE_ADMIN_EMAIL`
   - set `SMOKE_ADMIN_PASSWORD` (typed directly, never shared)
   - run `npm run smoke:prod`
   - confirm zero failures and no sensitive-field leakage
4. Runtime log review:
   - inspect Vercel runtime Error logs for recent regressions

## Security and No-Secrets Checklist

- Do not print or commit secrets (`DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, admin passwords).
- Keep secrets only in approved environment variable stores.
- Never post credentials in tickets, comments, or chat logs.
- Type sensitive values directly in terminal when required.
- Use read-only verification scripts whenever possible.
- Do not run destructive database commands on production.
- Enforce tenant isolation on all API and data paths.

## Client Handoff Checklist

- Confirm onboarding checklist completed and signed.
- Confirm role/permission matrix approved by client owner.
- Confirm smoke checks passed and date recorded.
- Provide client-facing admin runbook summary:
  - login and password reset flow
  - user/role management basics
  - product/vendor/order data maintenance basics
- Confirm support/escalation contact path.
- Confirm known limits and roadmap items were communicated.
- Confirm any demo-only users are removed or disabled.

## Known Limits and Out-of-Scope

- No automatic production demo-data seeding is provided.
- No script in this package is allowed to delete or overwrite client production data.
- Prisma seed entrypoint is not currently implemented in `prisma/` for this app.
- Advanced CRM forecasting/automation remains out of current MVP scope.
- Enterprise tenancy isolation by dedicated database remains a separate contractual/compliance decision.

## Optional HAL-127 Helper (Non-Destructive)

An opt-in helper is provided:

- Command: `npm run demo:hal127:helper -- --apply`
- Required environment:
  - `DEMO_HELPER_ENABLED=true`
  - `DEMO_TARGET=<non-production target name>`
- Hard block:
  - helper exits if `DEMO_TARGET` implies production (`prod` or `production`)
- Behavior:
  - prints a safe onboarding/demo plan and checklist
  - optional local plan artifact generation only (`--write-plan`)
  - never writes database data
  - never reads or prints secrets

## Verification for HAL-127 Package

Run locally from `app/`:

```powershell
npm run lint
npm run build:ci
```

Optional readiness helper run (non-destructive):

```powershell
$env:DEMO_HELPER_ENABLED="true"
$env:DEMO_TARGET="staging"
npm run demo:hal127:helper -- --apply --write-plan
```

## Evidence Template for HAL-104 Linear Comment

Use this template when posting completion evidence:

- Files changed:
  - `10-releases/HAL-127_DEMO_ONBOARDING_READINESS.md`
  - `scripts/hal127-demo-helper.mjs` (optional helper)
  - `package.json` (script wiring)
- Verification:
  - `npm run lint`: PASS/FAIL
  - `npm run build:ci`: PASS/FAIL
- Safety confirmation:
  - no secrets printed
  - no production client data modified
- Acceptance result:
  - HAL-104 ready for Done if all checks pass