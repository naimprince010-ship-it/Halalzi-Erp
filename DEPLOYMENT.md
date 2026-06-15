# Halalzi ERP Deployment Guide

## Recommended Target
Use:
- Vercel for the Next.js app
- Managed PostgreSQL for the database
- GitHub as source control

## Required Environment Variables
Set these in Vercel:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
SESSION_SECRET="a-long-random-secret-at-least-32-characters"
NODE_ENV="production"
```

Do not use local PGlite or local `.env` values in production.

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

For local env checking, `npm run check:env` may warn about localhost. That is expected locally. For production env values it should pass without placeholder errors.

## Production Database Setup
1. Create a managed PostgreSQL database.
2. Copy its connection string.
3. Add the string as `DATABASE_URL` in Vercel.
4. Add `SESSION_SECRET` in Vercel.
5. Apply Prisma schema:

```powershell
npx prisma db push
```

For later stable production releases, use migrations:

```powershell
npx prisma migrate deploy
```

## Vercel Setup
If this `app` folder is pushed as the GitHub repo root:
- Root directory: default
- Install command: `npm install`
- Build command: `npm run build`

If `E:\ERP_AI_Project_NEW` is pushed as the GitHub repo root:
- Root directory: `app`
- Install command: `npm install`
- Build command: `npm run build`

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
- No CI pipeline yet
- No audit log yet
- No rate limiting yet
- No password reset yet
- No email verification yet
- No automated backup policy yet
- No monitoring/alerting yet
