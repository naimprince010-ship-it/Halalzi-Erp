# HAL-90 Email Domain and Verification Enforcement Plan

## Goal

Document the safe rollout path for a custom Resend sender domain and future email verification enforcement.

## Why No Code Enforcement Yet

Email verification should not block login until:

- The sender domain is verified.
- Existing production admin users are verified.
- A rollback path exists.

Enforcing too early could lock out the production admin account.

## Recommended Sender Domain

- Sending subdomain: `mail.halalzi.com`
- Sender address: `no-reply@mail.halalzi.com`
- Vercel env value:

```env
EMAIL_FROM="Halalzi ERP <no-reply@mail.halalzi.com>"
```

## Resend DNS Checklist

1. Add `mail.halalzi.com` in Resend Domains.
2. Copy the required DNS records.
3. Add DNS records in the domain provider:
   - SPF/TXT
   - DKIM/CNAME records
   - DMARC/TXT if recommended
4. Wait for Resend verification.
5. Update Vercel `EMAIL_FROM`.
6. Redeploy production.
7. Test password reset email.
8. Test email verification email.

## Enforcement Rollout Plan

1. Verify sender domain.
2. Send verification emails to existing admin users.
3. Confirm production admin is verified.
4. Add login enforcement for `emailVerifiedAt`.
5. Keep an emergency bypass/rollback commit ready.
6. Deploy.
7. Run production smoke.
8. Monitor Vercel logs and support inbox.

## Rollback Plan

If users are unexpectedly blocked:

1. Revert only the login enforcement change.
2. Redeploy.
3. Keep verification tables and tokens intact.
4. Investigate email delivery separately.

## Blockers

- Domain ownership/DNS access is required before the custom sender can be verified.
