# HAL-84 Audit Event Coverage Expansion

## Goal

Expand audit logging from authentication/users/products into the remaining critical ERP mutation flows so company admins can trace important business actions across sales, procurement, and finance.

## Scope

This release keeps the existing audit foundation unchanged and adds best-effort audit writes after successful server-side mutations only.

## Events Covered

Sales order events:

- `sales_order.create`
- `sales_order.update`
- `sales_order.confirm`
- `sales_order.cancel`

Purchase order events:

- `purchase_order.create`
- `purchase_order.update`
- `purchase_order.mark_ordered`
- `purchase_order.receive`
- `purchase_order.cancel`

Finance events:

- `finance.journal.create`
- `finance.journal.post`
- `finance.journal.cancel`
- `finance.receivable.update`
- `finance.payable.update`

## Security Notes

- Audit company scope is derived from the authenticated server-side user context.
- Audit user id is derived from the authenticated server-side session.
- Request-supplied `companyId` is not used for audit scope.
- Audit writes use the existing best-effort helper, so a logging failure does not break the business transaction.
- No passwords, tokens, or secrets are written into audit metadata.

## Verification Plan

- Prisma schema validation.
- Prisma client generation.
- ESLint.
- CI build.
- GitHub Actions check.
- Production smoke test.

## Blockers

None.
