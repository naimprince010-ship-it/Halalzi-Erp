# Halalzi ERP Deployment Guide

## Recommended Target
Use:
- Vercel for the Next.js app
- Managed PostgreSQL for the database
- GitHub as source control

## Current Production Deployment
- App URL: `https://halalzi-erp.vercel.app`
- Vercel project: `halalzi-erp`
- GitHub repo: `https://github.com/naimprince010-ship-it/Halalzi-Erp`
- Production branch: `master`
- Database provider: Neon via Vercel Marketplace
- Database resource: `neon-byzantine-ribbon`

## Required Environment Variables
Set these in Vercel:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
SESSION_SECRET="a-long-random-secret-at-least-32-characters"
NODE_ENV="production"
APP_BASE_URL="https://halalzi-erp.vercel.app"
EMAIL_FROM="Halalzi ERP <onboarding@resend.dev>"
RESEND_API_KEY="your-resend-api-key"
```

Do not use local PGlite or local `.env` values in production.
Do not commit real email API keys to Git. Store `RESEND_API_KEY` in Vercel environment variables.

## Email Sender Domain Setup

Current MVP email delivery can use Resend's sandbox sender for internal testing, but real client onboarding should use a verified sender domain.

Recommended production setup:

- App domain: `halalzi.com` or the final client-facing domain.
- Email subdomain: `mail.halalzi.com`.
- Sender: `Halalzi ERP <no-reply@mail.halalzi.com>`.
- Reply-to mailbox, if needed later: `support@halalzi.com`.

Resend setup steps:

1. Open Resend Domains.
2. Add `mail.halalzi.com` as the sending domain.
3. Copy DNS records from Resend.
4. Add DNS records at the domain provider:
   - SPF/TXT
   - DKIM/CNAME records
   - DMARC/TXT if Resend recommends one
5. Wait until Resend shows the domain as verified.
6. Update Vercel `EMAIL_FROM` to:

```env
EMAIL_FROM="Halalzi ERP <no-reply@mail.halalzi.com>"
```

7. Redeploy production.
8. Send a password reset test email and an email verification test email.

## Pre-Deploy Local Checks
Run:

```powershell
cd E:\ERP_AI_Project_NEW\app
npm run check:env
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

For CI without production database writes, use:

```powershell
npm run build:ci
```

For local env checking, `npm run check:env` may warn about localhost. That is expected locally. For production env values it should pass without placeholder errors.

## Production Database Setup
1. Create a managed PostgreSQL database.
2. Copy its connection string.
3. Add the string as `DATABASE_URL` in Vercel.
4. Add `SESSION_SECRET` in Vercel.
5. Apply the Prisma schema.

The current Neon production database was first created with `prisma db push`,
and the default `build` script still uses `prisma db push`. This is a bootstrap
convenience only.

### Migration deploy is the production target
`prisma db push` must not remain the long-term production workflow: it keeps no
migration history or review trail and can drop columns/data on diverging
schemas. Move production to `prisma migrate deploy` in this order:

1. Baseline the existing production database (HAL-93) from a trusted shell with
   the production `DATABASE_URL`:

```powershell
npm run prisma:baseline:production -- --apply
```

2. Confirm every migration is applied with no failures:

```powershell
npx prisma migrate status
```

3. Only then switch the Vercel Build command to `npm run build:migrate` (see
   `MIGRATIONS.md`). `build:migrate` runs a guarded `prisma migrate deploy` that
   fails fast with clear guidance if the database has not been baselined.

See `MIGRATIONS.md` for the full runbook.

## Vercel Setup
If this `app` folder is pushed as the GitHub repo root:
- Root directory: default
- Install command: `npm install`
- Build command: `npm run build` (current, db push bootstrap) — switch to
  `npm run build:migrate` only after the HAL-93 baseline is applied and verified.

If `E:\ERP_AI_Project_NEW` is pushed as the GitHub repo root:
- Root directory: `app`
- Install command: `npm install`
- Build command: `npm run build` (current, db push bootstrap) — switch to
  `npm run build:migrate` only after the HAL-93 baseline is applied and verified.

## Post-Deploy Smoke Test
After deploy and after creating a production admin user:

```powershell
cd E:\ERP_AI_Project_NEW\app
$env:SMOKE_BASE_URL="https://YOUR_DEPLOYED_APP_URL"
$env:SMOKE_ADMIN_EMAIL="YOUR_ADMIN_EMAIL"
$env:SMOKE_ADMIN_PASSWORD="YOUR_ADMIN_PASSWORD"
npm run smoke:prod
```

Expected:

```text
"failed": 0
```

## Production Blockers Still Open
- No custom verified sender domain yet
- No automated backup policy yet
- No monitoring/alerting yet

## Production Hardening Checklist
Before sharing the app with real clients:

1. Rotate demo/admin credentials. See `CREDENTIAL_ROTATION.md` (use `npm run rotate:admin` to prepare a new password; never commit it).
2. Add a custom domain and verify HTTPS.
3. Confirm Neon backup/restore settings and export process. Verify restores are recoverable using `BACKUP_RESTORE.md` and `npm run verify:restore` (read-only, runs against a restore branch only).
4. Enable Vercel runtime monitoring and review error logs weekly.
5. Verify a custom sender domain in Resend before real client onboarding.
6. Follow `MIGRATIONS.md` to baseline production with `npm run prisma:baseline:production -- --apply`, then replace `prisma db push` with `prisma migrate deploy` once schema is no longer changing daily.
7. Review audit logs after each demo and add export/filtering when client reporting requires it.
8. Document client onboarding/offboarding steps.
