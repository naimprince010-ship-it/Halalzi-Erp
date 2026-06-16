# HAL-89 Email Verification Foundation

## Goal

Add a secure email verification foundation using the existing Resend email delivery setup.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260616052000_add_email_verification/migration.sql`
- `src/lib/auth/email-verification.ts`
- `src/lib/email/resend.ts`
- `src/app/api/auth/email-verification/request/route.ts`
- `src/app/api/auth/email-verification/confirm/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/components/auth/VerifyEmailForm.tsx`
- `src/app/verify-email/page.tsx`
- `src/proxy.ts`
- `scripts/production-smoke.mjs`
- release and operations docs

## Behavior

- New users receive an email verification token after registration.
- Authenticated users can request a fresh verification email.
- `/verify-email` accepts a verification token and confirms the user email.
- Verification tokens are random, stored hashed, expire after 24 hours, and are single-use.
- Existing users are not blocked from login yet, so production admin access remains safe.

## Security Notes

- Verification token hashes are stored with SHA-256.
- Tokens are never stored in plaintext.
- Email verification request and confirm endpoints are rate-limited by the auth policy.
- Verification request/confirm events are written to audit logs.
- Custom sender domain verification remains recommended before real client onboarding.

## Verification

- Prisma validation.
- Prisma client generation.
- Local lint.
- CI build.
- Vercel deployment.
- Production smoke.

## Blockers

None for the foundation. Enforcing verified email at login can be introduced after existing production accounts are verified.
