# HAL-147 POS Schema/API Foundation

## Purpose

This deliverable adds the first production-grade POS backend foundation. It does not ship a cashier UI yet. The goal is to make the next POS UI work safe by giving it tenant-scoped APIs, RBAC permissions, POS sale persistence, stock movement accounting, and printable receipts.

## Scope Implemented

- Added `PosSale` and `PosSaleItem` tables with company-scoped sale numbers.
- Added `PosSaleStatus` and POS-specific stock ledger enum values.
- Added `mobile_money` as a supported finance payment method.
- Added POS RBAC permissions and a `Cashier` role template.
- Added server-limited product search at `GET /api/pos/products`.
- Added POS sale list/create at `GET /api/pos/sales` and `POST /api/pos/sales`.
- Added POS sale detail at `GET /api/pos/sales/:id`.
- Added printable receipt HTML at `GET /api/pos/sales/:id/receipt`.
- Added lightweight POS dashboard summary at `GET /api/pos/summary`.

## Safety Notes

- `companyId` always comes from the authenticated session scope.
- POS product search caps results at 50 and never loads the full catalog.
- POS sale creation runs in a single transaction:
  - validates active tenant-scoped products,
  - blocks duplicate products in one sale,
  - verifies available stock,
  - creates the POS sale and item snapshots,
  - decrements inventory,
  - writes stock ledger entries,
  - optionally increments the selected cash/bank/mobile-money account balance.
- Receipt rendering reuses the existing printable document helper.

## Explicit Non-Scope

- Full cashier UI is deferred to the POS UI issue.
- Session open/close cash drawer controls are represented in RBAC but deferred to session hardening.
- Automated journal entry generation for POS sales is deferred to the finance linkage follow-up.
- Cancellation/reversal endpoint is not included in this foundation; the status enum and stock ledger enum are prepared for it.

## Verification

Run:

```bash
npm run verify:hal147
npm run lint
npm run build:ci
```

Expected artifact:

```text
E:\ERP_AI_Project_NEW\outputs\HAL-147_pos_schema_api_foundation_verification.json
```

## Follow-up Issues

- POS cashier UI and fast product lookup.
- POS stock, finance, and RBAC regression suite.
- POS receipt and print polish.
- POS cashier role and session hardening.
- POS production smoke and release signoff.
- POS high-volume product search performance hardening.
