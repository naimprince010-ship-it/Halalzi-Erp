# HAL-77 Production Migration Baseline Helper

## Goal

Make the production baseline step safer and repeatable before switching Vercel from `prisma db push` to `prisma migrate deploy`.

## Files Changed

- `scripts/resolve-production-baseline.mjs`
- `package.json`
- `MIGRATIONS.md`
- `DEPLOYMENT.md`
- `OPERATIONS.md`

## What Was Implemented

- Added a guarded helper command:

```bash
npm run prisma:baseline:production -- --apply
```

- The helper marks the existing production database as having already applied the baseline migration:

```text
20260615140500_initial_core_erp
```

- The helper refuses to run unless `--apply` is provided.
- The helper requires `DATABASE_URL` and never prints the secret value.
- The helper can load:
  - current shell `DATABASE_URL`
  - `.env.production.local`
  - a custom file with `--env-file=path/to/file`
- After resolving the baseline, the helper runs `prisma migrate status`.

## Production Safety Decision

The production Neon database was not modified in this HAL.

Reason:

- Vercel CLI is installed, but this machine has no Vercel CLI credentials.
- `vercel whoami` returned no existing credentials.
- Production `DATABASE_URL` was not available in the local shell.

Because this is a production database history operation, the correct behavior is to stop before mutation rather than guess or switch build commands prematurely.

## Verification

- Guard command without `--apply`: PASS, refused to modify migration history.
- `npm run lint`: PASS
- `npm run build:ci`: PASS

Build output included the full current route set:

- auth APIs
- users and roles APIs
- products APIs
- sales APIs
- procurement APIs
- finance APIs
- dashboard pages

## How To Apply Baseline Later

After Vercel CLI login/link or another trusted production shell is available:

```powershell
vercel login
vercel link
vercel env pull .env.production.local --environment=production
npm run prisma:baseline:production -- --apply --env-file=.env.production.local
```

Then verify the migration status and only then switch Vercel build to:

```bash
npm run build:migrate
```

## Blockers

- Production baseline apply is blocked until a trusted production `DATABASE_URL` is available locally or in another secure operator shell.
