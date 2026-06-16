# HAL-88 Resend Password Reset Email

## Goal

Connect the password reset foundation to real email delivery through Resend without committing provider secrets.

## Files Changed

- `.env.example`
- `src/lib/email/resend.ts`
- `src/app/api/auth/password-reset/request/route.ts`
- `DEPLOYMENT.md`
- `OPERATIONS.md`
- `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md`
- `10-releases/HAL-88_RESEND_PASSWORD_RESET_EMAIL.md`

## Behavior

- Password reset requests now attempt to send an email with a secure reset link.
- Reset links use `APP_BASE_URL` when configured.
- `EMAIL_FROM` controls the sender address.
- `RESEND_API_KEY` is read from environment variables only.
- Local development still returns a dev reset token when not in production.
- Production never exposes the reset token in the API response.
- If email delivery fails, the public response remains generic and safe.

## Security Notes

- No Resend API key is committed to Git.
- Reset tokens are still stored hashed and remain single-use.
- Password reset request audit logs now include whether email delivery succeeded.
- A custom verified sender domain should be configured before real client onboarding.

## Required Production Environment Variables

```env
APP_BASE_URL="https://halalzi-erp.vercel.app"
EMAIL_FROM="Halalzi ERP <onboarding@resend.dev>"
RESEND_API_KEY="set-in-vercel-env"
```

## Verification

- Local lint.
- CI build.
- Vercel deployment.
- Production smoke.

## Blockers

Custom sender domain verification and email verification remain future hardening work.
