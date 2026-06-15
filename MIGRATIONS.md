# Halalzi ERP Prisma Migration Runbook

## Current State
The first production deployment used `prisma db push` to create the Neon schema quickly.
HAL-76 adds a baseline Prisma migration so future schema changes can move to `prisma migrate deploy`.

## Files
- Baseline migration: `prisma/migrations/20260615140500_initial_core_erp/migration.sql`
- Migration lock: `prisma/migrations/migration_lock.toml`

## Important Rule
Do not switch Vercel production build from `npm run build` to `npm run build:migrate` until the existing production database has the baseline migration marked as applied.

The production database already has the tables because `prisma db push` ran during the first deploy. Running the initial migration directly against that database would try to recreate existing tables and fail.

## Baseline Existing Production Database
When ready, use a trusted environment with production `DATABASE_URL` and run:

```powershell
npx prisma migrate resolve --applied 20260615140500_initial_core_erp
```

Then verify:

```powershell
npx prisma migrate status
```

Or use the guarded helper command:

```powershell
npm run prisma:baseline:production -- --apply
```

The helper refuses to run unless `DATABASE_URL` is present and `--apply` is passed.
It can load `.env.production.local` automatically, or you can pass a specific env file:

```powershell
npm run prisma:baseline:production -- --apply --env-file=.env.production.local
```

If using Vercel production environment variables locally, first authenticate the Vercel CLI and pull the production env into a temporary local file:

```powershell
vercel login
vercel link
vercel env pull .env.production.local --environment=production
```

Then run the helper from a shell where `DATABASE_URL` points to the production Neon database. Do not commit `.env.production.local`.

## Switch Vercel To Migration Deploy
After the baseline is marked applied:

1. In Vercel project settings, change Build Command to:

```text
npm run build:migrate
```

2. Or update `package.json` build script to:

```json
"build": "prisma generate && prisma migrate deploy && next build"
```

3. Deploy.
4. Run production smoke test.

## Future Schema Change Workflow
For each schema change:

```powershell
npm run prisma:migrate -- --name short_change_name
npm run lint
npm run build:ci
git add prisma/migrations prisma/schema.prisma
git commit -m "Add <feature> migration"
git push
```

Production should then apply migrations through `prisma migrate deploy`.

## Rollback Guidance
Prisma migrations do not automatically roll back.

Before production schema changes:
1. Confirm Neon restore point or backup availability.
2. Review generated SQL.
3. Deploy during a low-traffic window.
4. Keep a manual rollback SQL/data plan for risky changes.
