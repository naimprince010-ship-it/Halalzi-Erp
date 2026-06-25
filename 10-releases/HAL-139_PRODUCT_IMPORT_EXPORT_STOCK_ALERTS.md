# HAL-139 Product Import/Export Polish and Stock Alerts

**Status:** Implemented  
**Parent roadmap:** HAL-139 Product development phase roadmap

## Goal

Improve product data operations and basic stock awareness for pilot customers
without opening a risky bulk-import surface too early.

## Implemented

- Added an actionable stock alert panel on `/dashboard/products`.
- Shows the top active low-stock/out-of-stock products sorted by lowest stock.
- Added quick actions to filter the catalog to low-stock or out-of-stock items.
- Added a per-row stock signal: Healthy, Low stock, Out of stock, or Inactive.
- Added stock signal and low-stock threshold columns to product CSV export.
- Preserved the existing customer-ready template download and product setup
  guidance from HAL-140.

## Guardrails

- No database schema changes.
- No destructive database operations.
- No bulk import write endpoint was added.
- Tenant scoping and RBAC remain server-side.
- Stock ledger behavior remains tied to create/manual adjustment/sales/procurement
  workflows.

## Deferred

Bulk product import remains a separate future issue because it needs:

- dry-run validation,
- row-level errors,
- duplicate SKU handling,
- transaction/rollback rules,
- explicit confirmation before writing,
- opening-balance stock ledger entries for imported stock.

## Verification

- `npm run regression:pilot`: PASS, 31/31 checks
- `npm run lint`: PASS, 0 errors; 2 pre-existing warnings in untracked local scripts
- `npm run build:ci`: PASS

## Outcome

The product catalog is easier to operate during pilot setup because stock
problems are visible in the dashboard and preserved in exported product data.
