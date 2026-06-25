# HAL-148 POS Dashboard UI

## Purpose

This deliverable adds the first cashier-facing POS dashboard screen on top of the HAL-147 POS API foundation.

## Scope Implemented

- Added `/dashboard/pos`.
- Added permission-aware POS navigation.
- Added server-limited product search against `GET /api/pos/products`.
- Added cart controls with quantity caps based on visible stock.
- Added customer name/phone, discount, payment method, optional payment account, and paid amount fields.
- Added `POST /api/pos/sales` sale completion from the UI.
- Added change calculation and receipt link after sale completion.
- Added recent POS sales with receipt actions.
- Added responsive POS-specific CSS.

## Guardrails

- The UI does not load the full product catalog; it uses the HAL-147 limited search endpoint.
- `pos.read`, `pos.create`, and `pos.receipts.print` control visibility and actions.
- Finance account linking is optional and only shown when the user has `finance.read`.
- Final stock, finance, and tenant checks remain server-side.

## Verification

Run:

```bash
npm run verify:hal148
npm run lint
npm run build:ci
```

Expected artifacts:

```text
E:\ERP_AI_Project_NEW\app\outputs\HAL-148_pos_dashboard_ui_verification.json
E:\ERP_AI_Project_NEW\outputs\HAL-148_pos_dashboard_ui_verification.json
```

## Follow-up

- Browser smoke with a seeded product and cashier/admin user.
- Receipt print polish.
- POS cashier session open/close controls.
- High-volume product search tuning once real product volume grows.
