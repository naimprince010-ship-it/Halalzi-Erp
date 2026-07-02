# HAL-146 POS Cashier Role and Session Hardening

## Goal

Harden the POS cashier workflow so cashier permissions stay narrow while daily counter sessions can be opened, closed, and summarized.

## What Changed

- Added `PosSessionStatus` and `PosSession`.
- Linked `PosSale` to an optional `posSessionId`.
- Added `POST /api/pos/sessions` to open a cashier session.
- Added `GET /api/pos/sessions` to list recent sessions.
- Added `POST /api/pos/sessions/[id]/close` to close the current cashier's open session.
- POS sales now attach to the cashier's open session when one exists.
- POS summary now includes active session and daily session cash totals.
- POS dashboard now shows session status and open/close controls.
- Cashier role now includes POS session read/manage permissions, but still excludes product management, user/role management, finance, inventory adjustment, and POS cancellation.

## Session Rules

- One cashier can have only one open POS session at a time.
- Cashiers can close only their own open session.
- Closing calculates:
  - `expectedCash = openingFloat + completed POS sales in the session`
  - `variance = closingCash - expectedCash`
- Opening and closing are audit logged.
- A POS sale can still complete if no session is open, but it will not be linked to a session. This avoids breaking existing admin/demo flows while making session-based cash closeout available.

## Verification

Run:

```powershell
npm run verify:hal146:pos-session
npm run regression:pos
npm run lint
npm run build:ci
```

Artifact:

- `outputs/HAL-146_pos_cashier_session_verification.json`
- `../outputs/HAL-146_pos_cashier_session_verification.json`

## Out Of Scope

- Cash drawer hardware integration.
- Offline sessions.
- Barcode scanner workflow.
- Forced session requirement for every sale.
