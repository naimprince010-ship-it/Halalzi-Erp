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
1. Register the client company through the production register flow.
2. Create or confirm the first admin user.
3. Verify admin can access dashboard modules.
4. Add staff users from Users.
5. Assign least-privilege roles.
6. Add initial products, vendors, and finance accounts.
7. Run a short smoke workflow:
   - create product
   - create vendor
   - create sales order draft
   - create purchase order draft
   - verify finance pages load

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

## Database Backup Policy
Minimum MVP policy:

1. Confirm Neon point-in-time recovery or backup availability.
2. Before destructive maintenance, export database or verify a restore point.
3. Keep a monthly backup verification note.
4. Never run destructive SQL without checking `companyId` scope.

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

## Near-Term Hardening Tasks
- Add email delivery provider for password reset and email verification.
- Add role permission edit screen.
- Follow `MIGRATIONS.md` and run `npm run prisma:baseline:production -- --apply` against the production database, then replace build-time `prisma db push` with migration deploy once schema stabilizes.
- Add authenticated preview smoke tests after a safe preview database strategy exists.
- Add audit log filters/export after real client reporting needs are known.
- Upgrade basic in-memory rate limiting to durable shared rate limiting when usage grows beyond MVP demo traffic.
