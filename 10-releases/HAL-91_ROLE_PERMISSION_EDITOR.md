# HAL-91 Role Permission Editor

## Goal

Allow company admins to update role permissions from the Roles dashboard while preserving tenant isolation and self-lockout protection.

## Files Changed

- `src/lib/rbac/default-permissions.ts`
- `src/lib/rbac/default-roles.ts`
- `src/app/api/roles/route.ts`
- `src/app/api/roles/[id]/permissions/route.ts`
- `src/app/dashboard/roles/page.tsx`
- `src/app/globals.css`
- `OPERATIONS.md`
- `10-releases/HAL-79_CORE_ERP_MVP_RELEASE_CHECKLIST.md`
- `10-releases/HAL-91_ROLE_PERMISSION_EDITOR.md`

## Behavior

- Added `roles.update` permission.
- Company Admin default role receives `roles.update`.
- `GET /api/roles` now returns available permission catalog data.
- `PATCH /api/roles/[id]/permissions` updates one company-scoped role permission set.
- Roles dashboard now shows a permission checklist and save action for admins with `roles.update` or rollout-compatible `roles.assign`.

## Security Notes

- Role updates are scoped to the authenticated user's company.
- Client-supplied `companyId` is ignored.
- Unknown permission ids are rejected.
- If the edited role is assigned to the current user, the API blocks removing:
  - `roles.read`
  - `roles.assign`
  - `roles.update`
- Response returns safe role and permission fields only.

## Verification

- Local lint.
- CI build.
- Vercel deployment.
- Production smoke.

## Blockers

None.
