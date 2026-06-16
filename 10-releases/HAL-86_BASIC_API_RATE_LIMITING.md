# HAL-86 Basic API Rate Limiting

## Goal

Add basic rate limiting for authentication and mutating API endpoints before broader client onboarding.

## Files Changed

- `src/proxy.ts`
- `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md`
- `DEPLOYMENT.md`
- `OPERATIONS.md`
- `10-releases/HAL-86_BASIC_API_RATE_LIMITING.md`

## Behavior

- `/api/auth/login` and `/api/auth/register` are limited to 10 requests per minute per client IP and route.
- Mutating API methods are limited to 120 requests per minute per client IP and route:
  - `POST`
  - `PATCH`
  - `DELETE`
- Read-only `GET` requests are not rate-limited by this MVP guard.
- Rate-limited requests return HTTP `429` with a safe JSON error:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please wait a moment and try again."
  }
}
```

## Security Notes

- The limiter does not trust client input.
- The limiter uses request IP headers provided by the hosting layer.
- This is an in-memory, per-runtime MVP limiter suitable for basic abuse protection.
- For heavier production usage, move rate limiting to durable shared storage such as Redis or a managed edge rate-limit provider.

## Verification

- Local lint.
- CI build.
- GitHub Actions.
- Production smoke.

## Blockers

None.
