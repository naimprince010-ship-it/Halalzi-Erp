# HAL-149 POS Stock, Finance, and RBAC Regression Hardening

## Purpose

This hardening pass protects the first usable POS workflow from silent regressions while the product continues toward a full cashier-ready POS.

The current POS surface is intentionally narrow:

- Search active tenant products through `/api/pos/products`.
- Build a cart in `/dashboard/pos`.
- Complete a paid sale through `/api/pos/sales`.
- Decrement product stock and write a stock-ledger movement.
- Optionally increase a linked cash, bank, or mobile-money finance account.
- Print a tenant-scoped receipt through `/api/pos/sales/[id]/receipt`.

## Regression Command

Run:

```powershell
npm run regression:pos
```

The command writes evidence to:

- `outputs/HAL-149_pos_stock_finance_rbac_regression.json`
- `../outputs/HAL-149_pos_stock_finance_rbac_regression.json`

## Guardrails Covered

- POS permissions exist in the default RBAC registry.
- Company Admin receives all POS permissions after role sync.
- Cashier can read POS, complete sales, print receipts, and read products.
- Cashier does not receive finance or POS cancellation permissions.
- Sale creation is protected by `pos.create` and runs inside one Prisma transaction.
- Paid amount must cover the POS total.
- Linked payment accounts must be tenant-scoped active cash, bank, or mobile-money accounts.
- Stock decrement uses a guarded `updateMany` with `stockQuantity >= quantity`.
- Each completed item writes a `pos_sale_complete` stock-ledger entry.
- Finance account balance increments only inside the sale transaction.
- Completed sales write an audit log entry.
- POS product search is tenant-scoped, active-only, and bounded to avoid loading the full catalog.
- Receipt printing is protected by `pos.receipts.print`, tenant-scoped, printable, and uncached.
- Dashboard POS UI uses POS-specific bounded APIs, not the full products API.
- Production permission sync remains an authenticated POST-only admin action.

## Non-Scope

This pass does not add new runtime behavior. It adds regression evidence around behavior already introduced by HAL-147 and HAL-148.

Future POS work should still cover:

- receipt/print visual polish,
- cashier session opening and closing,
- cancellation/reversal workflow,
- high-volume indexed search performance,
- authenticated production POS smoke signoff.

## Release Recommendation

If `npm run regression:pos`, `npm run lint`, and `npm run build:ci` pass, this issue is safe to mark Done.
