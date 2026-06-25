# HAL-140 Customer-Ready Product Data Workflow

**Date:** 2026-06-25  
**Status:** Implemented  
**Parent roadmap:** HAL-139 Product development phase roadmap

## Goal

Make the product catalog more usable before customer onboarding resumes.

The immediate product gap was not a missing ERP module. It was that product
setup still felt too manual and too quiet: no visible low-stock signal, no
template for clean product data preparation, and no quick way to filter a
larger catalog.

## Implemented Scope

### Product Dashboard Workflow

- Added visible product summary tiles:
  - active products
  - low-stock products
  - out-of-stock products
  - category count
- Added a setup workflow panel explaining the product data preparation rules.
- Added client-side product search by name, SKU, and category.
- Added status filter: all, active, inactive.
- Added stock signal filter: all, low stock, out of stock.
- Added low-stock row highlighting and inline stock badges.
- Defined the MVP low-stock threshold as active products with 10 or fewer units.

### CSV Template

- Added a protected template download endpoint:
  - `GET /api/exports/products/template`
- The template is guarded by `products.read`.
- The template includes the setup columns:
  - `sku`
  - `name`
  - `category`
  - `salePrice`
  - `costPrice`
  - `openingStockQuantity`
  - `status`
  - `notes`
- The dashboard now exposes a **Download template** action next to the existing
  product CSV export action.

### Existing Safety Preserved

- Product writes remain tenant-scoped through server-side `companyId`.
- SKU uniqueness remains enforced by `@@unique([companyId, sku])`.
- Stock changes after creation still require `inventory.adjust`.
- Stock quantity changes continue to write stock ledger entries.
- Existing CSV escaping and spreadsheet formula-injection protection are reused.

## Deferred On Purpose

### Bulk Product Import

Bulk import is intentionally not implemented in this issue.

Reason: CSV import needs row-level validation, duplicate handling, transaction
rules, stock-ledger behavior, rollback behavior, and a clear UI for partial
failure. That should be a separate issue instead of being squeezed into the
first product workflow polish pass.

Recommended follow-up:

- Add a dry-run import endpoint.
- Validate all rows before writing.
- Report row-level errors without mutating data.
- Only apply rows after an explicit confirmation step.
- Create opening-balance stock ledger entries for imported stock.

## Acceptance Criteria

- Product dashboard exposes customer-ready setup guidance.
- Product template can be downloaded by authorized users.
- Product list can be searched and filtered.
- Low-stock and out-of-stock products are visible without opening each row.
- No destructive database operation is required.
- Lint and production build pass.

## Files Changed

- `src/app/dashboard/products/page.tsx`
- `src/app/api/exports/products/template/route.ts`
- `src/app/globals.css`
- `10-releases/HAL-140_CUSTOMER_READY_PRODUCT_DATA_WORKFLOW.md`
- `outputs/HAL-140_customer_ready_product_data_workflow.json`

## Verification Plan

Run:

```powershell
npm run lint
npm run build:ci
```

Optional browser verification:

- Open `/dashboard/products`.
- Confirm product summary tiles render.
- Confirm **Download template** downloads a CSV.
- Confirm **Export CSV** still works.
- Confirm low-stock products show a Low or Out badge.
- Confirm filters narrow the visible product list.

## Result

HAL-140 improves the visible product setup workflow without opening a risky
bulk-import surface too early. The product catalog is now easier to prepare,
review, and operate before sales/procurement workflows depend on it.

Verification passed:

- `npm run lint` passed with pre-existing warnings in untracked scripts.
- `npm run build:ci` passed.
