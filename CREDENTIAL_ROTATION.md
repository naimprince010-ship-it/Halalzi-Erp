# Halalzi ERP Admin Credential Rotation Runbook

Safe rotation of the production demo/admin account password, without exposing
secrets in code, git, logs, or shared output.

## Scope
- App: `https://halalzi-erp.vercel.app`
- Database: Neon PostgreSQL via Vercel Marketplace (`neon-byzantine-ribbon`)
- Auth: bcrypt password hashing (12 rounds) — see `src/lib/auth/password.ts`
- Demo admin identity: the seeded/admin account (e.g. `admin@halalzi.local`)

## Safety Rules
- Never commit, paste, or log plaintext passwords, hashes, `DATABASE_URL`,
  `SESSION_SECRET`, or tokens.
- Never hard-code a new admin password anywhere in the repo.
- Store the new password only in a **private password manager**.
- Prefer the app's password reset flow so no hash is handled manually.
- Direct DB updates must be a single, parameterized, `companyId`/email-scoped
  statement run by an operator — never a bulk update, never `migrate reset`.

## What Never To Commit
- Plaintext passwords or bcrypt hashes.
- `.env`, `.env.production.local`, or any file containing real credentials
  (already covered by `.gitignore` `.env*`).
- Screenshots or notes containing the password.

## Choosing a New Strong Password
Use a password manager generator, or generate locally:

```powershell
npm run rotate:admin -- --generate
```

This prints a strong password **once** (plus its bcrypt hash) for you to copy
into your password manager. Clear the terminal afterward
(`Clear-Host`). The helper never writes to the database.

## Path A — Rotate via Password Reset Flow (recommended)
No hash handling, lowest risk:

1. Ensure the admin email can receive mail (Resend sender configured).
2. Go to `https://halalzi-erp.vercel.app/forgot-password`.
3. Enter the admin email and submit.
4. Open the reset link from the email and set the new password (the one you
   generated and saved in your password manager).
5. Verify (see "Verify Rotation").

If email delivery is not yet reliable, use Path B.

## Path B — Direct Database Rotation (operator-gated)
Use only from a trusted shell with the production `DATABASE_URL` available as an
environment variable (never printed). Do this only if Path A is unavailable.

1. Generate the new password and its hash locally:

   ```powershell
   # Option 1: generate a fresh password + hash
   npm run rotate:admin -- --generate

   # Option 2: hash a password you already chose (read it in without history)
   $env:NEW_ADMIN_PASSWORD = Read-Host "New admin password"
   npm run rotate:admin -- --hash
   Remove-Item Env:NEW_ADMIN_PASSWORD
   ```

   `--hash` prints only the bcrypt hash; the plaintext is never printed.

2. Apply a single, scoped, parameterized update against production. Example with
   `psql` using a bound parameter so the hash is not embedded in the SQL text in
   shell history (replace the email with the real admin email):

   ```powershell
   # BCRYPT_HASH is the value printed by the helper.
   psql "$env:DATABASE_URL" `
     -v ON_ERROR_STOP=1 `
     -v newhash="$env:BCRYPT_HASH" `
     -c 'UPDATE "User" SET "passwordHash" = :''newhash'', "updatedAt" = now() WHERE email = :''email'';' `
     -v email="admin@halalzi.local"
   ```

   Notes:
   - Update exactly one row (scoped by `email`). Confirm `UPDATE 1`.
   - Never run an unscoped `UPDATE "User"`.
   - Do not paste `DATABASE_URL` or the hash into shared logs.

3. Invalidate existing admin sessions so the old login cannot continue:

   ```powershell
   psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 `
     -c 'UPDATE "Session" SET "revokedAt" = now() WHERE "revokedAt" IS NULL AND "userId" = (SELECT id FROM "User" WHERE email = :''email'');' `
     -v email="admin@halalzi.local"
   ```

## Verify Rotation
1. **Old password fails**: attempt login with the old password — expect 401
   `INVALID_CREDENTIALS`.
2. **New password works**: run the production smoke test with the new
   credentials (type the password directly; do not paste into shared logs):

   ```powershell
   $env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
   $env:SMOKE_ADMIN_EMAIL = "<admin email>"
   $env:SMOKE_ADMIN_PASSWORD = "<new admin password>"
   npm run smoke:prod
   Remove-Item Env:SMOKE_ADMIN_PASSWORD
   ```

   Expect `"failed": 0` and a successful `admin login succeeds` check.
3. Confirm the audit log shows the new `auth.login` activity (smoke test asserts
   this when credentials are provided).

## After Rotation
1. Save the new password in the private password manager only.
2. Clear terminal history/scrollback that may contain the generated password.
3. Disable any unused demo accounts (see `OPERATIONS.md` — Admin Credential Policy).
4. Record the rotation date below (no secret values).

### Rotation Log
| Date | Admin email | Method (A reset / B direct) | Verified | Operator |
| ---- | ----------- | --------------------------- | -------- | -------- |
|      |             |                             |          |          |

## Related Docs
- `OPERATIONS.md` — Admin Credential Policy, incident response.
- `MONITORING.md` — production smoke and log review.
- `DEPLOYMENT.md` — environment variables and production setup.
