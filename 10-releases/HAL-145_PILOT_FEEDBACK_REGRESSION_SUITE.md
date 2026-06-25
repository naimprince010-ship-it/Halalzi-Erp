# HAL-145 Pilot Feedback Regression Suite

**Status:** Implemented  
**Mode:** Static, non-destructive coverage gate

## Goal

Create a repeatable regression suite for the workflows most likely to matter in
pilot/demo feedback before the product moves deeper into POS, warehouse, BI, or
future module work.

## New Command

```powershell
npm run regression:pilot
```

This runs:

```powershell
node scripts/hal145-pilot-feedback-regression-suite.mjs
```

It writes:

```text
outputs/HAL-145_pilot_feedback_regression_suite.json
```

## Covered Pilot Workflows

1. Auth, RBAC, and tenant isolation
2. Product catalog, import/export, and stock visibility
3. Sales quote-to-cash
4. Procurement approval to payable
5. Finance payments, cash/bank, expenses, and reports
6. Print, PDF, and export safety
7. Production smoke and UI visibility handoff

## What The Gate Checks

- Required docs, scripts, routes, pages, and finance components exist.
- Runtime verification scripts still contain the workflow endpoints/actions they
  are expected to protect.
- Route files still contain tenant/RBAC/safety patterns for critical workflows.
- UI files still expose visible cues such as status badges, export actions, and
  workflow controls.
- Pilot feedback triggers map to follow-up Linear issue families.

## Follow-Up Issue Map

| Pilot feedback trigger | Follow-up issue family |
| --- | --- |
| Product setup/import pain | HAL-116 / HAL-139 |
| Retail POS demand | HAL-123-HAL-125 / HAL-146-HAL-148 |
| Warehouse/location complexity | HAL-126-HAL-127 / HAL-149-HAL-150 |
| BI/KPI demand | HAL-128-HAL-129 / HAL-151-HAL-152 |
| AI CRM demand | HAL-130-HAL-131 / HAL-153-HAL-154 |
| Email sender/domain blocker | HAL-70 / HAL-92 |

## Runtime Commands

For deeper checks when a local app/database or production credentials are
available:

```powershell
npm run regression:dev
npm run regression:hal99
npm run verify:hal137
npm run verify:hal141
npm run verify:hal143
npm run smoke:prod
```

`regression:pilot` intentionally stays non-destructive. It does not create
tenant data, mutate stock, or require production credentials.

## Verification

- `npm run regression:pilot`: PASS, 31/31 checks
