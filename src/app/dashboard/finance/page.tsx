"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
type AccountStatus = "active" | "inactive";
type JournalStatus = "draft" | "posted" | "cancelled";
type SettlementStatus = "open" | "partial" | "paid" | "cancelled";

type FinanceAccount = {
  id: string;
  name: string;
  code: string;
  type: AccountType;
  status: AccountStatus;
  openingBalance: number | string;
  currentBalance: number | string;
  updatedAt: string;
};

type JournalLine = {
  id: string;
  accountId: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  account: {
    code: string;
    name: string;
    type: AccountType;
  };
};

type JournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  sourceType: "manual" | "sales_order" | "purchase_order";
  description: string | null;
  status: JournalStatus;
  totalDebit: number | string;
  totalCredit: number | string;
  postedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  lines: JournalLine[];
};

type Receivable = {
  id: string;
  salesOrderId: string | null;
  customerNameSnapshot: string;
  amount: number | string;
  paidAmount: number | string;
  status: SettlementStatus;
  dueDate: string | null;
  updatedAt: string;
};

type Payable = {
  id: string;
  purchaseOrderId: string | null;
  vendorNameSnapshot: string;
  amount: number | string;
  paidAmount: number | string;
  status: SettlementStatus;
  dueDate: string | null;
  updatedAt: string;
};

type ApiErrorPayload = {
  error?: { message?: string };
};

type JournalFormLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

const navItems = [
  { label: "Dashboard", permission: "dashboard.read", href: "/dashboard" },
  { label: "Company", permission: "company.read", href: "/dashboard/company" },
  { label: "Products", permission: "products.read", href: "/dashboard/products" },
  { label: "Sales", permission: "sales.read", href: "/dashboard/sales" },
  { label: "Procurement", permission: "purchases.read", href: "/dashboard/procurement" },
  { label: "Finance", permission: "finance.read", href: "/dashboard/finance" },
  { label: "Audit", permission: "audit.read", href: "/dashboard/audit" },
  { label: "Users", permission: "users.read", href: "/dashboard/users" },
  { label: "Roles", permission: "roles.read", href: "/dashboard/roles" },
  { label: "Profile", permission: "profile.read", href: "/dashboard/profile" },
];

const emptyAccountForm = {
  name: "",
  code: "",
  type: "asset" as AccountType,
  status: "active" as AccountStatus,
  openingBalance: "0",
};

const emptyJournalForm = {
  entryNumber: "",
  description: "",
  lines: [
    { accountId: "", description: "", debit: "0", credit: "" },
    { accountId: "", description: "", debit: "", credit: "0" },
  ] as JournalFormLine[],
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

function dateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function message(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function accountPayload(form: typeof emptyAccountForm) {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    type: form.type,
    status: form.status,
    openingBalance: Number(form.openingBalance || 0),
  };
}

function journalPayload(form: typeof emptyJournalForm) {
  return {
    entryNumber: form.entryNumber.trim() || undefined,
    description: form.description.trim() || undefined,
    lines: form.lines.map((line) => ({
      accountId: line.accountId,
      description: line.description.trim() || undefined,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
  };
}

export default function FinanceDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [settlementsLoading, setSettlementsLoading] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [journalForm, setJournalForm] = useState(emptyJournalForm);
  const [settlementDrafts, setSettlementDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canReadFinance = currentUser?.permissions.includes("finance.read") ?? false;
  const canCreateAccounts = currentUser?.permissions.includes("finance.accounts.create") ?? false;
  const canCreateJournals = currentUser?.permissions.includes("finance.journals.create") ?? false;
  const canPostJournals = currentUser?.permissions.includes("finance.journals.post") ?? false;
  const canCancelJournals = currentUser?.permissions.includes("finance.journals.cancel") ?? false;
  const canUpdateReceivables = currentUser?.permissions.includes("finance.receivables.update") ?? false;
  const canUpdatePayables = currentUser?.permissions.includes("finance.payables.update") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const activeAccounts = useMemo(() => accounts.filter((account) => account.status === "active"), [accounts]);
  const draftJournals = useMemo(
    () => journalEntries.filter((entry) => entry.status === "draft").length,
    [journalEntries],
  );
  const assetBalance = useMemo(
    () => accounts.filter((account) => account.type === "asset").reduce((sum, account) => sum + Number(account.currentBalance), 0),
    [accounts],
  );
  const openReceivables = useMemo(
    () => receivables.filter((item) => item.status !== "paid" && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount), 0),
    [receivables],
  );
  const openPayables = useMemo(
    () => payables.filter((item) => item.status !== "paid" && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount), 0),
    [payables],
  );

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function loadAccounts() {
    setAccountsLoading(true);
    try {
      const response = await fetch("/api/finance/accounts", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { accounts?: FinanceAccount[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not load finance accounts."));
      setAccounts(payload.accounts ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load finance accounts.");
    } finally {
      setAccountsLoading(false);
    }
  }

  async function loadJournals() {
    setJournalsLoading(true);
    try {
      const response = await fetch("/api/finance/journal-entries", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { journalEntries?: JournalEntry[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not load journal entries."));
      setJournalEntries(payload.journalEntries ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load journal entries.");
    } finally {
      setJournalsLoading(false);
    }
  }

  async function loadSettlements() {
    setSettlementsLoading(true);
    try {
      const [receivablesResponse, payablesResponse] = await Promise.all([
        fetch("/api/finance/receivables", { cache: "no-store" }),
        fetch("/api/finance/payables", { cache: "no-store" }),
      ]);
      const receivablesPayload = (await receivablesResponse.json().catch(() => ({}))) as { receivables?: Receivable[] } & ApiErrorPayload;
      const payablesPayload = (await payablesResponse.json().catch(() => ({}))) as { payables?: Payable[] } & ApiErrorPayload;

      if (!receivablesResponse.ok) throw new Error(message(receivablesPayload, "Could not load receivables."));
      if (!payablesResponse.ok) throw new Error(message(payablesPayload, "Could not load payables."));

      setReceivables(receivablesPayload.receivables ?? []);
      setPayables(payablesPayload.payables ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load finance settlements.");
    } finally {
      setSettlementsLoading(false);
    }
  }

  async function refreshFinance() {
    await Promise.all([loadAccounts(), loadJournals(), loadSettlements()]);
  }

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        setCurrentUser(user);

        if (user.permissions.includes("finance.read")) {
          await Promise.all([loadAccounts(), loadJournals(), loadSettlements()]);
        }
      } catch {
        if (active) router.replace("/login");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      active = false;
    };
  }, [router]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setBusy("account-create");
    try {
      const response = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountPayload(accountForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { account?: FinanceAccount } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not create finance account."));
      setSuccess(`${payload.account?.code ?? "Account"} created.`);
      setAccountForm(emptyAccountForm);
      await loadAccounts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create finance account.");
    } finally {
      setBusy(null);
    }
  }

  async function createJournal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setBusy("journal-create");
    try {
      const response = await fetch("/api/finance/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(journalPayload(journalForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { journalEntry?: JournalEntry } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not create journal entry."));
      setSuccess(`${payload.journalEntry?.entryNumber ?? "Journal entry"} created as draft.`);
      setJournalForm(emptyJournalForm);
      await loadJournals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create journal entry.");
    } finally {
      setBusy(null);
    }
  }

  async function journalAction(entry: JournalEntry, action: "post" | "cancel") {
    clearMessages();
    setBusy(`${action}-${entry.id}`);
    try {
      const response = await fetch(`/api/finance/journal-entries/${entry.id}/${action}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, `Could not ${action} journal entry.`));
      setSuccess(`${entry.entryNumber} ${action === "post" ? "posted" : "cancelled"}.`);
      await refreshFinance();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} journal entry.`);
    } finally {
      setBusy(null);
    }
  }

  async function updateSettlement(kind: "receivable" | "payable", id: string) {
    clearMessages();
    setBusy(`${kind}-${id}`);
    try {
      const paidAmount = Number(settlementDrafts[`${kind}-${id}`] ?? 0);
      const endpoint = kind === "receivable" ? "receivables" : "payables";
      const response = await fetch(`/api/finance/${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, `Could not update ${kind}.`));
      setSuccess(`${kind === "receivable" ? "Receivable" : "Payable"} updated.`);
      await loadSettlements();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not update ${kind}.`);
    } finally {
      setBusy(null);
    }
  }

  function updateJournalLine(index: number, field: keyof JournalFormLine, value: string) {
    setJournalForm((current) => {
      const lines = [...current.lines];
      lines[index] = { ...lines[index], [field]: value };
      return { ...current, lines };
    });
  }

  function addJournalLine() {
    setJournalForm((current) => ({
      ...current,
      lines: [...current.lines, { accountId: "", description: "", debit: "", credit: "" }],
    }));
  }

  function removeJournalLine(index: number) {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.length <= 2 ? current.lines : current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function handleLogout() {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log out. Please try again.");
    }
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <aside className="dashboard-sidebar skeleton-block" />
        <section className="dashboard-main">
          <div className="topbar skeleton-line" />
          <div className="dashboard-grid">
            <div className="stat-tile skeleton-block" />
            <div className="stat-tile skeleton-block" />
            <div className="stat-tile skeleton-block" />
          </div>
        </section>
      </main>
    );
  }

  if (!currentUser) return null;

  return (
    <main className="dashboard-page">
      <aside className="dashboard-sidebar">
        <div className="brand-row">
          <span className="brand-mark">HE</span>
          <div>
            <strong>Halalzi ERP</strong>
            <small>Operations</small>
          </div>
        </div>
        <nav aria-label="Dashboard navigation">
          {visibleNav.map((item) => (
            <Link
              aria-current={pathname === item.href ? "page" : undefined}
              className={pathname === item.href ? "nav-item active" : "nav-item"}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Finance</p>
            <h1>{currentUser.company.name}</h1>
          </div>
          <div className="user-menu">
            <span>{currentUser.user.name}</span>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {error ? <div className="form-error">{error}</div> : null}
        {success ? <div className="form-success">{success}</div> : null}

        {!canReadFinance ? (
          <section className="access-panel" role="alert">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view finance.</h2>
            <p>
              Ask a company administrator to grant <strong>finance.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Finance</p>
                <h2>Accounts, journals, receivables, and payables</h2>
                <p>Track basic accounting records with tenant-scoped APIs and role-aware controls.</p>
              </div>
            </section>

            <section className="dashboard-grid" aria-label="Finance summary">
              <article className="stat-tile">
                <span>Asset balance</span>
                <strong>{money(assetBalance)}</strong>
              </article>
              <article className="stat-tile">
                <span>Open receivables</span>
                <strong>{money(openReceivables)}</strong>
              </article>
              <article className="stat-tile">
                <span>Open payables</span>
                <strong>{money(openPayables)}</strong>
              </article>
              <article className="stat-tile">
                <span>Draft journals</span>
                <strong>{draftJournals}</strong>
              </article>
            </section>

            <section className="procurement-section">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Chart of accounts</p>
                  <h2>Finance accounts</h2>
                </div>
                <span>{accounts.length} accounts</span>
              </div>

              {canCreateAccounts ? (
                <form className="procurement-form" onSubmit={createAccount}>
                  <label className="field">
                    <span>Name</span>
                    <input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Code</span>
                    <input value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select className="role-select" value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as AccountType })}>
                      <option value="asset">asset</option>
                      <option value="liability">liability</option>
                      <option value="equity">equity</option>
                      <option value="income">income</option>
                      <option value="expense">expense</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Opening balance</span>
                    <input type="number" min="0" step="0.01" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} />
                  </label>
                  <div className="procurement-actions">
                    <button className="primary-button" disabled={busy === "account-create"} type="submit">
                      {busy === "account-create" ? "Creating..." : "Create account"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="users-list">
                {accountsLoading ? <article className="user-row skeleton-block" /> : null}
                {!accountsLoading && accounts.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No finance accounts found.</strong>
                  </article>
                ) : null}
                {accounts.map((account) => (
                  <article className="finance-account-row" key={account.id}>
                    <div><span>Code</span><strong>{account.code}</strong></div>
                    <div><span>Name</span><strong>{account.name}</strong></div>
                    <div><span>Type</span><strong>{account.type}</strong></div>
                    <div><span>Status</span><strong>{account.status}</strong></div>
                    <div><span>Opening</span><strong>{money(account.openingBalance)}</strong></div>
                    <div><span>Current</span><strong>{money(account.currentBalance)}</strong></div>
                    <div><span>Updated</span><strong>{dateTime(account.updatedAt)}</strong></div>
                  </article>
                ))}
              </div>
            </section>

            <section className="procurement-section">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Journal entries</p>
                  <h2>Manual ledger entries</h2>
                </div>
                <span>{journalEntries.length} entries</span>
              </div>

              {canCreateJournals ? (
                <form className="procurement-form finance-journal-form" onSubmit={createJournal}>
                  <label className="field">
                    <span>Entry number</span>
                    <input value={journalForm.entryNumber} onChange={(event) => setJournalForm({ ...journalForm, entryNumber: event.target.value })} placeholder="Auto if blank" />
                  </label>
                  <label className="field procurement-wide-field">
                    <span>Description</span>
                    <input value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} />
                  </label>
                  <div className="purchase-items-box">
                    <div className="sales-items-header">
                      <strong>Journal lines</strong>
                      <button className="secondary-button" disabled={activeAccounts.length === 0} onClick={addJournalLine} type="button">
                        Add line
                      </button>
                    </div>
                    {journalForm.lines.map((line, index) => (
                      <div className="finance-journal-line" key={`${index}-${line.accountId || "new"}`}>
                        <label className="field">
                          <span>Account</span>
                          <select className="role-select" value={line.accountId} onChange={(event) => updateJournalLine(index, "accountId", event.target.value)} required>
                            <option value="">Select account</option>
                            {activeAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Debit</span>
                          <input min="0" step="0.01" type="number" value={line.debit} onChange={(event) => updateJournalLine(index, "debit", event.target.value)} />
                        </label>
                        <label className="field">
                          <span>Credit</span>
                          <input min="0" step="0.01" type="number" value={line.credit} onChange={(event) => updateJournalLine(index, "credit", event.target.value)} />
                        </label>
                        <button className="secondary-button" disabled={journalForm.lines.length <= 2} onClick={() => removeJournalLine(index)} type="button">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="procurement-actions">
                    <button className="primary-button" disabled={busy === "journal-create" || activeAccounts.length < 2} type="submit">
                      {busy === "journal-create" ? "Creating..." : "Create draft journal"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="users-list">
                {journalsLoading ? <article className="user-row skeleton-block" /> : null}
                {!journalsLoading && journalEntries.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No journal entries found.</strong>
                  </article>
                ) : null}
                {journalEntries.map((entry) => (
                  <article className="finance-journal-row" key={entry.id}>
                    <div><span>Entry</span><strong>{entry.entryNumber}</strong></div>
                    <div><span>Status</span><strong>{entry.status}</strong></div>
                    <div><span>Date</span><strong>{dateTime(entry.entryDate)}</strong></div>
                    <div><span>Debit</span><strong>{money(entry.totalDebit)}</strong></div>
                    <div><span>Credit</span><strong>{money(entry.totalCredit)}</strong></div>
                    <div><span>Source</span><strong>{entry.sourceType}</strong></div>
                    <div className="procurement-row-actions">
                      {canPostJournals && entry.status === "draft" ? (
                        <button className="secondary-button" disabled={busy === `post-${entry.id}`} onClick={() => journalAction(entry, "post")} type="button">
                          Post
                        </button>
                      ) : null}
                      {canCancelJournals && entry.status === "draft" ? (
                        <button className="secondary-button" disabled={busy === `cancel-${entry.id}`} onClick={() => journalAction(entry, "cancel")} type="button">
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <div className="purchase-items-summary">
                      {entry.lines.map((line) => (
                        <span key={line.id}>
                          {line.account.code} {line.debit !== "0" ? `DR ${money(line.debit)}` : `CR ${money(line.credit)}`}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <SettlementList
              busy={busy}
              canUpdate={canUpdateReceivables}
              drafts={settlementDrafts}
              items={receivables}
              kind="receivable"
              loading={settlementsLoading}
              onDraftChange={(key, value) => setSettlementDrafts((current) => ({ ...current, [key]: value }))}
              onUpdate={updateSettlement}
            />

            <SettlementList
              busy={busy}
              canUpdate={canUpdatePayables}
              drafts={settlementDrafts}
              items={payables}
              kind="payable"
              loading={settlementsLoading}
              onDraftChange={(key, value) => setSettlementDrafts((current) => ({ ...current, [key]: value }))}
              onUpdate={updateSettlement}
            />
          </>
        )}
      </section>
    </main>
  );
}

function SettlementList({
  busy,
  canUpdate,
  drafts,
  items,
  kind,
  loading,
  onDraftChange,
  onUpdate,
}: {
  busy: string | null;
  canUpdate: boolean;
  drafts: Record<string, string>;
  items: Array<Receivable | Payable>;
  kind: "receivable" | "payable";
  loading: boolean;
  onDraftChange: (key: string, value: string) => void;
  onUpdate: (kind: "receivable" | "payable", id: string) => void;
}) {
  const title = kind === "receivable" ? "Receivables" : "Payables";
  const partyLabel = kind === "receivable" ? "Customer" : "Vendor";

  return (
    <section className="procurement-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{kind === "receivable" ? "Customer collections" : "Supplier payments"}</h2>
        </div>
        <span>{items.length} records</span>
      </div>
      <div className="users-list">
        {loading ? <article className="user-row skeleton-block" /> : null}
        {!loading && items.length === 0 ? (
          <article className="user-row user-row-empty">
            <strong>No {title.toLowerCase()} found.</strong>
          </article>
        ) : null}
        {items.map((item) => {
          const draftKey = `${kind}-${item.id}`;
          const partyName =
            kind === "receivable"
              ? (item as Receivable).customerNameSnapshot
              : (item as Payable).vendorNameSnapshot;

          return (
            <article className="finance-settlement-row" key={item.id}>
              <div><span>{partyLabel}</span><strong>{partyName}</strong></div>
              <div><span>Amount</span><strong>{money(item.amount)}</strong></div>
              <div><span>Paid</span><strong>{money(item.paidAmount)}</strong></div>
              <div><span>Status</span><strong>{item.status}</strong></div>
              <div><span>Due date</span><strong>{dateTime(item.dueDate)}</strong></div>
              <div><span>Updated</span><strong>{dateTime(item.updatedAt)}</strong></div>
              {canUpdate ? (
                <div className="finance-settlement-actions">
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={drafts[draftKey] ?? String(item.paidAmount)}
                    onChange={(event) => onDraftChange(draftKey, event.target.value)}
                  />
                  <button className="secondary-button" disabled={busy === draftKey} onClick={() => onUpdate(kind, item.id)} type="button">
                    {busy === draftKey ? "Saving..." : "Update paid"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

