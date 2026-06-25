# HAL-138 PDF and Print Document Foundation

**Linear:** HAL-115  
**Date:** 2026-06-25  
**Status:** Implemented

## Goal

Add a practical print/PDF foundation for client-ready sales and procurement
documents without introducing a server-side PDF dependency.

## Implemented Scope

- Printable sales order endpoint:
  - `/api/sales-orders/[id]/print`
- Printable purchase order endpoint:
  - `/api/purchase-orders/[id]/print`
- Shared printable HTML renderer:
  - `src/lib/print/document-html.ts`
- Sales dashboard row action:
  - `Print`
- Procurement dashboard row action:
  - `Print`

## Design Decision

The first foundation uses browser-native print/save-as-PDF from styled HTML.
This keeps the feature Vercel-safe, dependency-free, and easy to extend later to
quotations, invoices, receipts, and dedicated PDF generation if pilot demand
requires it.

## Security and Tenant Safety

- Sales print endpoint requires `sales.read`.
- Purchase print endpoint requires `purchases.read`.
- Both endpoints query by authenticated `companyId`.
- Cross-tenant access continues to return forbidden behavior.
- Printable HTML escapes document values before rendering.
- Responses use `Cache-Control: no-store`.
- No secrets, password hashes, session tokens, or provider keys are rendered.

## User Workflow

1. Open Sales or Procurement dashboard.
2. Find an existing order.
3. Click `Print`.
4. Browser opens a print-optimized document.
5. Use `Print / Save PDF` to print or save as PDF.

## Current Limitations

- This is not a binary PDF API yet.
- Branding is simple and uses the company name from the authenticated session.
- Currency still follows the current app's USD formatting until a dedicated
  currency/localization issue is implemented.
- Purchase order printable documents do not yet include a vendor address field
  because the current purchase-order snapshot stores vendor name, phone, and
  email.

## Next Extensions

- Add print views for quotations and invoices.
- Add receipt/payment print views.
- Add company address/tax fields when company profile supports them.
- Add BD currency/localization support if pilot clients require it.

## Recommendation

Ready for controlled pilot use. This covers the first likely client request:
printing or saving sales and purchase documents as PDFs from the browser.
