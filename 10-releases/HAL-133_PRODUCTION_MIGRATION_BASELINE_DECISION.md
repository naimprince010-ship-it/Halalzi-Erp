# HAL-133 Production Migration Baseline Hardening Decision

## Goal

Decide the safe path for moving production from bootstrap `prisma db push` to
reviewable `prisma migrate deploy`.

## Current Production Deploy Behavior

Production currently builds with:

```text
prisma generate && prisma db push --accept-data-loss && next build
```

This is wired through `package.json` as `npm run build`. It was kept as a
bootstrap path because the production Neon database was originally created by
`prisma db push`, not by Prisma migration history.

The repository also has the long-term migration deployment command:

```text
npm run build:migrate
```

That command runs:

```text
prisma generate && node scripts/production-migrate-deploy.mjs && next build
```

## Why `db push --accept-data-loss` Is Temporary

`prisma db push` is useful for early bootstrap because it applies the desired
schema directly. It is not a safe long-term production process because:

- It does not create a durable migration history.
- SQL changes are not reviewed as explicit migration files during deployment.
- Production drift is harder to reason about.
- `--accept-data-loss` suppresses Prisma's safety prompt and should not be a
  permanent production habit.

The long-term target remains:

```text
prisma migrate deploy
```

## Why Switching Now May Be Unsafe

The production database already has tables from earlier `db push` deploys. If
`prisma migrate deploy` runs before production is baselined, Prisma can attempt
to apply migrations against an already-populated schema and fail with P3005 or
similar migration-history errors.

The baseline helper exists:

```text
npm run prisma:baseline:production -- --apply
```

It discovers every committed migration folder under `prisma/migrations/` and
marks each one as applied. This is safer than running manual `migrate resolve`
commands by hand, but it still modifies production migration history and must be
run only from a trusted shell with a verified production `DATABASE_URL`.

## Current Migration Folders

Current committed migration folders:

1. `20260615140500_initial_core_erp`
2. `20260615164500_add_audit_log`
3. `20260616043000_add_password_reset_tokens`
4. `20260616052000_add_email_verification`
5. `20260618161000_add_crm_foundation`
6. `20260619143000_add_crm_phase2_pipeline_foundation`
7. `20260622210000_add_receivable_salesorderid_unique`
8. `20260622213000_add_payable_purchaseorderid_unique`
9. `20260623032000_add_stock_ledger`

## Baseline Options

### Option A: Defer Baseline For Now

Keep the current Vercel build command unchanged and continue using the
bootstrap workflow while the product is still in controlled demo/pilot stage.

Pros:

- No production migration-history mutation today.
- Avoids risky operator work without a trusted production shell ready.
- Lets the team focus on demo/pilot feedback and near-term product depth.

Cons:

- `db push --accept-data-loss` remains a production risk.
- Schema-change discipline is weaker until the baseline is completed.

### Option B: Apply Baseline From Trusted Secure Shell

Use a trusted local/operator shell with production `DATABASE_URL` available
securely and run:

```powershell
npm run prisma:baseline:production -- --apply
npx prisma migrate status
```

Only after all migrations show as applied with no failures, switch Vercel build
to:

```text
npm run build:migrate
```

Pros:

- Moves production toward a proper migration workflow.
- Removes the need for `db push --accept-data-loss`.

Cons:

- Requires secure production database credentials.
- Requires careful operator discipline.
- If production drift differs from committed migrations, the team must resolve
  it before switching deploy mode.

### Option C: Rehearse On Staging/Restore Branch First

Create or use a Neon restore branch/staging database, point a trusted shell at
that database, and rehearse:

1. Baseline helper.
2. `npx prisma migrate status`.
3. `npm run build:migrate`.
4. Production-style smoke.

Pros:

- Safest path before modifying production migration history.
- Finds drift or helper issues early.
- Gives a repeatable operator playbook.

Cons:

- Takes extra setup time.
- Requires restore/staging database access.

## Recommended Decision

Decision: **DEFER direct production baseline today and do a staging/restore
rehearsal first.**

Reason:

- The app is signed off for demo and controlled onboarding, not broad paid-client
  production onboarding.
- Production schema has changed frequently during MVP hardening.
- The current session does not have trusted production `DATABASE_URL` handling.
- A staging/restore rehearsal gives a safer path to production migration
  hardening without risking the current live demo environment.

## Exact Next Safe Steps

1. Keep Vercel build command unchanged for now:

   ```text
   npm run build
   ```

2. Do not run production baseline from an untrusted shell.
3. Prepare a restore/staging database rehearsal.
4. In a trusted shell only, set the restore/staging database URL without printing
   it.
5. Run:

   ```powershell
   npm run prisma:baseline:production -- --apply
   npx prisma migrate status
   npm run build:migrate
   ```

6. If the rehearsal passes, schedule a short production maintenance window.
7. Pull/provide production `DATABASE_URL` securely.
8. Run the production baseline helper.
9. Verify:

   ```powershell
   npx prisma migrate status
   ```

10. Switch Vercel build command to `npm run build:migrate`.
11. Deploy and run production smoke.

## Risks

- Continuing `db push --accept-data-loss` can hide risky schema drift.
- Switching to `migrate deploy` before baseline can break deployment.
- Running baseline against the wrong database could corrupt the operating plan.
- Printing `DATABASE_URL` or other secrets would create a security incident.

## Rollback Notes

If migration hardening causes deployment issues:

1. Do not run `prisma migrate reset` against production.
2. Roll Vercel back to the last Ready deployment.
3. Keep `npm run build` as the build command until the baseline issue is fixed.
4. Inspect migration status from a trusted shell.
5. Fix forward with a small, reviewed change.

## When To Switch Vercel Build Command

Switch from:

```text
npm run build
```

to:

```text
npm run build:migrate
```

only when all are true:

- Production baseline helper has completed successfully.
- `npx prisma migrate status` shows no failed or pending unexpected migrations.
- A fresh deploy succeeds in rehearsal/staging.
- Production smoke passes after the switch.

## Security Note: Admin Password Rotation

During HAL-132 handoff, the production admin password was accidentally pasted
into chat. Rotate/change the production admin password before broader demos or
paid-client onboarding. Do not paste the new password into chat, Linear, docs,
terminal logs, or screenshots.

## HAL-133 Decision

HAL-133 is complete as a decision issue:

- Decision recorded: **defer direct production baseline today**.
- Next action: **perform staging/restore rehearsal first**.
- Production database was not modified.
- No production secrets were printed.
- Vercel build command remains unchanged.
