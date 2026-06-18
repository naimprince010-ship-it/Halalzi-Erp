# Halalzi ERP Backup & Restore Runbook

Production-safe backup and restore verification for the Neon PostgreSQL database
used by the Vercel deployment.

## Scope
- App: `https://halalzi-erp.vercel.app`
- Hosting: Vercel
- Database: Neon PostgreSQL through Vercel Marketplace
- Production branch: `master`
- Neon project resource: `neon-byzantine-ribbon`

This runbook covers: confirming backups exist, verifying a backup is restorable
**without touching production**, and a production incident checklist.

## Safety Rules (read first)
- Never run destructive SQL or `prisma migrate reset` against production.
- Never run restore verification against the production branch. Always restore
  into a **separate** Neon branch or database.
- Do not print or commit `DATABASE_URL` or any secret. Use `.env.production.local`
  (git-ignored) or shell environment variables.
- Do not modify production data during verification.
- The verification helper is read-only and refuses to target production.

## How Backups Work on Neon
Neon provides two recovery mechanisms; no external cron is required for MVP:

1. **Point-in-time restore (history retention)** — Neon retains write-ahead-log
   history for the project's retention window, so you can create a branch as of
   any timestamp within that window.
2. **Branching** — A branch is a copy-on-write clone of the data at a point in
   time. Restoring is creating a branch at a past timestamp and pointing a
   throwaway environment at it.

For an additional portable backup, you can also take a logical dump with
`pg_dump` (see "Optional Logical Dump" below). Keep dumps out of git.

## Backup Verification (non-destructive)
Goal: prove the production data can be recovered, without changing production.

### A. Confirm retention and a restore point exists
1. Open the Neon console for project `neon-byzantine-ribbon`.
2. Confirm the **history retention** window (e.g. 7 days) is enabled and long
   enough for the recovery objective.
3. Note the current timestamp as a candidate restore point.

### B. Create a restore branch (copy, not production)
1. In the Neon console, create a new branch from `production` (or the primary
   branch) **as of a chosen past timestamp**, e.g. name it
   `restore-test-YYYYMMDD`.
2. Copy that branch's connection string. This is the **restore branch** URL.
3. Do not change the production branch in any step.

### C. Verify the restore branch with the read-only helper
From `app/`, using a git-ignored env file that defines `RESTORE_DATABASE_URL`
(the restore branch connection string):

```powershell
# .env.restore.local  (git-ignored), contains:
#   RESTORE_DATABASE_URL="postgresql://USER:PASSWORD@RESTORE_HOST/DB?sslmode=require"

npm run verify:restore -- --env-file=.env.restore.local
```

The helper:
- Connects to `RESTORE_DATABASE_URL` only (never `DATABASE_URL`).
- Refuses to run if `RESTORE_DATABASE_URL` equals `DATABASE_URL`.
- Runs read-only `SELECT count(*)` on key tables and prints row counts.
- Never writes data and never prints the connection string.

Expected output ends with:

```text
Restore branch looks healthy (schema present, queries succeed).
```

If a table is reported `MISSING`, the restore point may predate a migration, or
the restore is incomplete. Pick a later restore timestamp and retry.

### D. (Optional) App-level connect test against the restore branch
To confirm the app boots against the restored data, run the app locally with
`DATABASE_URL` set to the **restore branch** (never production) in a temporary
shell, then run the unauthenticated smoke checks:

```powershell
# In a throwaway shell only. Do not persist this value.
$env:DATABASE_URL = "<restore-branch-connection-string>"
$env:SESSION_SECRET = "<any-32+char-local-secret>"
npm run dev
```

In another shell:

```powershell
$env:SMOKE_BASE_URL = "http://127.0.0.1:3000"
npm run smoke:prod
```

Unauthenticated page/redirect checks should pass. Stop the dev server and clear
the temporary `DATABASE_URL` afterward.

### E. Clean up
1. Delete the `restore-test-*` branch in Neon once verification passes.
2. Delete `.env.restore.local` if it is no longer needed.
3. Record the result (see "Verification Log").

## Optional Logical Dump (portable backup)
For an off-Neon copy, run `pg_dump` against a **restore branch** (preferred) or
production read replica, never interrupting production:

```powershell
# Targets a restore branch; writes a local dump file kept OUT of git.
pg_dump "$env:RESTORE_DATABASE_URL" --format=custom --no-owner --file=backup-YYYYMMDD.dump
```

Restore the dump into a **fresh** throwaway database to test it:

```powershell
pg_restore --no-owner --dbname "$env:TEST_RESTORE_DATABASE_URL" backup-YYYYMMDD.dump
```

Never `pg_restore` into the production branch. Store dump files securely and
delete local copies after verification.

## Production Incident Checklist (data loss / corruption)

### Before restore
1. **Stop the bleeding**: pause client onboarding and, if needed, put the app in
   maintenance (or restrict writes) to prevent further bad writes.
2. Capture the incident timestamp and the last known-good timestamp.
3. In Neon, confirm the last known-good time is inside the retention window.
4. Notify stakeholders; record the decision in an internal issue.
5. Do **not** run destructive commands on production yet.

### During restore
1. Create a **restore branch** from the last known-good timestamp (copy-on-write,
   does not change production).
2. Verify it with `npm run verify:restore -- --env-file=.env.restore.local`.
3. Optionally connect a temporary app instance to the restore branch and confirm
   the missing/corrupted data is present and correct.
4. Decide the cutover method:
   - **Promote branch**: in Neon, promote the verified restore branch to be the
     primary the app uses, or
   - **Repoint app**: update `DATABASE_URL` in Vercel to the verified restore
     branch and redeploy.
5. Keep the original production branch intact for forensics until sign-off.

### After restore
1. Update Vercel `DATABASE_URL` if the app was repointed; trigger a deploy.
2. Run the production smoke test:

```powershell
$env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL = "<admin email>"
$env:SMOKE_ADMIN_PASSWORD = "<admin password>"
npm run smoke:prod
```

Expected: `"failed": 0`.

3. Spot-check critical data per company (`companyId` scope): users, products,
   recent sales/purchase orders, finance accounts, audit logs.
4. Re-enable client onboarding only after sign-off.
5. Write a short post-incident note: cause, restore point used, data delta,
   follow-ups.

### Smoke tests summary
- Unauthenticated: home, `/login`, `/register`, protected routes redirect.
- Authenticated (if credentials available): dashboard summary loads, no
  `passwordHash`/`tokenHash` leakage (the smoke script asserts this).

## Verification Log
Keep a short record after each verification (monthly recommended):

| Date | Restore point | Branch name | verify:restore result | Notes |
| ---- | ------------- | ----------- | --------------------- | ----- |
|      |               |             |                       |       |

## Related Docs
- `OPERATIONS.md` — Database Backup Policy and Incident Response.
- `DEPLOYMENT.md` — environment variables and production setup.
- `MIGRATIONS.md` — migration baseline and deploy workflow.
