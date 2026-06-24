"use client";

import { useEffect, useMemo, useState } from "react";

type SalesInvoice = {
  id: string;
  invoiceNumber: string;
  customerNameSnapshot: string;
  status: "draft" | "issued" | "partial" | "paid" | "cancelled";
  dueDate: string | null;
  totalAmount: number | string;
  receivable: {
    status: "open" | "partial" | "paid" | "cancelled";
    paidAmount: number | string;
    amount: number | string;
  } | null;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
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

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function FinanceInvoiceSummaryPanel() {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadInvoices() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/sales-invoices", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { data?: SalesInvoice[] } & ApiErrorPayload;
        if (!response.ok) throw new Error(payload.error?.message ?? "Could not load invoice summary.");
        if (active) setInvoices(payload.data ?? []);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load invoice summary.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInvoices();

    return () => {
      active = false;
    };
  }, []);

  const issuedTotal = useMemo(
    () => invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
    [invoices],
  );

  const outstandingTotal = useMemo(
    () =>
      invoices.reduce((sum, invoice) => {
        const amount = Number(invoice.receivable?.amount ?? 0);
        const paidAmount = Number(invoice.receivable?.paidAmount ?? 0);
        return sum + Math.max(amount - paidAmount, 0);
      }, 0),
    [invoices],
  );

  return (
    <section className="procurement-section" aria-label="Invoice summary">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Commercial billing</p>
          <h2>Invoice visibility</h2>
          <p>Read-only summary of issued invoices and linked receivable exposure for finance review.</p>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="dashboard-grid" aria-label="Invoice summary tiles">
        <article className="stat-tile">
          <span>Invoices</span>
          <strong>{invoices.length}</strong>
        </article>
        <article className="stat-tile">
          <span>Issued total</span>
          <strong>{money(issuedTotal)}</strong>
        </article>
        <article className="stat-tile">
          <span>Outstanding</span>
          <strong>{money(outstandingTotal)}</strong>
        </article>
      </section>

      {loading ? (
        <section className="users-list" aria-label="Invoice summary loading">
          <article className="user-row skeleton-block" />
          <article className="user-row skeleton-block" />
        </section>
      ) : (
        <section className="users-list" aria-label="Invoice summary list">
          {invoices.length === 0 ? (
            <article className="user-row user-row-empty">
              <strong>No invoices available yet.</strong>
            </article>
          ) : (
            invoices.slice(0, 5).map((invoice) => (
              <article className="sales-order-row" key={invoice.id}>
                <div>
                  <span>Invoice</span>
                  <strong>{invoice.invoiceNumber}</strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>{invoice.customerNameSnapshot}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{invoice.status}</strong>
                </div>
                <div>
                  <span>Receivable</span>
                  <strong>{invoice.receivable?.status ?? "-"}</strong>
                </div>
                <div>
                  <span>Due date</span>
                  <strong>{dateTime(invoice.dueDate)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money(invoice.totalAmount)}</strong>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </section>
  );
}
