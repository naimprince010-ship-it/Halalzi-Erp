# HAL-87 Password Reset Foundation

## Goal

Add a secure password reset foundation for workspace users while keeping email-provider work separate.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260616043000_add_password_reset_tokens/migration.sql`
- `src/lib/auth/password-reset.ts`
- `src/app/api/auth/password-reset/request/route.ts`
- `src/app/api/auth/password-reset/confirm/route.ts`
- `src/components/auth/ForgotPasswordForm.tsx`
- `src/components/auth/ResetPasswordForm.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/proxy.ts`
- `scripts/production-smoke.mjs`
- release and operations docs

## Behavior

- Users can request password reset instructions from `/forgot-password`.
- Users can submit a reset token and new password from `/reset-password`.
- Reset tokens are random, stored hashed, expire after 30 minutes, and are single-use.
- Existing sessions are revoked after successful password reset.
- Request responses do not reveal whether an email exists.
- Local development may return a dev reset token; production does not expose reset tokens.

## Security Notes

- Reset token hashes are stored with SHA-256.
- New passwords are stored with the existing bcrypt hashing helper.
- Password reset request and confirm endpoints are covered by the auth rate limiter.
- Password reset events are written to audit logs.
- Email delivery is intentionally not implemented in this HAL.

## Verification

- Prisma validation.
- Prisma client generation.
- Local lint.
- CI build.
- Production smoke.

## Blockers

Email delivery provider and email verification remain future hardening work.
