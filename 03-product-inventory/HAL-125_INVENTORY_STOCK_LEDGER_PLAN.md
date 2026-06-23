# HAL-125 Inventory Stock Ledger Plan

## Goal

Plan a simple MVP stock movement ledger so inventory changes are auditable instead of only storing the current `Product.stockQuantity`.

HAL-103 should keep `Product.stockQuantity` as the fast current balance, but every stock-changing business action should also write an immutable ledger row inside the same transaction.

## Current State

Inventory currently works through direct product balance updates:

- Product creation sets initial `stockQuantity`.
- Product update can change `stockQuantity` when the user has `inventory.adjust`.
- Sales order confirmation decrements product stock.
- Sales order cancellation restores stock for confirmed orders.
- Purchase order receive increments product stock.
- Purchase order cancellation now decrements stock for received orders.

This is functional, but it does not answer:

- Why did stock change?
- Which sales or purchase order caused the change?
- Who performed the action?
- What was the stock balance before and after?
- Was a change a sale, purchase receipt, cancellation reversal, or manual adjustment?

## MVP Decision

Add a `StockLedgerEntry` model that records every stock movement. Keep it small, tenant-scoped, and source-linked.

The ledger is an audit trail, not a warehouse management system. It should not introduce warehouses, bins, batches, serial numbers, valuation layers, landed cost, or manufacturing reservations yet.

## Proposed Schema

Add a movement type enum:

```prisma
enum StockLedgerEntryType {
  opening_balance
  manual_adjustment
  sales_order_confirm
  sales_order_cancel
  purchase_order_receive
  purchase_order_cancel
}
```

Add a source type enum:

```prisma
enum StockLedgerSourceType {
  product
  sales_order
  purchase_order
}
```

Add the ledger model:

```prisma
model StockLedgerEntry {
  id              String                @id @default(cuid())
  companyId       String
  productId       String
  type            StockLedgerEntryType
  sourceType      StockLedgerSourceType
  sourceId        String
  quantityDelta   Int
  balanceBefore   Int
  balanceAfter    Int
  note            String?
  createdByUserId String?
  createdAt       DateTime              @default(now())

  company       Company @relation(fields: [companyId], references: [id])
  product       Product @relation(fields: [productId], references: [id])
  createdByUser User?   @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([productId])
  @@index([createdByUserId])
  @@index([sourceType, sourceId])
  @@index([companyId, productId, createdAt])
  @@index([companyId, sourceType, sourceId])
}
```

Relation additions:

```prisma
model Company {
  stockLedgerEntries StockLedgerEntry[]
}

model Product {
  stockLedgerEntries StockLedgerEntry[]
}

model User {
  createdStockLedgerEntries StockLedgerEntry[]
}
```

## Movement Rules

### Product Creation

When a product is created with `stockQuantity > 0`, create one ledger row:

- `type`: `opening_balance`
- `sourceType`: `product`
- `sourceId`: product id
- `quantityDelta`: initial stock quantity
- `balanceBefore`: `0`
- `balanceAfter`: initial stock quantity
- `createdByUserId`: current user id

If initial stock is `0`, the ledger entry is optional. For a cleaner audit story, HAL-103 should still create an entry with `quantityDelta = 0` only if that does not make product history noisy. Recommended MVP: skip zero opening entries.

### Manual Product Stock Adjustment

When `PATCH /api/products/[id]` changes `stockQuantity`, create one ledger row:

- `type`: `manual_adjustment`
- `sourceType`: `product`
- `sourceId`: product id
- `quantityDelta`: new stock minus old stock
- `balanceBefore`: old stock
- `balanceAfter`: new stock
- `createdByUserId`: current user id
- `note`: optional, if HAL-103 adds an adjustment note field

Only users with `inventory.adjust` can change product stock today. Keep that rule.

### Sales Order Confirmation

When a draft sales order is confirmed:

- Existing behavior decrements stock.
- HAL-103 should create one ledger row per sales order item.
- Ledger write must happen inside the same Prisma transaction as the stock decrement, sales status update, and receivable creation.

Row values:

- `type`: `sales_order_confirm`
- `sourceType`: `sales_order`
- `sourceId`: sales order id
- `quantityDelta`: negative item quantity
- `balanceBefore`: product stock before decrement
- `balanceAfter`: product stock after decrement
- `createdByUserId`: current user id

### Sales Order Cancellation

When a confirmed sales order is cancelled:

- Existing behavior restores stock.
- HAL-103 should create one ledger row per sales order item.
- Ledger write must happen inside the same transaction as stock restoration, receivable cancellation, and sales status update.

Row values:

- `type`: `sales_order_cancel`
- `sourceType`: `sales_order`
- `sourceId`: sales order id
- `quantityDelta`: positive item quantity
- `balanceBefore`: product stock before restoration
- `balanceAfter`: product stock after restoration
- `createdByUserId`: current user id

Draft sales order cancellation should not create stock ledger rows because no stock moved.

### Purchase Order Receive

When an ordered purchase order is received:

- Existing behavior increments stock.
- HAL-103 should create one ledger row per purchase order item.
- Ledger write must happen inside the same Prisma transaction as stock increment, purchase status update, and payable creation.

Row values:

- `type`: `purchase_order_receive`
- `sourceType`: `purchase_order`
- `sourceId`: purchase order id
- `quantityDelta`: positive item quantity
- `balanceBefore`: product stock before receipt
- `balanceAfter`: product stock after receipt
- `createdByUserId`: current user id

### Purchase Order Cancellation

When a received purchase order is cancelled:

- Existing behavior decrements stock.
- HAL-103 should create one ledger row per purchase order item.
- Ledger write must happen inside the same Prisma transaction as stock decrement, payable cancellation, and purchase status update.

Row values:

- `type`: `purchase_order_cancel`
- `sourceType`: `purchase_order`
- `sourceId`: purchase order id
- `quantityDelta`: negative item quantity
- `balanceBefore`: product stock before reversal
- `balanceAfter`: product stock after reversal
- `createdByUserId`: current user id

Draft or ordered purchase order cancellation should not create stock ledger rows because no stock receipt happened.

## Transaction Design

Create a helper module:

```text
src/app/api/products/_stock-ledger.ts
```

Recommended helper functions:

```ts
recordStockLedgerEntry(tx, input)
recordProductOpeningBalance(tx, input)
recordManualStockAdjustment(tx, input)
recordSalesStockMovements(tx, input)
recordPurchaseStockMovements(tx, input)
```

The helper should accept a Prisma transaction client and never open its own transaction. Each business route already owns the transaction boundary.

For each product movement:

1. Read the current product row scoped by `companyId`.
2. Validate stock constraints if the movement is negative.
3. Update `Product.stockQuantity`.
4. Create the ledger row with before/after balances.

For sales confirmation, keep the existing insufficient-stock protection. The ledger should reflect the successful update only.

## Idempotency and Duplicate Prevention

Because the existing state transitions already block repeated confirmation/receive/cancel calls, HAL-103 does not need a hard unique constraint for every ledger source row.

However, the implementation should still be careful:

- Only write ledger rows after the route validates a legal status transition.
- Write ledger rows in the same transaction as the product stock update.
- Do not create stock movements for repeated requests that fail with validation errors.

Optional future constraint if duplicate risk grows:

```prisma
@@unique([companyId, productId, type, sourceType, sourceId])
```

Do not add that unique constraint in HAL-103 if it blocks valid cases like multiple line items for the same product in one order. If uniqueness is needed later, add a `sourceLineId` field first.

## API Plan

Add a tenant-scoped list endpoint:

```text
GET /api/products/[id]/stock-ledger
```

Permission:

- `products.read`

Query parameters:

- `page`
- `pageSize`
- `type`
- `sourceType`

Response shape:

```json
{
  "entries": [
    {
      "id": "...",
      "type": "sales_order_confirm",
      "sourceType": "sales_order",
      "sourceId": "...",
      "quantityDelta": -3,
      "balanceBefore": 20,
      "balanceAfter": 17,
      "note": null,
      "createdAt": "...",
      "createdByUser": {
        "id": "...",
        "name": "...",
        "email": "..."
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1
}
```

Rules:

- Return `403` for cross-company product ids.
- Do not expose sensitive user fields.
- Default order should be newest first.

Optional aggregate endpoint for later:

```text
GET /api/products/stock-ledger
```

Defer this unless HAL-103 remains small after the product-level endpoint.

## UI Plan

HAL-103 can be API-only if time is tight.

MVP UI option:

- Add a "Stock history" section to the product edit/detail modal or product page.
- Show recent entries for that product.
- Columns: date, type, delta, before, after, source, user.

Do not build warehouse-style reports yet.

## Audit Logging

Keep existing business audit events:

- `product.create`
- `product.update`
- `sales_order.confirm`
- `sales_order.cancel`
- `purchase_order.receive`
- `purchase_order.cancel`

Add stock ledger metadata to those existing audit events where useful:

- `stockLedgerEntryIds`
- `stockMovementCount`
- `stockDeltaTotal`

Do not create a separate audit log for every stock ledger row unless the UI needs it. The ledger itself is the detailed stock audit trail.

## Tenant and Security Rules

HAL-103 must follow these rules:

- `companyId` always comes from `companyScope(currentUser)`.
- Never accept request-supplied `companyId`.
- Every product lookup and product update includes `companyId`.
- Every ledger row includes the same authenticated `companyId`.
- Cross-company product/order ids return `403`.
- Only `inventory.adjust` users can manually change stock quantity.
- `products.read` users can view ledger entries for products in their company.
- API responses must not expose password hashes, token hashes, or unrelated company data.

## Runtime Verification Checklist

HAL-103 should produce:

```text
E:\ERP_AI_Project_NEW\outputs\HAL-126_stock_ledger_verification.json
```

Required checks:

1. Product creation with positive opening stock creates an opening ledger entry.
2. Manual product stock adjustment creates a manual adjustment entry with correct delta and before/after balances.
3. User without `inventory.adjust` cannot manually adjust stock.
4. Sales order confirmation creates negative stock ledger entries.
5. Sales order cancellation creates positive reversal ledger entries.
6. Draft sales order cancellation creates no stock ledger entry.
7. Purchase order receive creates positive stock ledger entries.
8. Received purchase order cancellation creates negative reversal ledger entries.
9. Draft/ordered purchase order cancellation creates no stock ledger entry.
10. Product stock balance equals the latest ledger `balanceAfter` after each successful movement.
11. Repeated invalid confirm/receive/cancel attempts do not create duplicate ledger rows.
12. Cross-company product ledger read returns `403`.
13. Request-injected `companyId` is ignored.
14. Product ledger endpoint returns safe user payloads.
15. `npm run lint` passes.
16. `npm run build:ci` passes.

## HAL-103 Acceptance Criteria

HAL-103 is complete when:

1. `StockLedgerEntry` schema and migration are added.
2. Stock ledger helper records movements inside existing business transactions.
3. Product creation and manual adjustment produce correct ledger rows.
4. Sales confirmation/cancellation produce correct stock movement rows.
5. Purchase receive/cancellation produce correct stock movement rows.
6. `Product.stockQuantity` remains the current stock balance.
7. Product-level stock ledger API is tenant-scoped and permission-protected.
8. Cross-company access remains forbidden.
9. Existing sales, procurement, product, finance, and dashboard response shapes stay compatible.
10. Runtime verification artifact proves all required stock movement flows.
11. Lint and CI build pass.

## Out of Scope

- Warehouses and bin locations.
- Batch, lot, serial number tracking.
- FIFO/LIFO/weighted average costing.
- Inventory valuation journal entries.
- Manufacturing/MRP reservations.
- Transfer orders.
- Barcode scanning.
- Stocktake workflows.
- Negative stock policy beyond current sales validation.

## Recommended Next Step

Start HAL-103 by adding the schema and a transaction-client stock ledger helper. Then wire product create/update first, followed by sales and purchase routes.
