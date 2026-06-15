# HAL-76 Prisma Migration Baseline

## Goal

Prepare the ERP app for safer production database migrations without immediately changing the current Vercel production build behavior.

## Files Changed

- `prisma/migrations/20260615140500_initial_core_erp/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `MIGRATIONS.md`
- `package.json`
- `DEPLOYMENT.md`
- `OPERATIONS.md`

## What Was Implemented

- Added a Prisma baseline migration generated from the current complete schema.
- Added Prisma migration lock metadata for PostgreSQL.
- Added migration scripts:
  - `prisma:deploy`
  - `build:migrate`
- Updated `check` to run lint plus the CI-safe production build.
- Added a dedicated migration runbook in `MIGRATIONS.md`.
- Updated deployment and operations docs to point future migration work through the runbook.

## Production Safety Decision

The current Vercel production database was first created with `prisma db push`.

Because of that, production build was intentionally kept as:

```bash
prisma generate && prisma db push && next build
```

Do not switch production directly to `prisma migrate deploy` until the existing Neon production database baseline has been marked applied:

```bash
npx prisma migrate resolve --applied 20260615140500_initial_core_erp
```

After baseline resolution is confirmed, production can move to:

```bash
npm run build:migrate
```

## Verification

- `npx prisma validate`: PASS
- `npm run lint`: PASS
- `npm run build:ci`: PASS

Build output included all current ERP routes, including auth, products, sales, procurement, finance, users, roles, and dashboard pages.

## Migration Diff Check

Command attempted:

```bash
npx prisma migrate diff --from-migrations prisma\migrations --to-schema prisma\schema.prisma --exit-code
```

Result:

- BLOCKED by local shadow database availability.
- Prisma returned `P1001`, cannot reach database server at `localhost:51215`.

This is an environment issue for local diff verification, not a production migration switch. The baseline migration was generated from the current Prisma schema and schema validation passed.

## Next Step

HAL-77 should safely baseline the production Neon database using `migrate resolve --applied`, then verify migration status before changing the Vercel build command.

## Blockers

- No source-code blocker.
- Local migration diff needs the configured shadow database at `localhost:51215` to be running.
