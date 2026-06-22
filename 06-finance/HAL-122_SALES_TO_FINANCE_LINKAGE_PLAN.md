# HAL-122 Sales to Finance Accounting Linkage Plan

## Goal

Define a safe MVP flow for linking confirmed sales orders to finance records without turning the product into a full accounting system too early.

HAL-100 should implement the smallest reliable linkage:

- Confirmed sales orders create one receivable.
- Optional revenue journal creation is supported only when the company has explicit finance accounts configured.
- Cancelled confirmed sales orders close or reverse the linked finance records in a predictable way.
- All finance records stay tenant-scoped from the authenticated server session.

## Current State

Sales orders already support:

- Draft creation through `POST /api/sales-orders`.
- Confirmation through `POST /api/sales-orders/[id]/confirm`.
- Cancellation through `POST /api/sales-orders/[id]/cancel`.
- Server-side tenant scoping through `companyScope(currentUser)`.
- Stock decrement on confirmation and stock restoration on confirmed-order cancellation.
- Audit events for `sales_order.create`, `sales_order.confirm`, and `sales_order.cancel`.

Finance already supports:

- Receivables with `salesOrderId`, customer snapshot, amount, paid amount, status, and due date.
- Journal entries with `sourceType = sales_order` and `sourceId`.
- Finance account balances updated when journal entries are posted.
- Finance period close checks for posting/payment dates.
- AR aging reports from open/partial receivables.

## MVP Decision

### 1. Confirmed Sales Order Creates Receivable

When a draft sales order is confirmed, HAL-100 should create a receivable in the same database transaction as the sales confirmation and stock decrement.

Receivable fields:

| Field | Value |
|---|---|
| `companyId` | Authenticated user's company id from server context |
| `salesOrderId` | Confirmed sales order id |
| `customerNameSnapshot` | Sales order `customerName` |
| `amount` | Sales order `totalAmount` |
| `paidAmount` | `0` |
| `status` | `open` |
| `dueDate` | `null` for MVP unless a sales due-date field is added later |

This is the required MVP accounting linkage because it makes AR aging, receivables list, and finance dashboard totals reflect sales activity.

### 2. Revenue Journal Entry Is Deferred by Default

HAL-100 should not require automatic revenue journals for every sales confirmation unless the required finance accounts are configured.

Reason:

- The current MVP does not have a company-level finance settings table for default AR/revenue accounts.
- Guessing accounts from account type would be risky and could post to the wrong ledger.
- Receivables already deliver the practical MVP value for sales-to-finance visibility.

Recommended implementation path:

- Implement receivable creation first.
- Add a small internal helper shape for future journal creation.
- Only create a posted journal entry if HAL-100 also adds explicit company finance settings for:
  - Accounts receivable asset account
  - Sales revenue income account

If those settings are not present, confirmation should still succeed and create the receivable.

### 3. Optional Journal Shape

If automatic revenue journals are enabled later, create one posted journal entry on confirmation:

| Line | Account | Debit | Credit |
|---|---|---:|---:|
| 1 | Accounts receivable asset | Sales order total | 0 |
| 2 | Sales revenue income | 0 | Sales order total |

Journal entry fields:

- `companyId`: authenticated company id
- `sourceType`: `sales_order`
- `sourceId`: sales order id
- `description`: `Revenue from sales order {orderNumber}`
- `status`: `posted`
- `postedAt`: confirmation time

Posting must respect closed finance periods by checking the confirmation date against `FinancePeriod`.

## Cancellation Rules

### Draft Order Cancellation

If a draft sales order is cancelled:

- No receivable exists.
- No finance action is required.
- Existing stock behavior remains unchanged.

### Confirmed Order Cancellation With No Payment

If a confirmed sales order is cancelled and its receivable has `paidAmount = 0`:

- Restore stock using the existing sales cancellation behavior.
- Mark linked receivable as `cancelled`.
- Keep `amount` and snapshots unchanged for audit/history.
- Add audit metadata showing the linked receivable id.

### Confirmed Order Cancellation With Payment

If a confirmed sales order has a linked receivable with `paidAmount > 0`, HAL-100 should block cancellation for MVP.

Return a validation error:

```text
Cannot cancel a confirmed sales order after receivable payments have been recorded.
```

Reason:

- Refunds, credit notes, and payment reversals are real accounting workflows.
- They should be designed separately instead of hidden inside MVP cancellation.

### Confirmed Order Cancellation With Posted Journal

If optional posted revenue journals are implemented, cancellation should create a reversing journal entry instead of mutating the original journal.

For HAL-100 MVP, if journal automation is not implemented, this section remains a future rule.

## Duplicate Prevention and Idempotency

HAL-100 must prevent duplicate finance records if confirmation is retried or concurrent requests hit the same order.

Required schema changes:

```prisma
model Receivable {
  // existing fields...
  salesOrderId String? @unique
}
```

Recommended journal constraint if automatic journals are implemented:

```prisma
model JournalEntry {
  // existing fields...
  @@unique([companyId, sourceType, sourceId])
}
```

Implementation rules:

- Run sales confirmation, stock decrement, receivable creation, and optional journal creation inside one Prisma transaction.
- Re-read the sales order inside the transaction with `companyId`.
- Only allow transition from `draft` to `confirmed`.
- Create the receivable after the status transition is known to be valid.
- If a unique constraint conflict is hit for the receivable, return a safe validation/conflict response or re-read the existing receivable and keep the operation idempotent only when the order is already confirmed.

## Tenant Scoping Rules

All linkage code must derive `companyId` from:

```ts
const currentUser = await requirePermission("sales.confirm");
const scope = companyScope(currentUser);
```

Rules:

- Never accept request-supplied `companyId`.
- Every sales order lookup must include `companyId: scope.companyId`.
- Every product stock update must include `companyId: scope.companyId`.
- Every receivable and journal entry must use `scope.companyId`.
- Cross-company sales order ids must return `403`, matching the existing route pattern.

## Permission Impact

No new user-facing permission is required for the core receivable linkage.

Rationale:

- The user is already allowed to confirm the sales order through `sales.confirm`.
- Receivable creation is a system side effect of that business action.
- Requiring `finance.receivables.update` or `finance.journals.create` would make sales confirmation fail for valid sales users.

If automatic journal creation becomes configurable later, it should still run as a system side effect of `sales.confirm`, not as a separate user action.

## Audit Events

Keep the existing `sales_order.confirm` event and enrich metadata:

- `orderNumber`
- `status`
- `totalAmount`
- `receivableId`
- `financeLinkageCreated: true`
- `journalEntryId` if optional journal creation is enabled

Add a finance-side audit event only if it adds useful traceability:

- `finance.receivable.create_from_sales_order`

Recommended MVP approach:

- Add the enriched sales audit metadata first.
- Add the finance audit event only if the code remains simple and does not duplicate noisy audit entries.

Cancellation audit metadata should include:

- `orderNumber`
- `status`
- `totalAmount`
- `receivableId`
- `receivableStatus`
- `financeCancellationAction`: `receivable_cancelled` or `blocked_due_to_payment`

## Required Implementation Changes for HAL-100

### Prisma

1. Add a unique constraint for `Receivable.salesOrderId`.
2. Optionally add a unique source constraint for `JournalEntry` if automatic journals are included.
3. Regenerate Prisma client.
4. Add migration using the repo's migration workflow.

### Server Helpers

Create a small helper module near the sales or finance API code, for example:

```text
src/app/api/sales-orders/_finance-linkage.ts
```

Helper responsibilities:

- `createReceivableForConfirmedSalesOrder(tx, companyId, salesOrder)`
- `cancelReceivableForSalesOrder(tx, companyId, salesOrderId)`
- Optional future `createRevenueJournalForSalesOrder(tx, companyId, salesOrder, accountSettings)`

Keep the helper transaction-client based so sales confirmation can call it inside the existing transaction.

### Sales Confirm Route

Update `POST /api/sales-orders/[id]/confirm`:

1. Keep existing permission and tenant scope.
2. Keep existing stock validation and stock decrement.
3. Update sales order to `confirmed`.
4. Create linked receivable in the same transaction.
5. Return the same sales order payload shape.
6. Include receivable id in audit metadata.

### Sales Cancel Route

Update `POST /api/sales-orders/[id]/cancel`:

1. Keep existing permission and tenant scope.
2. If order is `draft`, cancel as today.
3. If order is `confirmed`, find linked receivable by `salesOrderId` and `companyId`.
4. If receivable has payments, block cancellation.
5. If receivable is unpaid, mark it `cancelled`.
6. Restore stock and cancel order in the same transaction.
7. Include receivable status in audit metadata.

### Finance UI

No new UI is required for HAL-100.

Existing finance pages should naturally show:

- New receivable in receivables list.
- New amount in AR aging report.
- Updated dashboard receivable totals.

Optional later UI:

- Add a sales order detail link to its receivable.
- Add a receivable detail link back to the sales order.

## Runtime and Security Verification Checklist

HAL-100 should include a focused runtime artifact covering:

1. Unauthenticated `POST /api/sales-orders/[id]/confirm` returns `401`.
2. Staff without `sales.confirm` receives `403`.
3. Admin confirms draft sales order and receives `200`.
4. Confirmed sales order creates exactly one receivable.
5. Receivable has correct `companyId`, `salesOrderId`, customer snapshot, amount, `paidAmount = 0`, and `status = open`.
6. Repeating confirm on the same order does not create a duplicate receivable.
7. Cross-company user cannot confirm or read another company's sales order or receivable.
8. Request-injected `companyId` is ignored.
9. Confirmed order cancellation with unpaid receivable marks receivable `cancelled` and restores stock.
10. Confirmed order cancellation with a recorded receivable payment is blocked.
11. AR aging report includes the new receivable.
12. API responses do not expose password hashes, token hashes, or unrelated company data.
13. `npm run lint` passes.
14. `npm run build:ci` passes.

## HAL-100 Acceptance Criteria

HAL-100 is complete when:

1. Confirming a sales order creates one tenant-scoped receivable.
2. Receivable creation happens in the same transaction as sales confirmation and stock decrement.
3. Duplicate receivables are prevented at the database level.
4. Sales cancellation handles unpaid linked receivables safely.
5. Sales cancellation is blocked when receivable payments exist.
6. Tenant scope comes only from authenticated server context.
7. Cross-company access remains forbidden.
8. Existing sales response shapes remain compatible with the dashboard UI.
9. Audit logs include enough metadata to trace the sales-to-finance linkage.
10. Runtime verification proves receivable creation, cancellation behavior, duplicate prevention, tenant isolation, and AR aging visibility.
11. Lint and CI build pass.

## Out of Scope

- Tax automation.
- Multi-currency.
- Complex invoice numbering.
- Payment gateway integration.
- Refunds and credit notes.
- Automatic journal posting without explicit company finance account settings.
- Full accounting close workflow beyond existing finance period checks.

## Recommended Next Step

Start HAL-100 with the receivable-only linkage first. Treat revenue journal automation as a small follow-up only after company default finance accounts are explicitly configured.
