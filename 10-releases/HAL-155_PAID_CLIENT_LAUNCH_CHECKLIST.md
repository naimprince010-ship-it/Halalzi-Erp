# HAL-155 Paid-Client Launch Checklist

**Linear:** HAL-132  
**Date:** 2026-06-24  
**Decision:** CONDITIONAL GO for the first controlled paid pilot

## Goal

Confirm whether Halalzi ERP is ready to move from demos and internal pilots to
the first paid-client onboarding, with blockers and accepted risks made explicit.

This checklist is scoped to a controlled launch, not broad public SaaS launch.
The launch package remains limited to the first 5 pilot companies.

## Evidence Summary

| Gate | Status | Evidence |
|---|---:|---|
| Core ERP production signoff | PASS | `10-releases/HAL-129_CORE_ERP_MVP_PRODUCTION_RELEASE_SIGNOFF.md` |
| Authenticated production smoke runbook | READY | `10-releases/HAL-132_AUTHENTICATED_PRODUCTION_SMOKE.md` |
| Purchase approval workflow | PASS | `outputs/HAL-143_purchase_approval_workflow_verification.json` |
| Role templates and onboarding presets | PASS | `outputs/HAL-144_role_templates_onboarding_verification.json` |
| Performance and security review | GO | `10-releases/HAL-157_PERFORMANCE_SECURITY_REVIEW.md` |
| Pricing, support, and pilot package | GO | `10-releases/HAL-158_PRICING_SUPPORT_PILOT_PACKAGE.md` |
| Backup and restore runbook | DOCUMENTED | `BACKUP_RESTORE.md` |
| Migration baseline path | DOCUMENTED / ATTENTION | `MIGRATIONS.md`, `DEPLOYMENT.md` |
| Client operations runbook | DOCUMENTED | `OPERATIONS.md` |

## Required Before First Paid Client

Complete these immediately before onboarding the first paying client:

1. Run fresh authenticated production smoke:

   ```powershell
   $env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
   $env:SMOKE_ADMIN_EMAIL="<local only>"
   $env:SMOKE_ADMIN_PASSWORD="<local only>"
   npm run smoke:prod
   ```

2. Confirm result is `8/8 passed, 0 failed` or better with no secret output.
3. Log the result in Linear HAL-132 as pass/fail counts only.
4. Verify admin can reach dashboard, procurement, finance, sales, products, and
   user/role pages in production.
5. Confirm Resend sender domain posture for real-client email. If the final
   domain is not purchased yet, onboard only with a manually coordinated pilot
   and clearly state email limitations to the client.
6. Confirm Neon backup/restore posture:
   - PITR or restore window is active.
   - A restore branch workflow is understood.
   - No destructive SQL or reset commands are planned.
7. Keep the pilot cap at 5 companies and reject custom-code commitments.

## Blockers

No code blocker is present for a controlled paid pilot.

The launch remains conditional because a fresh authenticated production smoke and
visual dashboard walkthrough must be run right before the first paid-client
handoff. The most recent UI visibility check only confirmed the public site
returned `200 OK`; authenticated dashboard visibility was pending because smoke
credentials were not available in that shell.

## Accepted Risks

| Risk | Acceptance Reason | Follow-up |
|---|---|---|
| Some list endpoints still need pagination | Pilot tenants are expected to have small data volume | Create/execute pagination hardening issue before broad public launch |
| Rate limiting is not yet implemented | Acceptable for low-traffic controlled pilot behind Vercel baseline protection | Add API rate limiting before public marketing launch |
| Audit logging coverage is not complete everywhere | Critical RBAC assignment audit logging was improved; remaining gaps are manageable for pilot | Expand audit logging coverage for finance/vendor mutations |
| Production still has bootstrap migration posture | Existing runbook documents baseline path; do not switch deploy mode until baseline is completed | Complete production migration baseline before higher-scale rollout |
| Final sender domain may still be pending | User plans domain purchase later; pilot can proceed with clear email limitations | Verify sender domain before real self-serve onboarding |

## Paid Pilot Operating Rules

- Maximum concurrent paid pilots: 5 companies.
- Pricing: 5,000 BDT/month during pilot, month-to-month.
- No custom feature development for individual clients.
- Remote onboarding only.
- Client must provide one internal champion.
- Client is responsible for data cleanup and data entry unless a separate paid
  service is explicitly agreed later.
- Keep a unique admin per company; never share a global admin credential.
- Run smoke after every production deploy that affects auth, RBAC, finance,
  procurement, sales, inventory, or onboarding.

## NO-GO Conditions

Do not onboard a paid client if any of these are true:

- Authenticated production smoke fails.
- Admin cannot access dashboard/core modules in production.
- Production deployment is not Ready in Vercel.
- Neon database backup/restore availability cannot be confirmed.
- A client requires custom code, on-site support, or more than the pilot package
  includes.
- A client needs compliance, isolation, or uptime commitments beyond the current
  controlled-pilot posture.

## Final Decision

**CONDITIONAL GO.**

Halalzi ERP is ready to sell and onboard the first controlled paid pilot after a
fresh authenticated production smoke and dashboard visibility check pass. The
engineering foundation, role model, approval workflow, security review, support
package, and operations runbooks are sufficient for a tightly managed paid pilot.

This is not yet a broad public SaaS launch. Broader launch should wait for
pagination hardening, rate limiting, broader audit logging, production migration
baseline completion, and final sender-domain setup.
