# HAL-132 Authenticated Production Smoke

## Goal

Run production smoke with authenticated admin checks enabled, without exposing
admin credentials in chat, Linear, docs, terminal output, or committed files.

## Target

- Production URL: `https://halalzi-erp.vercel.app`
- Script: `npm run smoke:prod`
- Required credentials:
  - `SMOKE_ADMIN_EMAIL`
  - `SMOKE_ADMIN_PASSWORD`

## Secure Local Setup

Run these in a local PowerShell terminal. Type the real values locally only.
Do not paste the password into chat, Linear, docs, screenshots, or committed
files.

```powershell
$env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
$env:SMOKE_ADMIN_EMAIL = "<type_production_admin_email_here>"
$env:SMOKE_ADMIN_PASSWORD = "<type_production_admin_password_here>"
npm run smoke:prod
```

## Expected Checks

The smoke script should report all checks passing:

- Public pages render.
- Protected APIs reject unauthenticated access.
- Admin login succeeds.
- `/api/auth/me` returns safe user context.
- Dashboard summary has safe operational shape.
- Audit logs have safe shape and include login activity.
- Admin can read core module APIs.
- Module API responses expose no password/session hashes.

## Evidence Rules

When recording the result:

- Include only pass/fail counts and check names.
- Do not include the admin email if it is sensitive.
- Never include the admin password.
- Never include cookies, session values, reset tokens, verification tokens, or
  provider/API keys.

## Blocked State

If secure admin smoke credentials are not available in the current shell:

- Do not run the authenticated smoke.
- Keep HAL-132 In Progress.
- Record that the task is blocked on secure local credential entry.
- Do not mark Done until authenticated smoke passes.
