# HAL-85 Release Docs Audit Status Refresh

## Goal

Refresh Core ERP release documentation after the audit foundation and expanded event coverage shipped in HAL-82 through HAL-84.

## Files Updated

- `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md`
- `OPERATIONS.md`
- `DEPLOYMENT.md`
- `README.md`
- `10-releases/HAL-85_RELEASE_DOCS_AUDIT_STATUS_REFRESH.md`

## Changes

- Marked basic audit/activity logging as available in the release gate.
- Updated expected production smoke result from 6 checks to 8 checks.
- Added the Audit page to the user-facing release checklist.
- Removed stale "No audit log yet" wording from deployment blockers.
- Replaced broad audit-build pending items with practical follow-up work for audit filters/export.
- Added Audit/activity log to the README Core MVP module list.

## Verification

- Documentation-only change.
- Local lint/build and GitHub CI should still pass.
- Production smoke expectation remains 8/8.

## Blockers

None.
