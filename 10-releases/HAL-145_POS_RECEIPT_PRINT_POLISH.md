# HAL-145 POS Receipt and Print Polish

## Goal

Make POS receipts more customer-ready while keeping the existing browser print/save-as-PDF foundation.

## What Changed

- Kept `GET /api/pos/sales/[id]/receipt` protected by `pos.receipts.print`.
- Kept receipt lookup tenant-scoped through `companyId`.
- Kept receipt responses `Cache-Control: no-store`.
- Improved receipt labels from generic document wording to receipt wording.
- Added tendered and change rows to the printable totals area.
- Added customer, cashier, payment method, payment account, completion time, and line-item detail checks.
- Added a short receipt footer for customer-facing print output.
- Ensured receipt item output does not expose internal product/sale relation IDs.

## Verification

Run:

```powershell
npm run verify:hal145:pos-receipt
npm run regression:pos
npm run lint
npm run build:ci
```

Artifact:

- `outputs/HAL-145_pos_receipt_print_verification.json`
- `../outputs/HAL-145_pos_receipt_print_verification.json`

## Notes

This keeps the current HTML print approach. Dedicated PDF generation, printer hardware setup, barcode scanning, and offline receipt sync are intentionally out of scope.
