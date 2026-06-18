# Halalzi ERP Monitoring & Log Review Runbook

Practical, MVP-friendly production monitoring for the Vercel + Neon deployment.
No paid monitoring service is required. Designed for a solo developer.

## Scope
- App: `https://halalzi-erp.vercel.app`
- Hosting: Vercel (Next.js)
- Database: Neon PostgreSQL via Vercel Marketplace (`neon-byzantine-ribbon`)
- Email: Resend
- Production branch: `master`

## Safety Rules
- Never print or paste secrets (`DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`).
- Monitoring is read-only: never modify production data while reviewing.
- Type admin passwords directly into the shell; do not paste them into shared logs.

## Quick Start
Print the secret-free checklist of commands at any time:

```powershell
npm run monitor:checklist
```

## 1. Review Vercel Deployment (Build) Logs
1. Vercel → Project `halalzi-erp` → **Deployments**.
2. Confirm the latest production deployment shows **Ready** (not **Error**).
3. Open the deployment → **Building** logs and confirm:
   - `prisma generate` completed,
   - the schema step ran (`prisma db push` today, or `prisma migrate deploy` after the migration switch),
   - `next build` compiled successfully.
4. When a build fails, read the **first** error line (root cause), not the last.

Common build failures:
- `P1001: Can't reach database server` — the build-time DB step could not connect; check Neon status and `DATABASE_URL`.
- `P3005: database schema is not empty` — `prisma migrate deploy` ran before baselining; follow `MIGRATIONS.md` (HAL-93 baseline first).
- TypeScript/ESLint errors — reproduce locally with `npm run build:ci`.

## 2. Review Vercel Runtime / Function Logs
1. Vercel → Project `halalzi-erp` → **Logs** (Runtime Logs).
2. Filter to **Error** level, last 24h–7d.
3. Watch for repeated 500s on `/api/*` routes and spikes after a deploy.

### What common errors look like
The app logs these server-side strings (searchable in runtime logs):

| Log signature | Meaning | Likely fix |
| ------------- | ------- | ---------- |
| `INTERNAL_SERVER_ERROR` in an API JSON response with a 500 | Unhandled error in a route (`errorResponse` fallback) | Open the matching log stack; check DB/email cause |
| `Audit log write failed` | Audit insert failed (non-blocking) | Check DB connectivity; the main request may still succeed |
| `Registration email verification delivery failed` | Resend send failed during register | Check `RESEND_API_KEY` / sender domain |
| `Password reset email delivery failed` | Resend send failed during reset | Check `RESEND_API_KEY` / sender domain |
| `Email verification delivery failed` | Resend send failed during resend | Check `RESEND_API_KEY` / sender domain |
| `RESEND_API_KEY is not configured.` | Email attempted in production without a key | Set `RESEND_API_KEY` in Vercel env |
| Prisma `P1001` | Cannot reach the database | Check Neon compute status, `DATABASE_URL` |
| Prisma `P2002` | Unique constraint violation | Usually expected (e.g. duplicate email); confirm it is a client error, not a bug |

### Auth errors (expected vs. concerning)
Auth routes return structured codes; most are **expected** client errors, not incidents:
- Expected: `VALIDATION_ERROR` (400), `INVALID_CREDENTIALS` (401), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `EMAIL_ALREADY_EXISTS` (409).
- Concerning: a surge of `INTERNAL_SERVER_ERROR` (500), or `COMPANY_SUSPENDED` / `USER_DISABLED` appearing unexpectedly for active users.

## 3. Run Production Smoke Checks
Unauthenticated checks need no credentials:

```powershell
$env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
npm run smoke:prod
```

Full authenticated checks (type the password directly, do not paste it anywhere shared):

```powershell
$env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL = "<admin email>"
$env:SMOKE_ADMIN_PASSWORD = "<admin password>"
npm run smoke:prod
```

Expected result ends with `"failed": 0`. The smoke script also asserts that API
responses never leak `passwordHash` or `tokenHash`.

## 4. Database (Neon) Health
1. Neon console → project `neon-byzantine-ribbon`.
2. Confirm compute is active (not unexpectedly suspended) and within plan limits.
3. Confirm the history retention window is enabled (needed for restores — see `BACKUP_RESTORE.md`).
4. For connection errors in logs, confirm `DATABASE_URL` exists in Vercel env. Do not print it.

## 5. Email (Resend) Health
1. Resend console → **Emails**; confirm recent password-reset and verification sends succeeded.
2. On failures, confirm `RESEND_API_KEY` and `EMAIL_FROM` exist in Vercel env (do not print them).
3. Confirm the sender domain is verified before real client onboarding.

## Weekly Monitoring Checklist
Run `npm run monitor:checklist`, then confirm:

- [ ] Latest production deploy is **Ready**.
- [ ] No unresolved Error-level runtime logs in the last 7 days.
- [ ] `npm run smoke:prod` passes with `"failed": 0`.
- [ ] Neon compute healthy; retention window intact.
- [ ] Recent Resend emails delivered.
- [ ] Result and date recorded below.

### Monitoring Log
| Date | Deploy status | Smoke result | Notable log issues | Reviewer |
| ---- | ------------- | ------------ | ------------------ | -------- |
|      |               |              |                    |          |

## Incident Triage Checklist
1. **Confirm scope**: is the whole app down, one module, or one company?
2. **Check deploy**: Vercel → Deployments. If the latest deploy is broken, roll back to the previous **Ready** deployment (Vercel → Deployment → Promote/Rollback).
3. **Check runtime logs**: filter Error level around the incident time; capture the first stack trace.
4. **Check dependencies**: Neon compute status, then Resend status.
5. **Reproduce safely**: run `npm run smoke:prod` (unauthenticated first).
6. **Contain**: if data integrity is at risk, pause client onboarding and follow `BACKUP_RESTORE.md`.
7. **Record**: incident time, symptom, root cause, fix, follow-ups.

## Escalation Path
- **Deploy/build broken** → roll back to the last Ready deployment in Vercel, then fix forward locally with `npm run build:ci`. Reference `DEPLOYMENT.md`.
- **Database error / data loss** → follow `BACKUP_RESTORE.md` (create a restore branch, verify with `npm run verify:restore`, repoint/promote). Never run `prisma migrate reset` on production.
- **Email delivery broken** → verify Resend status, `RESEND_API_KEY`, `EMAIL_FROM`, and sender domain. Email failures are non-blocking for login (see `OPERATIONS.md`), so prioritize behind app/database outages.

## Related Docs
- `OPERATIONS.md` — incident response, backup policy, release process.
- `DEPLOYMENT.md` — environment variables, build commands.
- `BACKUP_RESTORE.md` — backup/restore verification.
- `MIGRATIONS.md` — migration baseline and deploy workflow.
