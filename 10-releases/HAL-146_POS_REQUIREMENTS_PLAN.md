# HAL-146 POS Requirements Plan

**Status:** Planned  
**Linear issue:** HAL-123  
**Scope:** POS module requirements and implementation sequence

## Decision

Proceed with a small POS MVP plan, but build it as an extension of the current
sales, product, stock, and finance foundations instead of creating a parallel
sales system.

POS should start only after the team accepts this scope:

- fast counter sale,
- stock deduction,
- cash/bank/mobile payment capture,
- printable receipt,
- tenant/RBAC safety,
- regression coverage.

Barcode scanning, offline mode, returns/refunds, hardware cash drawer control,
and full shift reconciliation are not part of the first implementation.

## Current Linear POS Coverage

The project already has 3 concrete POS issues:

| Existing Linear ID | Title | Purpose |
| --- | --- | --- |
| HAL-123 | HAL-146 POS requirements plan | This requirements plan |
| HAL-124 | HAL-147 POS schema and API foundation | POS data model and server-side workflow |
| HAL-125 | HAL-148 POS dashboard UI | Cashier-facing interface |

There is also an older umbrella issue:

| Existing Linear ID | Title | Purpose |
| --- | --- | --- |
| HAL-45 | Future module: POS | Historical future-module placeholder |

For full pilot-ready POS, additional issues should be created after this plan:

1. HAL-144: POS stock, finance, and RBAC regression suite
2. HAL-145: POS receipt and print polish
3. HAL-146: POS cashier role and session hardening
4. HAL-147: POS production smoke and release signoff
5. HAL-148: POS high-volume product search performance hardening

## MVP User Roles

### Cashier

Can:

- open POS screen,
- search active products,
- add products to cart,
- complete a sale,
- print receipt,
- view own recent POS sales.

Cannot:

- edit product master data,
- adjust stock manually,
- edit finance accounts,
- reverse posted finance entries,
- manage roles/users.

### Manager/Admin

Can:

- view all POS sales,
- cancel/void draft or failed POS transactions if implemented,
- review daily sales summary,
- manage products, users, roles, and finance settings.

## Required Permissions

Add POS-specific permissions instead of overloading all sales permissions:

- `pos.read`
- `pos.create`
- `pos.cancel`
- `pos.receipts.print`
- `pos.sessions.read`
- `pos.sessions.manage`

Admin should receive all POS permissions.

Cashier role should receive:

- `dashboard.read`
- `profile.read`
- `profile.update`
- `products.read`
- `pos.read`
- `pos.create`
- `pos.receipts.print`

## MVP Data Model

Recommended new models:

### PosSale

Fields:

- `id`
- `companyId`
- `saleNumber`
- `customerNameSnapshot` optional
- `customerPhoneSnapshot` optional
- `status`: `draft`, `completed`, `cancelled`
- `subtotal`
- `discountAmount`
- `totalAmount`
- `paidAmount`
- `changeAmount`
- `paymentMethod`: `cash`, `card`, `mobile_money`, `bank_transfer`, `other`
- `paymentAccountId` optional
- `salesOrderId` optional
- `receivableId` optional
- `journalEntryId` optional
- `cashierUserId`
- `completedAt`
- `cancelledAt`
- `createdAt`
- `updatedAt`

Indexes:

- unique `(companyId, saleNumber)`
- `(companyId, status)`
- `(companyId, completedAt)`
- `(cashierUserId)`

### PosSaleItem

Fields:

- `id`
- `posSaleId`
- `productId`
- `productNameSnapshot`
- `productSkuSnapshot`
- `quantity`
- `unitPrice`
- `lineTotal`
- `createdAt`

Indexes:

- `(posSaleId)`
- `(productId)`

### PosSession

First implementation can defer this if needed. If included:

- `id`
- `companyId`
- `sessionNumber`
- `cashierUserId`
- `status`: `open`, `closed`
- `openingCash`
- `closingCash`
- `expectedCash`
- `openedAt`
- `closedAt`

For HAL-147, session can be optional; HAL follow-up should harden it.

## Sale Workflow

First POS sale should be atomic:

1. Cashier opens POS page.
2. UI loads active products only.
3. Cashier adds products and quantities to cart.
4. API validates:
   - tenant scope,
   - active product status,
   - enough stock,
   - non-negative discount,
   - payment method,
   - paid amount covers total for immediate sale.
5. In one transaction:
   - create `PosSale`,
   - create `PosSaleItem` rows,
   - decrement product stock,
   - write stock ledger entries,
   - create finance impact.
6. Return completed sale and receipt payload.

## Stock Linkage

Add stock ledger enum values:

- `pos_sale_complete`
- `pos_sale_cancel`

Add source type:

- `pos_sale`

On completed sale:

- decrement each product stock,
- write one stock ledger row per item,
- use authenticated user as `createdByUserId`.

Cancellation should be deferred unless required. If included:

- only manager/admin can cancel,
- only unpaid or same-day sale cancellation allowed in MVP,
- restore stock,
- reverse finance impact.

## High-Volume Product Search

POS must not load the full product catalog into the browser.

For small demos, loading active products may feel fine. For real retail clients
with 100,000+ products, that approach will not return millisecond-level results
and will create slow UI, high memory usage, and heavy API responses.

HAL-147 should design POS product lookup as a server-side search endpoint:

- `GET /api/pos/products?search=&limit=20`
- active products only by default,
- tenant-scoped query,
- indexed SKU/name/category search,
- exact SKU match first,
- limited response fields,
- maximum page size guard.

HAL-148 dashboard UI should:

- debounce search input,
- request only top matches,
- never fetch all products at once,
- support barcode/SKU-style exact lookup later.

Performance target:

- normal catalog: search response should feel instant,
- 100k+ products: indexed search target should be under 200ms on normal
  deployment conditions, with measurement documented in HAL-148 follow-up.

True millisecond results with 100k+ products require the above design. Without
indexed, paginated server-side search, POS will not be retail-grade.

## Finance Linkage

Recommended MVP:

- A POS sale is normally paid immediately.
- Do not create an open receivable unless paid amount is less than total and
  credit sale is explicitly allowed later.
- If payment account is selected:
  - increase cash/bank/mobile account balance,
  - create posted journal entry.

Journal source type should add:

- `pos_sale`

If journal source enum expansion is too large for HAL-147, the fallback is to
link finance through existing receivable payment patterns in a follow-up.

## Receipt/Print Requirements

MVP receipt must include:

- company name,
- sale number,
- date/time,
- cashier name,
- item name/SKU,
- quantity,
- unit price,
- line total,
- subtotal,
- discount,
- total,
- paid amount,
- change amount,
- payment method.

Use browser print/HTML receipt first. Dedicated PDF generation can wait.

## API Plan

HAL-147 should add:

- `GET /api/pos/sales`
- `POST /api/pos/sales`
- `GET /api/pos/sales/[id]`
- `POST /api/pos/sales/[id]/cancel` optional/deferred
- `GET /api/pos/sales/[id]/receipt`
- `GET /api/pos/products`
- `GET /api/pos/summary`

All routes must use:

- server-side session auth,
- `companyScope(currentUser)`,
- POS permissions,
- no request-supplied `companyId`,
- safe response selects,
- audit logs for completed/cancelled sales.

## UI Plan

HAL-148 should add `/dashboard/pos`:

- product search by name/SKU,
- active products only,
- cart panel,
- quantity stepper,
- discount input,
- payment method selector,
- paid amount and change calculation,
- complete sale button,
- receipt print action,
- recent sales list,
- empty/loading/error states.

Use a dense cashier tool layout, not a marketing layout.

## Out Of Scope For First POS

- barcode scanner hardware integration,
- offline mode,
- returns/refunds,
- multi-branch inventory,
- cashier drawer hardware,
- tax/VAT automation,
- loyalty points,
- customer account credit sales,
- advanced shift reconciliation.

## Implementation Sequence

1. HAL-147 POS schema and API foundation
2. HAL-148 POS dashboard UI
3. POS stock, finance, and RBAC regression suite
4. POS receipt/print polish
5. POS cashier role and session hardening
6. POS production smoke and release signoff
7. POS high-volume product search performance hardening

## Acceptance Criteria For POS MVP

- Cashier can complete a paid POS sale.
- Stock is deducted atomically.
- Stock ledger records POS movement.
- Finance impact is recorded or clearly deferred with a linked follow-up.
- Receipt can be printed.
- Cashier permissions are scoped.
- Tenant isolation is verified.
- Regression/lint/build pass.

## Recommendation

Create the missing follow-up Linear issues now so the POS path is trackable.
Then implement HAL-147 before any UI work.
