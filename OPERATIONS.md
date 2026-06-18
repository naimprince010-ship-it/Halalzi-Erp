# Halalzi ERP Operations Runbook

## Production
- App: `https://halalzi-erp.vercel.app`
- Hosting: Vercel
- Database: Neon PostgreSQL through Vercel Marketplace
- Source: `https://github.com/naimprince010-ship-it/Halalzi-Erp`
- Production branch: `master`

## Tenant Model
Halalzi ERP is a multi-tenant SaaS app.

- One production database can serve many client companies.
- Every client is represented by a `Company`.
- All operational data is scoped by `companyId`.
- API routes must derive company scope from the authenticated session.
- Never trust `companyId` from request body, query string, or hidden frontend fields.

Use a dedicated database only when a client requires separate infrastructure for compliance, contract, performance, or enterprise isolation.

## Client Onboarding
1. Confirm the production sender domain is verified in Resend before onboarding real clients.
2. Register the client company through the production register flow.
3. Create or confirm the first admin user.
4. Verify the first admin email address.
5. Verify admin can access dashboard modules.
6. Add staff users from Users.
7. Assign least-privilege roles.
8. Add initial products, vendors, and finance accounts.
9. Run a short smoke workflow:
   - create product
   - create vendor
   - create sales order draft
   - create purchase order draft
   - verify finance pages load

## Email Verification Rollout

Email verification is enforced at login. Publicly registered users must verify
their email address before they can sign in. Admin-created staff users are
treated as verified during the MVP create-user flow until a full invite-email
workflow is added.

Before onboarding real clients:

1. Verify the Resend sender domain.
2. Confirm `EMAIL_FROM` uses the verified sender.
3. Confirm the production admin account email is verified.
4. Send verification emails to any existing unverified admin users.
5. Keep an emergency admin account available.
6. Run production smoke immediately after credential or email changes.

Rollback rule:

- If legitimate users are blocked unexpectedly, disable the enforcement change first.
- Do not delete verification tokens or user records during rollback.

## Client Offboarding
1. Disable all client users.
2. Export required operational data before contract end.
3. Keep database records unless a written deletion request exists.
4. If deletion is required, perform scoped deletion by `companyId` only after a backup.
5. Record the offboarding decision in an internal issue/document.

## Admin Credential Policy
- Do not share demo admin credentials with clients.
- Rotate the production admin password before demos.
- Disable old demo users after client onboarding.
- Use a unique admin per company.

For the safe rotation workflow (reset-flow or operator-gated direct update,
verification, and what never to commit), see `CREDENTIAL_ROTATION.md` and the
helper `npm run rotate:admin`.

## Database Backup Policy
Minimum MVP policy:

1. Confirm Neon point-in-time recovery or backup availability.
2. Before destructive maintenance, export database or verify a restore point.
3. Keep a monthly backup verification note.
4. Never run destructive SQL without checking `companyId` scope.

For the full backup and restore verification workflow, the read-only restore
verification helper (`npm run verify:restore`), and the production incident
checklist, see `BACKUP_RESTORE.md`.

## Release Process
Use `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md` as the Core ERP MVP release gate.

1. Make changes locally.
2. Run:

```powershell
npm run lint
npm run build
```

3. Commit and push to `master`.
4. Confirm the GitHub CI workflow passes.
5. Wait for Vercel production deployment.
6. Run production smoke test:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="<admin email>"
$env:SMOKE_ADMIN_PASSWORD="<admin password>"
npm run smoke:prod
```

7. Check Vercel runtime logs for errors.

## Incident Response
For login/API/database errors:

1. Check Vercel deployment status.
2. Check Vercel runtime logs.
3. Confirm `DATABASE_URL` exists in project environment variables.
4. Confirm Neon resource status is available.
5. Run unauthenticated smoke checks.
6. If data risk exists, pause client onboarding until root cause is known.

For the full log-review workflow, error signatures, weekly checklist, and
escalation path, see `MONITORING.md` (or run `npm run monitor:checklist`).

## Near-Term Hardening Tasks
- Verify custom email sender domain in Resend.
- Follow `MIGRATIONS.md` and run `npm run prisma:baseline:production -- --apply` against the production database, then replace build-time `prisma db push` with migration deploy once schema stabilizes.
- Add authenticated preview smoke tests after a safe preview database strategy exists.
- Add audit log filters/export after real client reporting needs are known.
