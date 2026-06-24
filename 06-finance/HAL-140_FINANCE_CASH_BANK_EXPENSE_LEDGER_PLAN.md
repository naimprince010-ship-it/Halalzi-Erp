# HAL-140 Finance Cash, Bank, and Expense Ledger Plan

## Goal

Plan the smallest pilot-ready finance depth for cash, bank, and expense tracking.

This issue is planning only. It does not change schema, API, UI, or production data.

HAL-141 should implement enough finance workflow for a pilot company to answer three everyday questions:

- How much cash or bank balance do we have?
- What expenses were recorded, by category and date?
- Which receipts or payments affected cash and bank balances?

The plan should reuse the existing chart of accounts, journal entry, receivable, payable, payment, period, report, audit, tenant, and RBAC foundation instead of introducing a separate accounting engine.

## Current Finance Baseline

Confirmed from the current codebase:

- Finance accounts already exist with `asset`, `liability`, `equity`, `income`, and `expense` account types.
- Finance accounts already carry `openingBalance` and `currentBalance`.
- Journal entries already support draft, update, post, cancel, and reverse flows.
- Posting a journal updates account balances according to account type.
- Finance periods can be opened, closed, and reopened.
- Receivables and payables already exist for sales and procurement linkage.
- Receivable and payable payments already record amount, date, method, reference, note, creator, and tenant.
- Trial balance, AR aging, and AP aging reports already exist.
- Finance dashboard already surfaces accounts, journals, receivables, payables, periods, payments, and sales invoice summaries.
- Permissions already include finance read, account management, journal management, payment read/create, period management, and reports read.

Implication:

- Cash and bank should be represented by finance asset accounts, not a duplicate balance table.
- Expenses should be operational records that can create posted journal entries.
- Customer receipts and vendor payments should be optionally tied to a cash or bank account so balances become practical.

## MVP Product Positioning

This feature is for small and medium businesses that need simple operating finance, not full enterprise accounting.

Target workflows:

1. Create cash and bank accounts.
2. Record direct business expenses.
3. Record customer receipt into a cash or bank account.
4. Record vendor payment from a cash or bank account.
5. See cash, bank, and expense summaries on the finance dashboard.
6. Preserve audit and tenant isolation for every record.

This is not intended to cover:

- bank feed integrations
- bank reconciliation
- cheque clearing lifecycle
- tax/VAT filing
- multi-currency
- payroll
- depreciation
- budget controls
- approval workflows for expenses
- automated revenue recognition

## Explicit MVP Decisions

- Use existing `FinanceAccount` for cash, bank, and expense categories.
- Add a lightweight operational expense record so the UI can show expenses without forcing users to read raw journal entries.
- Expense creation should create a posted journal entry by default when both cash/bank and expense accounts are valid.
- Receivable and payable payment creation should accept an optional cash/bank account id.
- Payment account linkage should create or update posted journal impact in the same transaction as payment creation.
- Existing payment APIs should remain backward compatible while the UI gradually requires a cash/bank account for better balance accuracy.
- Period close checks must apply to expense date and payment date.
- `companyId` always comes from authenticated server context, never request body.
- No request should trust client-supplied account balances.
- No destructive mutation of posted accounting history. Corrections should use reversals or linked adjustment entries.

## Account Strategy

### Cash and Bank Accounts

Cash and bank accounts should be normal `FinanceAccount` rows:

| Account Kind | Finance Account Type | Example |
|---|---|---|
| Cash on hand | `asset` | Cash Drawer |
| Bank account | `asset` | Islami Bank Current Account |
| Mobile money account | `asset` | bKash Business Wallet |

For MVP, account kind can be represented by an optional new field, or inferred from a new operational profile table.

Recommended implementation:

```prisma
enum FinanceAccountKind {
  general
  cash
  bank
  mobile_money
  expense_category
}
```

Add to `FinanceAccount`:

```prisma
kind FinanceAccountKind @default(general)
```

Rules:

- `cash`, `bank`, and `mobile_money` must use account type `asset`.
- `expense_category` must use account type `expense`.
- Existing accounts default to `general` to avoid migration risk.
- UI should filter active asset accounts with kind `cash`, `bank`, or `mobile_money` for payment source/destination.
- UI should filter active expense accounts with kind `expense_category` or type `expense` for expense categories.

Alternative considered:

- Create separate `CashAccount` or `BankAccount` models.

Reason rejected for MVP:

- It would duplicate account balances and create reconciliation problems.
- The existing account ledger already has the correct balance semantics.

## Expense Workflow

### User Story

As a finance user, I can record an expense with amount, category, paid-from account, date, vendor/payee, and note, and the system updates finance balances safely.

### Proposed Model

```prisma
enum ExpenseStatus {
  posted
  reversed
}

model Expense {
  id               String        @id @default(cuid())
  companyId        String
  expenseNumber    String
  expenseDate      DateTime      @default(now())
  payeeName        String
  categoryAccountId String
  paidFromAccountId String
  amount           Decimal       @db.Decimal(12, 2)
  method           FinancePaymentMethod @default(bank_transfer)
  reference        String?
  note             String?
  status           ExpenseStatus @default(posted)
  journalEntryId   String        @unique
  reversedAt       DateTime?
  createdByUserId  String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@unique([companyId, expenseNumber])
  @@index([companyId])
  @@index([expenseDate])
  @@index([categoryAccountId])
  @@index([paidFromAccountId])
  @@index([status])
}
```

Journal entry created on expense posting:

| Line | Account | Debit | Credit |
|---|---|---:|---:|
| 1 | Expense category account | Expense amount | 0 |
| 2 | Cash/bank/mobile money account | 0 | Expense amount |

Rules:

- Expense amount must be greater than zero.
- Expense date must not fall inside a closed finance period.
- `categoryAccountId` must belong to the tenant, be active, and be type `expense`.
- `paidFromAccountId` must belong to the tenant, be active, and be type `asset`.
- Expense creation should happen in one transaction with journal creation and posting.
- Reversal should create a reversing journal entry and mark the expense `reversed`.
- Expense records should never expose hidden user/session fields.

## Receivable Payment Cash/Bank Linkage

Current receivable payments update receivable settlement state but do not explicitly update cash/bank account balances.

HAL-141 should extend payment creation with:

```ts
accountId?: string
```

Recommended schema update:

```prisma
model ReceivablePayment {
  // existing fields...
  accountId      String?
  journalEntryId String? @unique
}
```

Journal entry created when `accountId` is supplied:

| Line | Account | Debit | Credit |
|---|---|---:|---:|
| 1 | Cash/bank/mobile money account | Payment amount | 0 |
| 2 | Accounts receivable account | 0 | Payment amount |

MVP simplification:

- If a company does not have an explicit accounts receivable account configured, do not block payment creation.
- Instead, record the payment and account linkage, and defer automatic journal creation until account mapping exists.

Better implementation if HAL-141 includes finance settings:

```prisma
model FinanceSettings {
  companyId            String @id
  accountsReceivableId String?
  accountsPayableId    String?
  defaultCashAccountId String?
  defaultBankAccountId String?
}
```

Decision:

- HAL-141 should avoid a large settings system unless required.
- It may add optional account mapping only if needed to post payment journals safely.

## Payable Payment Cash/Bank Linkage

Current payable payments update payable settlement state but do not explicitly update cash/bank account balances.

HAL-141 should extend payable payment creation with:

```ts
accountId?: string
```

Recommended schema update:

```prisma
model PayablePayment {
  // existing fields...
  accountId      String?
  journalEntryId String? @unique
}
```

Journal entry created when both payment account and accounts payable account are configured:

| Line | Account | Debit | Credit |
|---|---|---:|---:|
| 1 | Accounts payable account | Payment amount | 0 |
| 2 | Cash/bank/mobile money account | 0 | Payment amount |

Rules:

- Payment account must be tenant-scoped, active, and type `asset`.
- Payment amount cannot exceed outstanding payable.
- Payment date must not fall in a closed finance period.
- If posting cannot be done safely because default AP account is missing, payment can still be recorded for MVP only if the limitation is visible in the response and audit metadata.

## API Plan

### Account Enhancements

Update existing routes:

- `POST /api/finance/accounts`
- `GET /api/finance/accounts`
- `PATCH /api/finance/accounts/[id]`

Add fields:

- `kind`
- optional filters: `kind`, `type`, `status`

Validation:

- `kind = cash | bank | mobile_money` requires `type = asset`.
- `kind = expense_category` requires `type = expense`.
- Existing general accounts remain valid.

### Expense Routes

Add routes:

- `GET /api/finance/expenses`
- `POST /api/finance/expenses`
- `GET /api/finance/expenses/[id]`
- `POST /api/finance/expenses/[id]/reverse`

List query filters:

- `status`
- `from`
- `to`
- `categoryAccountId`
- `paidFromAccountId`
- `method`

Create payload:

```json
{
  "expenseDate": "2026-06-24T00:00:00.000Z",
  "payeeName": "Office rent",
  "categoryAccountId": "expense-account-id",
  "paidFromAccountId": "cash-or-bank-account-id",
  "amount": 5000,
  "method": "bank_transfer",
  "reference": "TXN-123",
  "note": "June office rent"
}
```

Response shape:

- `expense`
- linked `journalEntry`
- safe selected account snapshots

### Payment Route Enhancements

Update existing routes:

- `POST /api/finance/receivables/[id]/payments`
- `POST /api/finance/payables/[id]/payments`

Add optional payload field:

```json
{
  "accountId": "cash-or-bank-account-id"
}
```

Response should include:

- payment
- updated receivable/payable
- optional journal entry id
- `financeAction` metadata where useful

## UI Plan

Update `/dashboard/finance` with restrained, dense operational panels:

### Cash and Bank Summary

Show:

- active cash/bank/mobile money accounts
- current balances
- total cash and bank balance
- warning if no cash/bank account exists

Controls:

- create account with kind
- filter account list by kind

### Expense Entry Panel

Show:

- expense form
- category account select
- paid-from account select
- amount, date, method, reference, note
- recent expenses list
- reverse action for posted expenses if user has permission

### Payment Panels

Enhance existing receivable/payable payment UI:

- payment amount
- payment account select
- method/reference/date
- linked journal indicator when available

### Reports and Dashboard Impact

Add summary cards:

- cash/bank total
- month-to-date expense total
- top expense categories
- uncategorized or unposted payment count if any

Keep advanced charts out of HAL-141.

## Permissions

Recommended additions:

| Permission | Purpose |
|---|---|
| `finance.expenses.read` | View expenses |
| `finance.expenses.create` | Record expenses |
| `finance.expenses.reverse` | Reverse posted expenses |
| `finance.cashbank.read` | View cash/bank balances |
| `finance.cashbank.manage` | Mark accounts as cash/bank/mobile money |

Admin role:

- gets all new permissions.

Staff role:

- may get `finance.expenses.read` and `finance.cashbank.read` only.
- should not create/reverse expenses by default.

Alternative:

- Reuse `finance.read`, `finance.accounts.create`, `finance.accounts.update`, and `finance.payments.create`.

Reason not enough:

- Expenses and cash/bank balances are operationally sensitive.
- Separate permissions let pilot companies delegate read access without allowing cash movement recording.

## Audit Events

Add audit actions:

- `finance.expense.create`
- `finance.expense.reverse`
- `finance.cashbank.account_marked`
- `finance.receivable_payment.account_linked`
- `finance.payable_payment.account_linked`

Audit metadata should include:

- account ids
- expense id
- journal entry id
- payment id
- amount
- method
- source record ids

Do not include secrets, full cookies, password fields, or token values.

## Reporting Plan

### Trial Balance

No new endpoint required. Posted expense and payment journals should flow through existing account balances and trial balance.

### Expense Summary

Add:

- `GET /api/finance/reports/expense-summary`

Query:

- `from`
- `to`
- `categoryAccountId`

Response:

- total expense amount
- totals by category account
- totals by payment method
- recent expense sample

### Cash and Bank Summary

Add:

- `GET /api/finance/reports/cash-bank-summary`

Response:

- account balances by cash/bank/mobile money account
- total liquid balance
- count of active cash/bank accounts
- warning flags for negative balance if allowed

MVP note:

- Negative balances should be visible, not automatically blocked, because businesses can have overdrafts or data entry catch-up.

## Tenant and Security Rules

All routes must derive company scope from:

```ts
const currentUser = await requirePermission("...");
const scope = companyScope(currentUser);
```

Rules:

- Never accept `companyId` from request body.
- Every account lookup must include `companyId: scope.companyId`.
- Every expense lookup must include `companyId: scope.companyId`.
- Every payment lookup must include `companyId: scope.companyId`.
- Cross-company expense, account, receivable, payable, or payment ids must return `403` or existing route-equivalent forbidden behavior.
- Safe selects must not expose password hashes, token hashes, session secrets, or hidden auth fields.
- Posted journal entries should be immutable except reversal/cancel rules already supported.

## Period Close Rules

HAL-141 should reuse the existing finance period helper behavior:

- Expense date inside a closed period blocks expense creation.
- Payment date inside a closed period blocks payment creation when journal posting is tied to that payment.
- Reversal date inside a closed period blocks reversal.
- Reopening a period is still governed by `finance.periods.manage`.

## Data Migration Strategy

Migration should be low risk:

1. Add `FinanceAccountKind` enum.
2. Add nullable/default `FinanceAccount.kind`.
3. Add `ExpenseStatus` enum.
4. Add `Expense` model.
5. Add nullable `accountId` and `journalEntryId` to receivable/payable payment models.
6. Add indexes and foreign keys.

Existing rows:

- Existing finance accounts become `general`.
- Existing payments keep `accountId = null` and `journalEntryId = null`.
- No old payment data should be rewritten.

This preserves current production data and avoids destructive migration behavior.

## Implementation Sequence for HAL-141

1. Update Prisma schema and migration.
2. Extend finance account validation and safe selects with `kind`.
3. Add expense shared schemas/helpers.
4. Add expense list/create/read/reverse routes.
5. Add payment account/journal linkage helpers.
6. Extend receivable and payable payment routes with optional `accountId`.
7. Add reports: expense summary and cash-bank summary.
8. Add finance dashboard panels.
9. Add RBAC permissions and default role mappings.
10. Add runtime verification script and artifact.
11. Run `npm run lint`.
12. Run `npm run build:ci`.

## HAL-141 Verification Matrix

Required checks:

1. Unauthenticated expense and cash/bank routes return `401`.
2. Staff user can read allowed finance summaries but cannot create expenses.
3. Admin can mark/create cash and bank accounts.
4. Admin can create an expense with valid category and paid-from accounts.
5. Expense creation creates exactly one posted journal entry.
6. Expense journal debits expense and credits cash/bank.
7. Account balances update correctly after expense posting.
8. Expense inside a closed finance period is blocked.
9. Expense reversal creates a reversing journal and marks the expense reversed.
10. Cross-company expense read is blocked.
11. Receivable payment with account id records payment and links account safely.
12. Payable payment with account id records payment and links account safely.
13. Payment over outstanding balance is still blocked.
14. Cash/bank summary excludes other tenant accounts.
15. Expense summary excludes other tenant expenses.
16. Safe responses expose no password/token/session fields.
17. Existing AR aging, AP aging, and trial balance routes still work.
18. Existing sales invoice to receivable flow still works.

Expected artifact:

```text
E:\ERP_AI_Project_NEW\outputs\HAL-141_finance_cash_bank_expense_verification.json
```

## Risks and Guardrails

### Risk: Duplicate Balance Sources

Do not create a separate balance field on expense or cash/bank models. The source of truth remains `FinanceAccount.currentBalance` updated through posted journals.

### Risk: Incorrect Automatic Payment Journals

If AR/AP control accounts are not configured, do not guess. Either defer journal creation or add explicit settings.

### Risk: Overbuilding Accounting

Keep bank reconciliation, tax, payroll, budget controls, and approval workflow out of HAL-141.

### Risk: Posted History Mutation

Never mutate posted journal lines for corrections. Use reversal records.

### Risk: Permission Overreach

Do not give staff expense creation or reversal permissions by default.

## Done Definition

HAL-140 is complete when:

- This planning doc is committed.
- HAL-141 can start without needing product decisions.
- Schema/API/UI/security/reporting decisions are explicit.
- The implementation verification artifact name is defined.

HAL-141 should not start until this plan is accepted or amended.
