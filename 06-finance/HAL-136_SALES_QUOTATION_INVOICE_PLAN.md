# HAL-136 Sales Quotation and Invoice Plan

## Goal

Define the smallest pilot-ready quotation and invoice workflow for Halalzi ERP after Core ERP MVP signoff.

This issue is planning only. It does not change schema, API, UI, or production data.

The goal is to extend the existing sales order and receivable foundation without turning the product into a full accounting suite too early.

## Current Sales and Finance Baseline

Confirmed current baseline from code and docs:

- Sales orders already exist with `draft`, `confirmed`, `cancelled`, and `completed` states.
- Sales orders already support create, update, read, confirm, and cancel flows.
- Confirming a sales order already:
  - validates tenant-scoped stock
  - decrements stock
  - records stock ledger entries
  - creates one linked receivable
  - records audit events
- Cancelling a confirmed sales order already:
  - restores stock
  - cancels the linked receivable when unpaid
  - blocks cancellation after receivable payments exist
- Receivables already support list/update and flow into AR aging.
- Finance dashboard already surfaces accounts, journal entries, receivables, and payables.
- Current roadmap already identifies quotation/invoice lifecycle as the next product priority.

Implication:

- The MVP quotation/invoice feature should build on top of the existing sales-order-to-receivable linkage.
- The plan should avoid redesigning finance fundamentals that already work.

## MVP Product Positioning

This workflow is for pilot customers who need a practical commercial sales document flow:

1. Prepare quotation for a customer.
2. Mark whether the quote was sent, accepted, rejected, or expired.
3. Convert accepted quote into a sales order.
4. Confirm sales order to trigger stock movement.
5. Create an invoice from confirmed or completed sales order.
6. Link invoice to one receivable for payment tracking.

This is not intended to cover:

- full tax compliance engines
- payment collection automation
- multi-currency billing
- subscription billing
- complex revenue recognition

## Explicit MVP Decisions

These decisions are locked for HAL-136 and should guide HAL-137 implementation.

- No tax engine in first version.
- No multi-currency in first version.
- No payment gateway.
- Invoice creates or links one receivable once.
- Quote acceptance does not affect stock.
- Stock moves only when sales order is confirmed.
- `companyId` always comes from authenticated session scope, never request body.
- Quote and invoice totals use the same simple subtotal/discount/total model already used by sales orders.
- Invoice generation is a business workflow document, not a replacement for full general-ledger design.

## MVP User Stories

### Sales/Admin User Stories

- As a sales user, I can create a draft quotation with customer details and line items.
- As a sales user, I can update a draft quotation before sending it.
- As a sales user, I can mark a quotation as sent.
- As a sales user, I can mark a quotation as accepted, rejected, or expired.
- As a sales user, I can convert an accepted quotation into a draft sales order.
- As a sales user, I can generate an invoice from a confirmed or completed sales order.
- As a sales user, I can view invoice status and linked receivable state.

### Finance User Stories

- As a finance user, I can view invoices and their linked receivable state.
- As a finance user, I can confirm whether a receivable was created from an invoice.
- As a finance user, I can use AR aging without learning a second collection workflow.

### Management User Stories

- As an admin, I can audit who created, sent, accepted, rejected, expired, converted, or invoiced a sales document.
- As an admin, I can see quotation and invoice counts on sales or finance dashboards.

## Proposed MVP Workflow

### Workflow Overview

1. Quotation draft
2. Quotation sent
3. Quotation accepted or rejected or expired
4. Accepted quotation converted to sales order draft
5. Sales order confirmed or completed
6. Invoice created from sales order
7. Invoice linked to one receivable

### Detailed State Flow

#### Quotation Lifecycle

`draft -> sent -> accepted`

Alternative terminal branches:

- `draft -> rejected`
- `sent -> rejected`
- `draft -> expired`
- `sent -> expired`

Rules:

- Only `draft` quotations are fully editable.
- `sent` quotations can still be revised only by moving back to `draft` in a later phase; for MVP, keep `sent` read-only except for final disposition changes.
- `accepted`, `rejected`, and `expired` are terminal for MVP.

#### Sales Conversion

- Only `accepted` quotations can be converted to a sales order.
- Conversion creates a new draft sales order using quotation snapshots.
- Conversion does not decrement stock.
- Conversion does not create finance entries.

#### Invoice Lifecycle

Recommended MVP states:

`draft -> issued -> paid`

Additional branch:

- `draft -> cancelled`
- `issued -> partial`
- `issued -> cancelled`

Rules:

- Invoice may be created only from a `confirmed` or `completed` sales order.
- Invoice issue creates or links exactly one receivable.
- Invoice payment state should be derived from receivable settlement when practical.
- Invoice cancellation should cancel the linked receivable only when no payments exist.

## Required MVP Fields

### Quotation

Minimum proposed fields:

- `id`
- `companyId`
- `quoteNumber`
- `salesOrderId` nullable, for traceability after conversion
- `customerName`
- `customerPhone` nullable
- `customerEmail` nullable
- `customerAddress` nullable
- `status`
- `validUntil` nullable but recommended
- `subtotal`
- `discountAmount`
- `totalAmount`
- `notes` nullable
- `sentAt` nullable
- `acceptedAt` nullable
- `rejectedAt` nullable
- `expiredAt` nullable
- `createdAt`
- `updatedAt`

### Quotation Items

- `id`
- `quotationId`
- `productId`
- `productNameSnapshot`
- `productSkuSnapshot`
- `quantity`
- `unitPrice`
- `lineTotal`
- `createdAt`

### Invoice

Minimum proposed fields:

- `id`
- `companyId`
- `invoiceNumber`
- `salesOrderId`
- `quotationId` nullable
- `receivableId` nullable until issue step if draft invoices are allowed
- `customerNameSnapshot`
- `customerPhoneSnapshot` nullable
- `customerEmailSnapshot` nullable
- `customerAddressSnapshot` nullable
- `status`
- `invoiceDate`
- `dueDate` nullable
- `subtotal`
- `discountAmount`
- `totalAmount`
- `notes` nullable
- `issuedAt` nullable
- `cancelledAt` nullable
- `createdAt`
- `updatedAt`

### Invoice Items

- `id`
- `invoiceId`
- `productId`
- `productNameSnapshot`
- `productSkuSnapshot`
- `quantity`
- `unitPrice`
- `lineTotal`
- `createdAt`

## Proposed Status Enums

### Quotation Status

- `draft`
- `sent`
- `accepted`
- `rejected`
- `expired`

### Invoice Status

- `draft`
- `issued`
- `partial`
- `paid`
- `cancelled`

Rationale:

- These statuses are small enough for MVP.
- They align with the existing `SettlementStatus` mindset already used by receivables.
- They avoid introducing approval, refund, or credit-note complexity yet.

## Numbering Rules

Keep numbering human-readable and tenant-unique.

### Quotation Number

Suggested format:

- `QT-YYYYMMDD-XXXX`

Rules:

- Unique per company.
- Generated server-side.
- Never editable by request body in MVP.

### Invoice Number

Suggested format:

- `INV-YYYYMMDD-XXXX`

Rules:

- Unique per company.
- Generated server-side.
- Never editable by request body in MVP.

### Relationship to Sales Order Number

- Keep quotation, sales order, and invoice numbers separate.
- Store cross-links by ids, not by parsing document numbers.

## Tenant and RBAC Rules

### Tenant Rules

- Every quotation, invoice, sales order lookup, receivable link, and document mutation must scope by authenticated `companyId`.
- Never accept request-supplied `companyId`.
- Cross-company ids must return `403` just like current sales and finance routes.

### RBAC Rules

Recommended MVP permissions:

- `sales.quotations.read`
- `sales.quotations.create`
- `sales.quotations.update`
- `sales.quotations.send`
- `sales.quotations.accept`
- `sales.quotations.reject`
- `sales.quotations.expire`
- `sales.quotations.convert`
- `sales.invoices.read`
- `sales.invoices.create`
- `sales.invoices.update`
- `sales.invoices.issue`
- `sales.invoices.cancel`

Permission simplification option for MVP:

- If the team wants fewer permissions initially, quotation and invoice actions can temporarily map to broader `sales.*` or existing sales permissions.
- However, the plan should still define separate permission keys so HAL-137 can add them cleanly when ready.

## Audit Events

Required audit events:

- `sales_quote.create`
- `sales_quote.update`
- `sales_quote.send`
- `sales_quote.accept`
- `sales_quote.reject`
- `sales_quote.expire`
- `sales_quote.convert_to_sales_order`
- `sales_invoice.create`
- `sales_invoice.issue`
- `sales_invoice.cancel`

Recommended audit metadata:

- document number
- status
- total amount
- linked quotation id
- linked sales order id
- linked invoice id
- linked receivable id
- finance linkage created boolean

## Finance Linkage Rules

### Quotation

- Quotation creation, sending, acceptance, rejection, and expiry do not create finance records.
- Quote acceptance is commercial intent only.

### Sales Order

- Existing rule remains: stock and receivable logic are tied to sales order confirmation.
- HAL-137 must decide whether invoice creation reuses the existing sales-order-created receivable or shifts receivable creation to invoice issue.

### Recommended MVP Finance Decision

To stay small and avoid breaking working finance behavior:

- Keep the existing sales-order-confirmation receivable creation for backward compatibility in current system behavior.
- Introduce invoice as the customer-facing billing document linked to the existing receivable.
- For new invoice flows, invoice issue should create a receivable only if one does not already exist for that sales order.
- A sales order must never end up with multiple open receivables created by duplicate invoice actions.

Implementation implication:

- Use a one-to-one linkage rule between invoice and receivable.
- Reuse the existing unique-style mindset already present for `Receivable.salesOrderId`.

### Future Tightening Option

After pilots, the team may decide to move receivable creation from sales order confirm to invoice issue.

That is explicitly out of HAL-137 unless the migration path stays simple and backward-compatible.

## Stock Impact Rules

- Quote creation: no stock impact.
- Quote send/accept/reject/expire: no stock impact.
- Quote-to-order conversion: no stock impact.
- Sales order confirmation: stock moves exactly as it does today.
- Invoice creation or issue: no additional stock movement.
- Invoice cancellation: no stock movement by itself.

Reason:

- Inventory should stay tied to operational order confirmation, not commercial quote or billing paperwork.

## PDF and Print Needs

MVP print needs should stay basic and customer-facing.

### Quotation PDF

- company name
- quote number
- customer details
- item table
- subtotal, discount, total
- notes
- validity date if present

### Invoice PDF

- company name
- invoice number
- sales order reference
- customer details
- item table
- subtotal, discount, total
- due date if present
- payment status summary from receivable

MVP constraints:

- simple browser print or downloadable PDF layout is enough
- no branding builder in first version
- no tax line calculations in first version

## API Route Plan

Recommended route family:

### Quotations

- `GET /api/sales-quotations`
- `POST /api/sales-quotations`
- `GET /api/sales-quotations/[id]`
- `PATCH /api/sales-quotations/[id]`
- `POST /api/sales-quotations/[id]/send`
- `POST /api/sales-quotations/[id]/accept`
- `POST /api/sales-quotations/[id]/reject`
- `POST /api/sales-quotations/[id]/expire`
- `POST /api/sales-quotations/[id]/convert`

### Invoices

- `GET /api/sales-invoices`
- `POST /api/sales-invoices`
- `GET /api/sales-invoices/[id]`
- `PATCH /api/sales-invoices/[id]`
- `POST /api/sales-invoices/[id]/issue`
- `POST /api/sales-invoices/[id]/cancel`

### Reports and Exports

Optional in HAL-137 only if small:

- `GET /api/exports/sales-quotations`
- `GET /api/exports/sales-invoices`

Route design rules:

- Mirror current sales-order route patterns.
- Reuse shared payload validation helpers where possible.
- Prefer explicit action routes over magic status updates.

## UI and Dashboard Plan

### Sales Dashboard

Add:

- quotations list and filters
- quotation create/edit form
- quotation status actions
- invoice list and filters
- invoice create or issue action from sales order

### Finance Dashboard

Add:

- invoice summary panel
- quick visibility into invoice to receivable linkage
- invoice aging or issued-unpaid snapshot only if it reuses receivable data with minimal duplication

### Navigation Approach

MVP-small options:

1. Add quotation and invoice sections inside existing sales dashboard first.
2. Avoid creating a separate complex billing workspace yet.

Recommended choice:

- Keep quotation and invoice UI under Sales first.
- Surface only summary and receivable linkage inside Finance.

## Migration and Schema Plan

HAL-136 is planning only, but HAL-137 should likely add:

### New Enums

- `QuotationStatus`
- `InvoiceStatus`
- possibly extend `JournalSourceType` later only if invoice-driven journals are added

### New Models

- `SalesQuotation`
- `SalesQuotationItem`
- `SalesInvoice`
- `SalesInvoiceItem`

### Suggested Relations

- quotation belongs to company
- quotation has many quotation items
- quotation may reference resulting sales order
- invoice belongs to company
- invoice references one sales order
- invoice may reference original quotation
- invoice may reference one receivable

### Constraints

- `@@unique([companyId, quoteNumber])`
- `@@unique([companyId, invoiceNumber])`
- one invoice per sales order for MVP is recommended unless partial invoicing is explicitly required later

Recommended MVP simplicity decision:

- one invoice per sales order
- no partial invoicing in first version

This keeps linkage, PDF logic, receivable matching, and dashboard summaries much simpler.

## Acceptance Criteria for HAL-137 Implementation

HAL-137 should be considered complete only when all of these are true:

1. Quotations can be created, listed, read, and updated in draft state.
2. Quotations can move through `sent`, `accepted`, `rejected`, and `expired` states with validation.
3. Accepted quotations can convert into draft sales orders without stock movement.
4. Confirmed or completed sales orders can create one invoice.
5. Invoice issue creates or links exactly one receivable, with no duplicates.
6. Invoice actions remain tenant-scoped from session-derived `companyId` only.
7. Audit events exist for quotation and invoice lifecycle actions.
8. Sales dashboard exposes quotation and invoice lists and actions.
9. Finance dashboard shows invoice-to-receivable visibility without duplicating settlement logic.
10. Print or PDF output exists for quotation and invoice in a basic customer-safe format.
11. No tax engine, multi-currency, payment gateway, or complex accounting rules are introduced.
12. Existing sales order, stock ledger, receivable, and report behavior does not regress.

## Out of Scope

The following are explicitly out of HAL-136 and should not be pulled into HAL-137 unless separately planned:

- tax engine or VAT/GST rules
- multi-currency pricing or settlement
- payment gateway or online payment collection
- customer portal
- partial invoicing across multiple invoices per sales order
- credit notes, refunds, or refund journals
- automated journal posting from invoice without explicit finance settings design
- recurring invoices or subscriptions
- approval workflow for quotations or invoices
- complex discount policies beyond current order-level discount amount
- shipment or delivery-note workflow

## Risks and Tradeoffs

### 1. Existing Receivable Timing vs New Invoice Timing

Risk:

- Current system creates receivables on sales order confirmation, not invoice issue.

Tradeoff:

- Keeping current behavior avoids regressions and keeps pilot delivery fast.
- But it means invoice may sometimes document an already-existing receivable rather than creating the first finance record.

Recommendation:

- Preserve current receivable timing for MVP and document invoice as the visible billing document linked to that receivable.

### 2. One Invoice Per Sales Order

Risk:

- Some real businesses need staged or partial invoicing.

Tradeoff:

- Supporting partial invoicing now multiplies complexity across stock, receivables, numbering, UI, and audit logic.

Recommendation:

- Restrict MVP to one invoice per sales order.

### 3. Permission Granularity

Risk:

- Adding too many new permissions can slow pilot rollout.

Tradeoff:

- Reusing broad sales permissions is faster short-term.
- Separate keys are cleaner long-term.

Recommendation:

- Define separate keys in plan, but allow initial role mapping to existing sales personas.

### 4. Print Expectations

Risk:

- Pilot customers may expect polished branded PDFs immediately.

Tradeoff:

- A minimal print layout can ship fast.
- A full document designer will delay useful MVP delivery.

Recommendation:

- Ship basic printable quotation and invoice documents first.

## Suggested Implementation Sequence

Recommended HAL sequence after this planning issue:

1. Add schema models and enums for quotations and invoices.
2. Add shared validation/helpers mirroring current sales-order patterns.
3. Implement quotation list/create/read/update routes.
4. Implement quotation lifecycle action routes.
5. Implement quote-to-sales-order conversion.
6. Implement invoice schema and basic routes.
7. Implement invoice issue/cancel logic with receivable linkage guardrails.
8. Add sales dashboard quotation and invoice UI.
9. Add finance dashboard invoice linkage visibility.
10. Add basic print/PDF output.
11. Run regression checks against sales order confirmation, receivables, AR aging, and stock ledger.

## Recommended File Placement and Follow-Up

This plan is placed under `06-finance/` because the most important design constraint is safe invoice-to-receivable linkage, even though the primary UI will live under Sales.

Suggested next issue:

- HAL-137 Sales quotation and invoice implementation

Suggested adjacent follow-ups after HAL-137:

- PDF/print document foundation
- finance payment and cash/bank ledger improvements
- role template presets for sales and finance users