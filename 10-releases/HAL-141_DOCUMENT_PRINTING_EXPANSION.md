# HAL-141 Document Printing Expansion

**Date:** 2026-06-25  
**Status:** Implemented  
**Parent roadmap:** HAL-139 Product development phase roadmap

## Goal

Expand the existing browser print/save-PDF foundation beyond sales orders and
purchase orders so the visible sales workflow feels more complete.

## Implemented Scope

### Sales Quotation Print

- Added `GET /api/sales-quotations/[id]/print`.
- Reuses the shared printable HTML renderer from HAL-138.
- Requires `sales.quotations.read`.
- Scopes the quotation by authenticated `companyId`.
- Renders customer details, status, validity, conversion state, line items,
  subtotal, discount, total, and notes.
- Returns `Cache-Control: no-store`.

### Sales Invoice Print

- Added `GET /api/sales-invoices/[id]/print`.
- Reuses the shared printable HTML renderer from HAL-138.
- Allows `sales.invoices.read` or `finance.read`, matching the invoice read API.
- Scopes the invoice by authenticated `companyId`.
- Renders customer snapshot details, invoice/receivable status, due date, paid
  amount, line items, subtotal, discount, total, and notes.
- Returns `Cache-Control: no-store`.

### Dashboard Actions

- Added **Print** actions for quotation rows in the Sales dashboard.
- Added **Print invoice** action for already-invoiced eligible orders.
- Added **Print** actions for invoice rows in the Sales dashboard.

## Safety

- No database schema changes.
- No destructive database commands.
- Existing tenant scope and RBAC patterns are preserved.
- Printable values are still escaped through `renderPrintableDocument`.
- Print pages open in a new tab and use browser print/save-as-PDF.

## Files Changed

- `src/app/api/sales-quotations/[id]/print/route.ts`
- `src/app/api/sales-invoices/[id]/print/route.ts`
- `src/components/sales/SalesQuoteInvoicePanel.tsx`
- `10-releases/HAL-141_DOCUMENT_PRINTING_EXPANSION.md`
- `outputs/HAL-141_document_printing_expansion.json`

## Verification Plan

Run:

```powershell
npm run lint
npm run build:ci
```

Optional browser verification:

- Open `/dashboard/sales`.
- Confirm quotation rows show a **Print** action.
- Confirm invoice rows show a **Print** action.
- Confirm eligible order rows with an existing invoice show **Print invoice**.
- Open print pages and confirm the browser print/save-PDF button appears.

## Result

HAL-141 makes the sales document workflow more visibly complete without adding
a separate PDF service or new dependency.

Verification passed:

- `npm run lint` passed with pre-existing warnings in untracked scripts.
- `npm run build:ci` passed.
