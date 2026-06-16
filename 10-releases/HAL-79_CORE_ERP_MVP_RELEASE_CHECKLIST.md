# HAL-79 Core ERP MVP Release Checklist

## Goal

Create a final release checklist for the Core ERP MVP so future work can clearly distinguish between:

- Core ERP MVP readiness
- Production hardening still pending
- Future ecosystem modules outside the Core ERP scope

## Core ERP MVP Scope

The current Core ERP MVP includes:

- Authentication and protected dashboard
- Company/tenant isolation
- Users, roles, and RBAC
- Products and basic inventory
- Sales orders
- Vendors and purchase orders
- Basic finance accounts, journal entries, receivables, and payables
- Production deployment on Vercel
- Neon PostgreSQL production database
- GitHub CI
- Production smoke test script
- Operations, deployment, and migration runbooks

## Release Gate Matrix

| Gate | Status | Evidence |
|---|---|---|
| Production app reachable | PASS | HAL-78 production smoke |
| Public pages render | PASS | `/`, `/login`, `/register` returned 200 |
| Protected APIs reject unauthenticated access | PASS | HAL-78 protected API smoke |
| Production admin login works | PASS | HAL-78 admin login smoke |
| Auth context safe response | PASS | No password/session hashes exposed |
| Admin can read core module APIs | PASS | Users, roles, products, vendors, purchases, sales, finance APIs returned 200 |
| GitHub CI configured | PASS | CI runs on `master` push |
| CI latest run passing | PASS | HAL-84 commit CI passed |
| Migration baseline created | PASS | HAL-76 baseline migration |
| Production migration helper ready | PASS | HAL-77 guarded helper |
| Basic audit/activity log available | PASS | HAL-82, HAL-83, and HAL-84 audit work |
| Basic API rate limiting available | PASS | HAL-86 middleware guard |
| Password reset foundation available | PASS | HAL-87 secure token reset flow |
| Password reset email delivery available | PASS | HAL-88 Resend integration |
| Email verification foundation available | PASS | HAL-89 secure token verification flow |
| Production migration baseline applied | PENDING | Requires trusted production `DATABASE_URL` |
| Build command switched to migrate deploy | PENDING | Should happen only after baseline apply |

## User-Facing Release Checklist

Before calling the Core ERP MVP demo-ready:

1. Confirm production URL opens.
2. Confirm admin login works.
3. Confirm dashboard opens after login.
4. Confirm these module pages load:
   - Dashboard
   - Company
   - Users
   - Roles
   - Profile
   - Products
   - Sales
   - Procurement
   - Finance
   - Audit
5. Create one test product.
6. Create one test vendor.
7. Create one draft sales order.
8. Create one draft purchase order.
9. Confirm read-only staff role cannot mutate core records.
10. Confirm no client/demo credential is reused for real clients.

## Technical Release Checklist

Before each production release:

```powershell
npm run lint
npm run build:ci
```

After deployment:

```powershell
$env:SMOKE_BASE_URL="https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL="admin@halalzi.local"
$env:SMOKE_ADMIN_PASSWORD="***"
node scripts\production-smoke.mjs
```

Expected smoke result:

```json
{
  "total": 8,
  "passed": 8,
  "failed": 0
}
```

## Known Pending Items

These are not blockers for Core ERP MVP demo readiness, but they should be completed before selling to real paying clients:

1. Apply production migration baseline with a trusted production `DATABASE_URL`.
2. Switch production build from `prisma db push` to `prisma migrate deploy`.
3. Verify custom email sender domain.
4. Replace in-memory rate limiting with durable shared rate limiting if traffic or abuse risk grows.
5. Add CSV/export reports for client data.
6. Add backup/restore verification notes for Neon.
7. Add deeper audit filters and export after real client reporting needs are known.
8. Rotate demo admin password before external demos.

## Out Of Scope For Core ERP MVP

These belong after Core ERP MVP sign-off:

- CRM
- HRM and payroll
- POS
- WMS/logistics
- E-commerce
- BI/analytics forecasting
- Advanced project management
- Advanced procurement RFQ workflows

## MVP Sign-Off Rule

Core ERP MVP can be considered release-ready when:

1. GitHub CI is green.
2. Production smoke is green.
3. Admin can log in and browse all core modules.
4. Staff/read-only permissions are verified.
5. Known pending production hardening items are documented and accepted.

## Current HAL-79 Status

HAL-79 establishes the release checklist and keeps the Core ERP scope focused. It does not change production behavior or database state.
