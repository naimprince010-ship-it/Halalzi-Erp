# HAL-142 Purchase Approval Workflow Plan

## Goal

Plan the smallest pilot-ready purchase approval workflow for procurement.

This issue is planning only. It does not change schema, API, UI, or production data.

HAL-143 should implement enough approval control for a pilot company to answer four everyday questions:

- Who created the purchase order?
- Has the purchase order been submitted for approval?
- Who approved or rejected it?
- Can the purchase order move to ordering, receiving, stock, and finance only after approval?

The plan should reuse the existing purchase order, vendor, product, stock ledger, payable, audit, tenant, and RBAC foundations instead of introducing a separate procurement engine.

## Current Procurement Baseline

Confirmed from the current codebase:

- Purchase orders already support `draft`, `ordered`, `received`, and `cancelled` statuses.
- Purchase order creation stores vendor snapshots and line item totals.
- Purchase order update is restricted to `draft` records.
- The only current status transition through PATCH is `draft -> ordered`.
- Purchase receiving is restricted to `ordered` records.
- Receiving increments product stock, writes stock ledger entries, creates an open payable, and records audit metadata inside one transaction.
- Purchase cancellation supports `draft`, `ordered`, and `received` records.
- Received purchase cancellation restores stock, writes reversal stock ledger entries, cancels an unpaid linked payable, and blocks cancellation when payable payments exist.
- Purchase permissions currently include `purchases.read`, `purchases.create`, `purchases.update`, `purchases.receive`, and `purchases.cancel`.
- Default admin role has full purchase permissions.
- Default staff role has `purchases.read` only.

Implication:

- Approval must sit between draft creation and ordering.
- Approval must not create stock movement or finance records.
- Existing receive and received-cancel behavior must remain the source of inventory and payable effects.

## MVP Product Positioning

This feature is for small and medium businesses that need a simple "maker/checker" procurement control before goods are ordered or received.

Target workflows:

1. A purchase user creates a draft purchase order.
2. The purchase user submits the draft for approval.
3. An approver approves or rejects the submitted purchase order.
4. Only an approved purchase order can be marked ordered.
5. Only an ordered purchase order can be received.
6. Receiving continues to create stock ledger and payable records.
7. Every approval decision is tenant-scoped, permission-checked, and audit logged.

This is not intended to cover:

- multi-level approval chains
- approval amount thresholds
- department budgets
- vendor blacklists
- purchase requisitions
- RFQ or quote comparison
- email, Slack, or SMS approval notifications
- delegated approvals
- automatic approval by policy
- purchase contract management

## Explicit MVP Decisions

- Extend the existing `PurchaseOrderStatus` enum rather than creating a separate approval model.
- Add `pending_approval`, `approved`, and `rejected` statuses.
- Keep `draft`, `ordered`, `received`, and `cancelled` unchanged for existing records.
- Use audit logs plus approval metadata fields for the first implementation.
- Do not add a separate approval history table in MVP.
- A submitted purchase order cannot be edited through the normal update endpoint.
- A rejected purchase order is terminal for MVP; the user should create a new purchase order or a future duplicate/revise feature can be added later.
- An approved purchase order cannot be edited before ordering in MVP.
- Approval, rejection, and submission create no stock ledger rows.
- Approval, rejection, and submission create no payables.
- Payable creation remains tied to receiving goods.
- `companyId` always comes from authenticated server context, never request body.
- The UI should hide actions the user lacks permission for, but the API must enforce the same rules server-side.

## Proposed Status Flow

```text
draft -> pending_approval -> approved -> ordered -> received
                         \-> rejected

draft -> cancelled
pending_approval -> cancelled
approved -> cancelled
ordered -> cancelled
received -> cancelled, only when existing received-cancel rules pass
```

Rules:

- `draft` can be edited, submitted, or cancelled.
- `pending_approval` can be approved, rejected, or cancelled.
- `approved` can be marked ordered or cancelled.
- `rejected` cannot be ordered, received, or edited.
- `ordered` can be received or cancelled.
- `received` can be cancelled only if the linked payable can be safely cancelled.
- `cancelled` is terminal.

## Proposed Schema Changes For HAL-143

Extend the purchase status enum:

```prisma
enum PurchaseOrderStatus {
  draft
  pending_approval
  approved
  rejected
  ordered
  received
  cancelled
}
```

Add approval metadata to `PurchaseOrder`:

```prisma
submittedAt       DateTime?
submittedByUserId String?
approvedAt        DateTime?
approvedByUserId  String?
rejectedAt        DateTime?
rejectedByUserId  String?
rejectionReason   String?
approvalNote      String?
```

Recommended relations:

```prisma
submittedBy User? @relation("PurchaseOrderSubmittedBy", fields: [submittedByUserId], references: [id], onDelete: SetNull)
approvedBy  User? @relation("PurchaseOrderApprovedBy", fields: [approvedByUserId], references: [id], onDelete: SetNull)
rejectedBy  User? @relation("PurchaseOrderRejectedBy", fields: [rejectedByUserId], references: [id], onDelete: SetNull)
```

Add indexes:

```prisma
@@index([companyId, status])
@@index([submittedByUserId])
@@index([approvedByUserId])
@@index([rejectedByUserId])
```

Migration notes:

- Existing `draft`, `ordered`, `received`, and `cancelled` records should remain unchanged.
- Existing ordered records do not need backfill approval metadata.
- PostgreSQL enum migration should add new values carefully before code that writes them is deployed.
- Local PGlite and production PostgreSQL should both be verified with `prisma db push` or the project migration workflow.

## Proposed Permissions

Add three purchase permissions:

| Permission | Purpose |
|---|---|
| `purchases.submit` | Submit draft purchase orders for approval |
| `purchases.approve` | Approve submitted purchase orders |
| `purchases.reject` | Reject submitted purchase orders |

Default role recommendation:

| Role | Permission Changes |
|---|---|
| Admin | Add submit, approve, and reject |
| Staff | Keep read-only by default |

Future role templates:

| Role | Suggested Permissions |
|---|---|
| Purchase Clerk | read, create, update, submit |
| Purchase Approver | read, approve, reject, cancel |
| Warehouse Receiver | read, receive |

HAL-143 should keep default staff conservative to avoid accidentally granting approval power.

## Proposed API Changes For HAL-143

### Submit Purchase Order

`POST /api/purchase-orders/[id]/submit`

Permission: `purchases.submit`

Allowed transition:

- `draft -> pending_approval`

Validation:

- purchase order must belong to the current tenant
- purchase order must have at least one item
- totals must be valid
- status must be `draft`

Effects:

- set `status = pending_approval`
- set `submittedAt`
- set `submittedByUserId`
- clear stale approval and rejection metadata if present
- write audit action `purchase_order.submit`

### Approve Purchase Order

`POST /api/purchase-orders/[id]/approve`

Permission: `purchases.approve`

Allowed transition:

- `pending_approval -> approved`

Validation:

- purchase order must belong to the current tenant
- status must be `pending_approval`
- optional note length should be bounded

Effects:

- set `status = approved`
- set `approvedAt`
- set `approvedByUserId`
- set optional `approvalNote`
- write audit action `purchase_order.approve`

### Reject Purchase Order

`POST /api/purchase-orders/[id]/reject`

Permission: `purchases.reject`

Allowed transition:

- `pending_approval -> rejected`

Validation:

- purchase order must belong to the current tenant
- status must be `pending_approval`
- rejection reason should be required and bounded

Effects:

- set `status = rejected`
- set `rejectedAt`
- set `rejectedByUserId`
- set `rejectionReason`
- write audit action `purchase_order.reject`

### Update Purchase Order

Existing PATCH `/api/purchase-orders/[id]`

Keep permission: `purchases.update`

Rules:

- normal field and item updates remain allowed only for `draft`
- `draft -> ordered` should no longer be allowed
- add `approved -> ordered` as the only mark-ordered transition
- set `orderedAt` only when moving `approved -> ordered`
- write existing audit action `purchase_order.mark_ordered`

### Receive Purchase Order

Existing `POST /api/purchase-orders/[id]/receive`

Keep permission: `purchases.receive`

Rules:

- status must remain `ordered`
- keep existing stock increment, stock ledger, payable creation, and audit behavior
- do not allow receiving `draft`, `pending_approval`, `approved`, `rejected`, or `cancelled`

### Cancel Purchase Order

Existing `POST /api/purchase-orders/[id]/cancel`

Keep permission: `purchases.cancel`

Rules:

- `draft`, `pending_approval`, `approved`, `rejected`, and `ordered` cancellation creates no stock or finance side effects
- `received` cancellation keeps the existing stock restore and unpaid payable cancellation behavior
- cancellation remains blocked when a received PO has paid payable amount
- `cancelled` remains terminal

### List And Export Purchase Orders

Existing list and export endpoints should include the new statuses in their filters and response formatting:

- `pending_approval`
- `approved`
- `rejected`

## Proposed UI Changes For HAL-143

Procurement dashboard changes:

- Add status badges for pending approval, approved, and rejected.
- Add submit action for editable draft purchase orders when the user has `purchases.submit`.
- Add approve and reject actions for pending purchase orders when the user has approval permissions.
- Add a rejection reason modal or inline form.
- Show submitted, approved, and rejected metadata in the order detail area.
- Change mark ordered action to appear only for approved purchase orders.
- Keep receive action available only for ordered purchase orders.
- Keep cancel action available based on API-supported statuses and permission.
- Update filters and summary counts to include the new statuses.

Recommended UI copy:

- `Draft`
- `Pending approval`
- `Approved`
- `Rejected`
- `Ordered`
- `Received`
- `Cancelled`

## Audit Requirements

Add audit entries for:

- `purchase_order.submit`
- `purchase_order.approve`
- `purchase_order.reject`

Audit metadata should include:

- purchase order id
- purchase order number
- previous status
- next status
- acting user id
- submitted, approved, or rejected timestamp
- rejection reason or approval note when applicable

Existing audit entries should remain:

- `purchase_order.create`
- `purchase_order.update`
- `purchase_order.mark_ordered`
- `purchase_order.receive`
- `purchase_order.cancel`

## Finance And Inventory Safety

Approval workflow must preserve existing cross-module behavior:

- No stock change on submit.
- No stock change on approve.
- No stock change on reject.
- No stock change when approved PO is marked ordered.
- Stock increases only when an ordered PO is received.
- Payable is created only when an ordered PO is received.
- Cancelling a received PO still restores stock and cancels the unpaid payable.
- Cancelling a received PO still fails when the payable has payments.

This keeps HAL-124 procurement-to-finance linkage and HAL-126 inventory stock ledger behavior intact.

## Verification Matrix For HAL-143

Expected artifact:

`E:\ERP_AI_Project_NEW\outputs\HAL-143_purchase_approval_workflow_verification.json`

Required checks:

| Check | Expected Result |
|---|---|
| unauthenticated submit | 401 |
| unauthenticated approve | 401 |
| unauthenticated reject | 401 |
| staff read purchase orders | allowed |
| staff submit without permission | 403 |
| staff approve without permission | 403 |
| staff reject without permission | 403 |
| admin create PO | draft PO created |
| draft update | allowed |
| draft submit | status becomes pending approval |
| pending update | rejected |
| pending mark ordered | rejected |
| pending receive | rejected |
| pending approve | status becomes approved with approver metadata |
| approved mark ordered | status becomes ordered |
| ordered receive | status becomes received; stock ledger and payable created |
| pending reject with reason | status becomes rejected with rejection metadata |
| rejected mark ordered | rejected |
| rejected receive | rejected |
| cancel pending | status becomes cancelled; no stock or payable effect |
| cancel approved | status becomes cancelled; no stock or payable effect |
| cancel ordered | status becomes cancelled; no stock or payable effect |
| cancel received unpaid | stock restored and payable cancelled |
| cancel received paid | blocked |
| cross-tenant submit/approve/reject | forbidden or not found |
| audit events | submit, approve, reject, mark ordered, receive, cancel recorded |
| lint | pass |
| build:ci | pass |

## Implementation Sequence For HAL-143

1. Extend Prisma schema with new statuses, approval metadata, relations, and indexes.
2. Add default permissions for submit, approve, and reject.
3. Add submit, approve, and reject API routes.
4. Update purchase order PATCH rules so only approved POs can be marked ordered.
5. Update list/export status filters and response formatting.
6. Update procurement dashboard status types, badges, filters, buttons, and modals.
7. Add verification script that creates isolated tenant data and writes the HAL-143 artifact.
8. Run `npm run lint`.
9. Run `npm run build:ci`.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Approvals accidentally create stock or payable side effects | Keep stock/payable writes only in receive route |
| Existing ordered records lack approval metadata | Treat current records as legacy already ordered |
| Role templates grant approval too broadly | Add new permissions only to admin by default |
| UI hides action but API allows it | Enforce every transition server-side |
| Rejected PO needs revision | Defer revise/duplicate flow; keep rejected terminal in MVP |
| PostgreSQL enum deployment order fails | Add enum values before writing new statuses and verify build against production-like DB |

## Done Criteria

HAL-142 is done when:

- This plan is committed.
- The plan defines the MVP status flow.
- The plan defines schema, API, UI, RBAC, audit, finance, and inventory implications.
- The plan includes a HAL-143 verification matrix and expected artifact path.
- `npm run lint` passes.
- `npm run build:ci` passes.

HAL-143 can start after this planning issue is closed.
