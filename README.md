# Halalzi ERP

Halalzi ERP is a multi-tenant Core ERP MVP built with Next.js, Prisma, PostgreSQL, and Vercel.

## Production

- App: `https://halalzi-erp.vercel.app`
- Source: `https://github.com/naimprince010-ship-it/Halalzi-Erp`
- Hosting: Vercel
- Database: Neon PostgreSQL

## Core MVP Modules

- Authentication
- Company and tenant isolation
- Users, roles, and RBAC
- Products and basic inventory
- Sales orders
- Vendors and purchase orders
- Basic finance accounts, journal entries, receivables, and payables
- Audit/activity log
- Password reset foundation
- Email verification foundation
- Production smoke testing

## Local Development

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

Run before committing:

```powershell
npm run lint
npm run build:ci
```

For a production smoke test:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="<admin email>"
$env:SMOKE_ADMIN_PASSWORD="<admin password>"
npm run smoke:prod
```

## Important Docs

- `DEPLOYMENT.md` - deployment setup and environment variables
- `OPERATIONS.md` - production operations and incident response
- `MIGRATIONS.md` - Prisma migration baseline and future migration workflow
- `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md` - current Core ERP MVP release checklist

## Production Migration Note

The current production database was initially created with `prisma db push`.

Do not switch production to `prisma migrate deploy` until the baseline migration has been marked applied using the guarded helper documented in `MIGRATIONS.md`.
