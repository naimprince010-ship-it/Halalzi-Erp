"use client";

import { useEffect, useMemo, useState } from "react";

type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  kind: "general" | "cash" | "bank" | "mobile_money";
  status: "active" | "inactive";
};

type Expense = {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  amount: number | string;
  status: "posted" | "reversed";
  method: string;
  note: string | null;
  categoryAccount: { code: string; name: string };
  paidFromAccount: { code: string; name: string; kind: string };
  reversalJournalEntryId: string | null;
};

type CashBankReport = {
  accountCount: number;
  totalLiquidBalance: number;
  negativeBalanceCount: number;
  warnings: { noCashBankAccounts: boolean; hasNegativeBalances: boolean };
  rows: Array<{ id: string; code: string; name: string; kind: string; currentBalance: number; isNegative: boolean }>;
};

type ExpenseSummaryReport = {
  totals: { totalAmount: number };
  totalsByCategory: Array<{ categoryAccountId: string; code: string; name: string; amount: number }>;
};

type ApiErrorPayload = {
  error?: { message?: string };
};

type ExpenseFormState = {
  expenseDate: string;
  amount: string;
  categoryAccountId: string;
  paidFromAccountId: string;
  method: "cash" | "bank_transfer" | "card" | "cheque" | "other";
  reference: string;
  note: string;
};

const emptyExpenseForm: ExpenseFormState = {
  expenseDate: "",
  amount: "",
  categoryAccountId: "",
  paidFromAccountId: "",
  method: "bank_transfer",
  reference: "",
  note: "",
};

function money(value: number | string | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function isoDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;
}

function message(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

export function FinanceCashBankExpensePanel({
  permissions,
  onError,
  onSuccess,
}: {
  permissions: string[];
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashBankSummary, setCashBankSummary] = useState<CashBankReport | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummaryReport | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpenseForm);
  const [busy, setBusy] = useState<string | null>(null);

  const canReadExpenses = permissions.includes("finance.expenses.read");
  const canCreateExpenses = permissions.includes("finance.expenses.create");
  const canReverseExpenses = permissions.includes("finance.expenses.reverse");
  const canReadCashBank = permissions.includes("finance.cashbank.read");
  const canReadReports = permissions.includes("finance.reports.read");

  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === "expense" && account.status === "active"),
    [accounts],
  );
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status === "active" &&
          (account.kind === "cash" || account.kind === "bank" || account.kind === "mobile_money"),
      ),
    [accounts],
  );

  async function loadData() {
    setBusy("load-expense-cashbank");
    try {
      const tasks: Promise<void>[] = [];

      if (canCreateExpenses || canReadCashBank) {
        tasks.push(
          fetch("/api/finance/accounts", { cache: "no-store" })
            .then(async (response) => {
              const payload = (await response.json().catch(() => ({}))) as
                | ({ accounts?: FinanceAccount[] } & ApiErrorPayload);
              if (!response.ok) {
                throw new Error(message(payload, "Could not load finance accounts."));
              }
              setAccounts(payload.accounts ?? []);
            }),
        );
      }

      if (canReadExpenses) {
        tasks.push(
          fetch("/api/finance/expenses", { cache: "no-store" }).then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as { expenses?: Expense[] } & ApiErrorPayload;
            if (!response.ok) throw new Error(message(payload, "Could not load expenses."));
            setExpenses(payload.expenses ?? []);
          }),
        );
      }

      if (canReadCashBank) {
        tasks.push(
          fetch("/api/finance/reports/cash-bank-summary", { cache: "no-store" }).then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as { report?: CashBankReport } & ApiErrorPayload;
            if (!response.ok) throw new Error(message(payload, "Could not load cash/bank summary."));
            setCashBankSummary(payload.report ?? null);
          }),
        );
      }

      if (canReadReports) {
        tasks.push(
          fetch("/api/finance/reports/expense-summary", { cache: "no-store" }).then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as
              | ({ report?: ExpenseSummaryReport } & ApiErrorPayload);
            if (!response.ok) throw new Error(message(payload, "Could not load expense summary."));
            setExpenseSummary(payload.report ?? null);
          }),
        );
      }

      await Promise.all(tasks);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load cash/bank and expense data.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!canReadExpenses && !canCreateExpenses && !canReadCashBank && !canReadReports) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    onSuccess(null);
    setBusy("create-expense");

    try {
      const response = await fetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseDate: isoDateInput(expenseForm.expenseDate),
          amount: Number(expenseForm.amount || 0),
          categoryAccountId: expenseForm.categoryAccountId,
          paidFromAccountId: expenseForm.paidFromAccountId,
          method: expenseForm.method,
          reference: expenseForm.reference.trim() || undefined,
          note: expenseForm.note.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { expense?: Expense } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not create expense."));

      setExpenseForm(emptyExpenseForm);
      onSuccess(`${payload.expense?.expenseNumber ?? "Expense"} posted.`);
      await loadData();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create expense.");
    } finally {
      setBusy(null);
    }
  }

  async function reverseExpense(expense: Expense) {
    const reason = window.prompt("Reason for reversal")?.trim();
    onError(null);
    onSuccess(null);
    setBusy(`reverse-expense-${expense.id}`);

    try {
      const response = await fetch(`/api/finance/expenses/${expense.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      const payload = (await response.json().catch(() => ({}))) as { expense?: Expense } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not reverse expense."));

      onSuccess(`${expense.expenseNumber} reversed.`);
      await loadData();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reverse expense.");
    } finally {
      setBusy(null);
    }
  }

  if (!canReadExpenses && !canCreateExpenses && !canReadCashBank && !canReadReports) {
    return null;
  }

  return (
    <section className="procurement-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Cash and expenses</p>
          <h2>Cash/bank balances and expense ledger</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={loadData}
          disabled={busy === "load-expense-cashbank"}
        >
          {busy === "load-expense-cashbank" ? "Refreshing..." : "Refresh cash/expense"}
        </button>
      </div>

      {(canReadCashBank || canReadReports) && (
        <div className="finance-report-grid">
          <article className="stat-tile">
            <span>Total liquid balance</span>
            <strong>{money(cashBankSummary?.totalLiquidBalance)}</strong>
          </article>
          <article className="stat-tile">
            <span>Cash/bank accounts</span>
            <strong>{cashBankSummary?.accountCount ?? 0}</strong>
          </article>
          <article className="stat-tile">
            <span>MTD expense total</span>
            <strong>{money(expenseSummary?.totals.totalAmount)}</strong>
          </article>
          <article className="stat-tile">
            <span>Negative balances</span>
            <strong>{cashBankSummary?.negativeBalanceCount ?? 0}</strong>
          </article>
        </div>
      )}

      {canReadCashBank && cashBankSummary?.warnings.noCashBankAccounts ? (
        <div className="form-error">No active cash/bank/mobile money account found.</div>
      ) : null}

      {canCreateExpenses ? (
        <form className="procurement-form" onSubmit={createExpense}>
          <label className="field">
            <span>Expense date</span>
            <input
              type="date"
              value={expenseForm.expenseDate}
              onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Amount</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={expenseForm.amount}
              onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Category account</span>
            <select
              className="role-select"
              required
              value={expenseForm.categoryAccountId}
              onChange={(event) => setExpenseForm({ ...expenseForm, categoryAccountId: event.target.value })}
            >
              <option value="">Select category</option>
              {expenseAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Paid from</span>
            <select
              className="role-select"
              required
              value={expenseForm.paidFromAccountId}
              onChange={(event) => setExpenseForm({ ...expenseForm, paidFromAccountId: event.target.value })}
            >
              <option value="">Select account</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name} ({account.kind})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Method</span>
            <select
              className="role-select"
              value={expenseForm.method}
              onChange={(event) =>
                setExpenseForm({
                  ...expenseForm,
                  method: event.target.value as ExpenseFormState["method"],
                })
              }
            >
              <option value="cash">cash</option>
              <option value="bank_transfer">bank transfer</option>
              <option value="card">card</option>
              <option value="cheque">cheque</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="field">
            <span>Reference</span>
            <input
              value={expenseForm.reference}
              onChange={(event) => setExpenseForm({ ...expenseForm, reference: event.target.value })}
            />
          </label>
          <label className="field procurement-wide-field">
            <span>Note</span>
            <input
              value={expenseForm.note}
              onChange={(event) => setExpenseForm({ ...expenseForm, note: event.target.value })}
            />
          </label>
          <div className="procurement-actions">
            <button className="primary-button" type="submit" disabled={busy === "create-expense"}>
              {busy === "create-expense" ? "Posting..." : "Post expense"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="users-list">
        {canReadExpenses && expenses.length === 0 ? (
          <article className="user-row user-row-empty">
            <strong>No expenses found.</strong>
          </article>
        ) : null}

        {expenses.slice(0, 12).map((expense) => (
          <article className="finance-journal-row" key={expense.id}>
            <div>
              <span>Expense</span>
              <strong>{expense.expenseNumber}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{dateOnly(expense.expenseDate)}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>{money(expense.amount)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{expense.status}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>
                {expense.categoryAccount.code} - {expense.categoryAccount.name}
              </strong>
            </div>
            <div>
              <span>Paid from</span>
              <strong>
                {expense.paidFromAccount.code} - {expense.paidFromAccount.name}
              </strong>
            </div>
            <div>
              <span>Method</span>
              <strong>{expense.method}</strong>
            </div>
            {canReverseExpenses && expense.status === "posted" ? (
              <div className="procurement-row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => reverseExpense(expense)}
                  disabled={busy === `reverse-expense-${expense.id}`}
                >
                  Reverse
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
