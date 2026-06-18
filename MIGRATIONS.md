# Halalzi ERP Prisma Migration Runbook

## Current State
The first production deployment used `prisma db push` to create the Neon schema quickly.
Every deploy since then has also run `prisma db push` (see the `build` script), so the
production database already contains the full current schema but has **no migration history**.

The repository now tracks a complete migration set. To switch production from
`prisma db push` to `prisma migrate deploy`, every committed migration must be marked as
already applied (baselined) so Prisma does not try to recreate existing tables.

## Files
- Migrations directory: `prisma/migrations/`
- Baseline helper: `scripts/resolve-production-baseline.mjs` (`npm run prisma:baseline:production`)
- Migration lock: `prisma/migrations/migration_lock.toml`

The baseline helper discovers every folder under `prisma/migrations/` automatically and
marks each one as applied in chronological order, so it stays correct as new migrations
are added.

## Committed Migrations (baseline set)
These are all marked as applied during baselining:

1. `20260615140500_initial_core_erp`
2. `20260615164500_add_audit_log`
3. `20260616043000_add_password_reset_tokens`
4. `20260616052000_add_email_verification`

## Important Rule
Do not switch Vercel production build from `npm run build` to `npm run build:migrate` until the existing production database has **all** baseline migrations marked as applied.

The production database already has the tables because `prisma db push` ran during every deploy. Running these migrations directly against that database would try to recreate existing tables and fail.

## Baseline Existing Production Database
When ready, use a trusted environment with production `DATABASE_URL` and run the guarded helper. It marks every committed migration as applied and is safe to re-run (already-applied migrations are skipped):

```powershell
npm run prisma:baseline:production -- --apply
```

The helper refuses to run unless `DATABASE_URL` is present and `--apply` is passed.
It can load `.env.production.local` automatically, or you can pass a specific env file:

```powershell
npm run prisma:baseline:production -- --apply --env-file=.env.production.local
```

To baseline manually instead of using the helper, run one `resolve` per migration in order, then verify:

```powershell
npx prisma migrate resolve --applied 20260615140500_initial_core_erp
npx prisma migrate resolve --applied 20260615164500_add_audit_log
npx prisma migrate resolve --applied 20260616043000_add_password_reset_tokens
npx prisma migrate resolve --applied 20260616052000_add_email_verification
npx prisma migrate status
```

If using Vercel production environment variables locally, first authenticate the Vercel CLI and pull the production env into a temporary local file:

```powershell
vercel login
vercel link
vercel env pull .env.production.local --environment=production
```

Then run the helper from a shell where `DATABASE_URL` points to the production Neon database. Do not commit `.env.production.local`.

## Switch Vercel To Migration Deploy
Only switch after the baseline is marked applied (run `npx prisma migrate status`
against production and confirm every migration shows as applied with no failed
entries). Until then, leave the Vercel build command as `npm run build`.

When the baseline is confirmed applied:

1. In Vercel project settings, change Build Command to:

```text
npm run build:migrate
```

`build:migrate` runs `prisma generate`, then a guarded `prisma migrate deploy`
(`scripts/production-migrate-deploy.mjs`), then `next build`. The guard fails
fast with a clear message (and a pointer back to the baseline step) if the
database has tables but no migration history (Prisma error P3005), so a deploy
attempted before baselining cannot silently misbehave.

2. Or update the `package.json` build script to:

```json
"build": "prisma generate && node scripts/production-migrate-deploy.mjs && next build"
```

3. Deploy.
4. Run production smoke test.

### Never use `prisma db push` as the long-term production workflow
`prisma db push` is only acceptable for the initial bootstrap. It has no
migration history, no review trail, and can silently drop columns/data on
diverging schemas. Once the baseline is applied, all production schema changes
must flow through committed migrations applied with `prisma migrate deploy`.

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
