"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku: string;
  salePrice: number | string;
};

type SalesOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: "draft" | "confirmed" | "cancelled" | "completed";
  totalAmount: number | string;
};

type QuotationItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
};

type SalesQuotation = {
  id: string;
  quoteNumber: string;
  salesOrderId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  validUntil: string | null;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuotationItem[];
};

type SalesInvoice = {
  id: string;
  invoiceNumber: string;
  salesOrderId: string;
  quotationId: string | null;
  receivableId: string | null;
  customerNameSnapshot: string;
  status: "draft" | "issued" | "partial" | "paid" | "cancelled";
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number | string;
  notes: string | null;
  receivable: {
    id: string;
    status: "open" | "partial" | "paid" | "cancelled";
    paidAmount: number | string;
    amount: number | string;
    dueDate: string | null;
  } | null;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type QuotationFormItem = {
  productId: string;
  quantity: string;
};

type QuotationForm = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  validUntil: string;
  discountAmount: string;
  notes: string;
  items: QuotationFormItem[];
};

type Props = {
  orders: SalesOrder[];
  products: Product[];
  productsLoading: boolean;
  permissions: string[];
  onOrdersChanged: () => Promise<void>;
};

const emptyQuotationForm: QuotationForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  customerAddress: "",
  validUntil: "",
  discountAmount: "0",
  notes: "",
  items: [{ productId: "", quantity: "1" }],
};

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null | undefined) {
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

function inputDateTimeValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function normalizeApiError(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function buildQuotationPayload(form: QuotationForm) {
  return {
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined,
    customerAddress: form.customerAddress.trim() || undefined,
    validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
    discountAmount: Number(form.discountAmount || 0),
    notes: form.notes.trim() || undefined,
    items: form.items.map((item) => ({
      productId: item.productId,
      quantity: Number.parseInt(item.quantity, 10),
    })),
  };
}

export function SalesQuoteInvoicePanel({
  orders,
  products,
  productsLoading,
  permissions,
  onOrdersChanged,
}: Props) {
  const [quotations, setQuotations] = useState<SalesQuotation[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [form, setForm] = useState<QuotationForm>(emptyQuotationForm);
  const [editQuotationId, setEditQuotationId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<QuotationForm>(emptyQuotationForm);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const [quoteBusyId, setQuoteBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canReadQuotes = permissions.includes("sales.quotations.read");
  const canCreateQuotes = permissions.includes("sales.quotations.create");
  const canUpdateQuotes = permissions.includes("sales.quotations.update");
  const canSendQuotes = permissions.includes("sales.quotations.send");
  const canAcceptQuotes = permissions.includes("sales.quotations.accept");
  const canRejectQuotes = permissions.includes("sales.quotations.reject");
  const canExpireQuotes = permissions.includes("sales.quotations.expire");
  const canConvertQuotes = permissions.includes("sales.quotations.convert");
  const canReadInvoices = permissions.includes("sales.invoices.read");
  const canCreateInvoices = permissions.includes("sales.invoices.create");

  const eligibleOrders = useMemo(
    () => orders.filter((order) => order.status === "confirmed" || order.status === "completed"),
    [orders],
  );

  const activeProducts = useMemo(() => products, [products]);

  const loadQuotations = useCallback(async () => {
    if (!canReadQuotes) {
      setQuotations([]);
      return;
    }

    setLoadingQuotations(true);
    try {
      const response = await fetch("/api/sales-quotations", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesQuotation[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, "Could not load quotations."));
      setQuotations(payload.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load quotations.");
    } finally {
      setLoadingQuotations(false);
    }
  }, [canReadQuotes]);

  const loadInvoices = useCallback(async () => {
    if (!canReadInvoices) {
      setInvoices([]);
      return;
    }

    setLoadingInvoices(true);
    try {
      const response = await fetch("/api/sales-invoices", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesInvoice[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, "Could not load invoices."));
      setInvoices(payload.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load invoices.");
    } finally {
      setLoadingInvoices(false);
    }
  }, [canReadInvoices]);

  useEffect(() => {
    let active = true;

    async function loadPanel() {
      if (!active) return;
      await loadQuotations();
      if (!active) return;
      await loadInvoices();
    }

    void loadPanel();

    return () => {
      active = false;
    };
  }, [canReadQuotes, canReadInvoices, loadQuotations, loadInvoices]);

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  function updateFormItem(mode: "create" | "edit", index: number, field: keyof QuotationFormItem, value: string) {
    const setTarget = mode === "create" ? setForm : setEditForm;
    setTarget((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], [field]: value };
      return { ...current, items };
    });
  }

  function addFormItem(mode: "create" | "edit") {
    const setTarget = mode === "create" ? setForm : setEditForm;
    setTarget((current) => ({
      ...current,
      items: [...current.items, { productId: "", quantity: "1" }],
    }));
  }

  function removeFormItem(mode: "create" | "edit", index: number) {
    const setTarget = mode === "create" ? setForm : setEditForm;
    setTarget((current) => {
      if (current.items.length === 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  async function handleCreateQuotation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      const response = await fetch("/api/sales-quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQuotationPayload(form)),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesQuotation } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, "Could not create quotation."));
      setForm(emptyQuotationForm);
      setSuccess(`Quotation ${payload.data?.quoteNumber ?? ""} created.`.trim());
      await loadQuotations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create quotation.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditQuotation(quotation: SalesQuotation) {
    resetMessages();
    setEditQuotationId(quotation.id);
    setEditForm({
      customerName: quotation.customerName,
      customerPhone: quotation.customerPhone ?? "",
      customerEmail: quotation.customerEmail ?? "",
      customerAddress: quotation.customerAddress ?? "",
      validUntil: inputDateTimeValue(quotation.validUntil),
      discountAmount: String(quotation.discountAmount ?? 0),
      notes: quotation.notes ?? "",
      items: quotation.items.map((item) => ({
        productId: item.productId,
        quantity: String(item.quantity),
      })),
    });
  }

  async function handleUpdateQuotation(quotationId: string) {
    resetMessages();
    setQuoteBusyId(quotationId);
    try {
      const response = await fetch(`/api/sales-quotations/${quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQuotationPayload(editForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesQuotation } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, "Could not update quotation."));
      setEditQuotationId(null);
      setEditForm(emptyQuotationForm);
      setSuccess(`Quotation ${payload.data?.quoteNumber ?? ""} updated.`.trim());
      await loadQuotations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update quotation.");
    } finally {
      setQuoteBusyId(null);
    }
  }

  async function runQuotationAction(quotation: SalesQuotation, action: "send" | "accept" | "reject" | "expire" | "convert-to-order") {
    resetMessages();
    setQuoteBusyId(quotation.id);
    try {
      const response = await fetch(`/api/sales-quotations/${quotation.id}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesQuotation } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, `Could not ${action} quotation.`));
      setSuccess(`Quotation ${quotation.quoteNumber} ${action.replace(/-/g, " ")} complete.`);
      await loadQuotations();
      if (action === "convert-to-order") {
        await onOrdersChanged();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} quotation.`);
    } finally {
      setQuoteBusyId(null);
    }
  }

  async function handleCreateInvoice(order: SalesOrder) {
    resetMessages();
    setInvoiceBusyId(order.id);
    try {
      const response = await fetch("/api/sales-invoices/from-sales-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesOrderId: order.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: SalesInvoice } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeApiError(payload, "Could not create invoice."));
      setSuccess(`Invoice ${payload.data?.invoiceNumber ?? ""} created.`.trim());
      await loadInvoices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create invoice.");
    } finally {
      setInvoiceBusyId(null);
    }
  }

  return (
    <>
      {error ? <div className="form-error">{error}</div> : null}
      {success ? <div className="form-success">{success}</div> : null}

      {canReadQuotes ? (
        <section className="users-create-panel" aria-label="Quotation workflow panel">
          <p className="eyebrow">Quotations</p>
          <h2>Quote to order workflow</h2>
          <p>Create draft quotations, move them through commercial status, and convert accepted quotes into draft sales orders without changing stock.</p>

          {canCreateQuotes ? (
            <form className="sales-order-form" onSubmit={handleCreateQuotation}>
              <label className="field">
                <span>Customer name</span>
                <input
                  value={form.customerName}
                  onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={form.customerPhone}
                  onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Address</span>
                <input
                  value={form.customerAddress}
                  onChange={(event) => setForm((current) => ({ ...current, customerAddress: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Valid until</span>
                <input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Discount amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountAmount}
                  onChange={(event) => setForm((current) => ({ ...current, discountAmount: event.target.value }))}
                />
              </label>
              <label className="field sales-order-notes-field">
                <span>Notes</span>
                <textarea
                  className="sales-order-notes"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>

              <div className="sales-items-box">
                <div className="sales-items-header">
                  <strong>Quote line items</strong>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => addFormItem("create")}
                    disabled={productsLoading || activeProducts.length === 0}
                  >
                    Add item
                  </button>
                </div>

                {form.items.map((item, index) => (
                  <div className="sales-item-row" key={`quote-create-${index + 1}`}>
                    <label className="field">
                      <span>Product</span>
                      <select
                        className="role-select"
                        value={item.productId}
                        onChange={(event) => updateFormItem("create", index, "productId", event.target.value)}
                        required
                      >
                        <option value="">Select product</option>
                        {activeProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.sku}) - {formatMoney(product.salePrice)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Quantity</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(event) => updateFormItem("create", index, "quantity", event.target.value)}
                        required
                      />
                    </label>
                    <div className="sales-item-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => removeFormItem("create", index)}
                        disabled={form.items.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="sales-order-actions">
                <button className="primary-button" type="submit" disabled={submitting || activeProducts.length === 0}>
                  {submitting ? "Creating..." : "Create draft quotation"}
                </button>
              </div>
            </form>
          ) : null}

          {loadingQuotations ? (
            <section className="users-list" aria-label="Quotations loading">
              <article className="user-row skeleton-block" />
              <article className="user-row skeleton-block" />
            </section>
          ) : (
            <section className="users-list" aria-label="Quotations list">
              {quotations.length === 0 ? (
                <article className="user-row user-row-empty">
                  <strong>No quotations found for this company.</strong>
                </article>
              ) : (
                quotations.map((quotation) => {
                  const draftQuote = quotation.status === "draft";
                  const actionableQuote = quotation.status === "draft" || quotation.status === "sent";

                  return (
                    <article className="sales-order-row" key={quotation.id}>
                      <div>
                        <span>Quote number</span>
                        <strong>{quotation.quoteNumber}</strong>
                      </div>
                      <div>
                        <span>Customer</span>
                        <strong>{quotation.customerName}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{quotation.status}</strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>{formatMoney(quotation.totalAmount)}</strong>
                      </div>
                      <div>
                        <span>Valid until</span>
                        <strong>{formatDateTime(quotation.validUntil)}</strong>
                      </div>
                      <div>
                        <span>Converted order</span>
                        <strong>{quotation.salesOrderId ? "Yes" : "No"}</strong>
                      </div>
                      <div>
                        <span>Items</span>
                        <strong>{quotation.items.length}</strong>
                      </div>

                      <div className="sales-order-actions-row">
                        {canUpdateQuotes && draftQuote ? (
                          <button className="secondary-button" type="button" onClick={() => startEditQuotation(quotation)}>
                            Edit draft
                          </button>
                        ) : null}
                        {canSendQuotes && quotation.status === "draft" ? (
                          <button className="secondary-button" type="button" onClick={() => void runQuotationAction(quotation, "send")} disabled={quoteBusyId === quotation.id}>
                            Send
                          </button>
                        ) : null}
                        {canAcceptQuotes && actionableQuote ? (
                          <button className="secondary-button" type="button" onClick={() => void runQuotationAction(quotation, "accept")} disabled={quoteBusyId === quotation.id}>
                            Accept
                          </button>
                        ) : null}
                        {canRejectQuotes && actionableQuote ? (
                          <button className="secondary-button" type="button" onClick={() => void runQuotationAction(quotation, "reject")} disabled={quoteBusyId === quotation.id}>
                            Reject
                          </button>
                        ) : null}
                        {canExpireQuotes && actionableQuote ? (
                          <button className="secondary-button" type="button" onClick={() => void runQuotationAction(quotation, "expire")} disabled={quoteBusyId === quotation.id}>
                            Expire
                          </button>
                        ) : null}
                        {canConvertQuotes && quotation.status === "accepted" && !quotation.salesOrderId ? (
                          <button className="secondary-button" type="button" onClick={() => void runQuotationAction(quotation, "convert-to-order")} disabled={quoteBusyId === quotation.id}>
                            Convert to order
                          </button>
                        ) : null}
                      </div>

                      {editQuotationId === quotation.id ? (
                        <form
                          className="sales-order-edit-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleUpdateQuotation(quotation.id);
                          }}
                        >
                          <label className="field">
                            <span>Customer name</span>
                            <input value={editForm.customerName} onChange={(event) => setEditForm((current) => ({ ...current, customerName: event.target.value }))} required />
                          </label>
                          <label className="field">
                            <span>Phone</span>
                            <input value={editForm.customerPhone} onChange={(event) => setEditForm((current) => ({ ...current, customerPhone: event.target.value }))} />
                          </label>
                          <label className="field">
                            <span>Email</span>
                            <input type="email" value={editForm.customerEmail} onChange={(event) => setEditForm((current) => ({ ...current, customerEmail: event.target.value }))} />
                          </label>
                          <label className="field">
                            <span>Address</span>
                            <input value={editForm.customerAddress} onChange={(event) => setEditForm((current) => ({ ...current, customerAddress: event.target.value }))} />
                          </label>
                          <label className="field">
                            <span>Valid until</span>
                            <input type="datetime-local" value={editForm.validUntil} onChange={(event) => setEditForm((current) => ({ ...current, validUntil: event.target.value }))} />
                          </label>
                          <label className="field">
                            <span>Discount amount</span>
                            <input type="number" min="0" step="0.01" value={editForm.discountAmount} onChange={(event) => setEditForm((current) => ({ ...current, discountAmount: event.target.value }))} />
                          </label>
                          <label className="field sales-order-notes-field">
                            <span>Notes</span>
                            <textarea className="sales-order-notes" value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} />
                          </label>
                          <div className="sales-items-box">
                            <div className="sales-items-header">
                              <strong>Quote line items</strong>
                              <button className="secondary-button" type="button" onClick={() => addFormItem("edit")}>
                                Add item
                              </button>
                            </div>
                            {editForm.items.map((item, index) => (
                              <div className="sales-item-row" key={`quote-edit-${index + 1}`}>
                                <label className="field">
                                  <span>Product</span>
                                  <select className="role-select" value={item.productId} onChange={(event) => updateFormItem("edit", index, "productId", event.target.value)} required>
                                    <option value="">Select product</option>
                                    {activeProducts.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.name} ({product.sku}) - {formatMoney(product.salePrice)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Quantity</span>
                                  <input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateFormItem("edit", index, "quantity", event.target.value)} required />
                                </label>
                                <div className="sales-item-actions">
                                  <button className="secondary-button" type="button" onClick={() => removeFormItem("edit", index)} disabled={editForm.items.length === 1}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="sales-order-actions">
                            <button className="primary-button" type="submit" disabled={quoteBusyId === quotation.id}>
                              {quoteBusyId === quotation.id ? "Saving..." : "Save draft quotation"}
                            </button>
                            <button className="secondary-button" type="button" onClick={() => setEditQuotationId(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  );
                })
              )}
            </section>
          )}
        </section>
      ) : null}

      {canReadInvoices ? (
        <section className="users-create-panel" aria-label="Invoice workflow panel">
          <p className="eyebrow">Invoices</p>
          <h2>Invoice generation from confirmed orders</h2>
          <p>Invoices are created once per confirmed or completed sales order and link to one receivable without duplicating stock movement.</p>

          <section className="users-list" aria-label="Eligible sales orders for invoicing">
            {eligibleOrders.length === 0 ? (
              <article className="user-row user-row-empty">
                <strong>No confirmed or completed sales orders are ready for invoicing.</strong>
              </article>
            ) : (
              eligibleOrders.map((order) => {
                const existingInvoice = invoices.find((invoice) => invoice.salesOrderId === order.id);

                return (
                  <article className="sales-order-row" key={`invoice-source-${order.id}`}>
                    <div>
                      <span>Order number</span>
                      <strong>{order.orderNumber}</strong>
                    </div>
                    <div>
                      <span>Customer</span>
                      <strong>{order.customerName}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{order.status}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{formatMoney(order.totalAmount)}</strong>
                    </div>
                    <div>
                      <span>Invoice</span>
                      <strong>{existingInvoice?.invoiceNumber ?? "Not created"}</strong>
                    </div>
                    <div className="sales-order-actions-row">
                      {canCreateInvoices ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleCreateInvoice(order)}
                          disabled={invoiceBusyId === order.id || Boolean(existingInvoice)}
                        >
                          {existingInvoice
                            ? "Invoice exists"
                            : invoiceBusyId === order.id
                              ? "Creating..."
                              : "Create invoice"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </section>

          {loadingInvoices ? (
            <section className="users-list" aria-label="Invoices loading">
              <article className="user-row skeleton-block" />
              <article className="user-row skeleton-block" />
            </section>
          ) : (
            <section className="users-list" aria-label="Invoices list">
              {invoices.length === 0 ? (
                <article className="user-row user-row-empty">
                  <strong>No invoices found for this company.</strong>
                </article>
              ) : (
                invoices.map((invoice) => (
                  <article className="sales-order-row" key={invoice.id}>
                    <div>
                      <span>Invoice number</span>
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
                      <strong>{formatDateTime(invoice.dueDate)}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>{formatMoney(invoice.totalAmount)}</strong>
                    </div>
                    <div>
                      <span>Paid amount</span>
                      <strong>{formatMoney(invoice.receivable?.paidAmount ?? null)}</strong>
                    </div>
                  </article>
                ))
              )}
            </section>
          )}
        </section>
      ) : null}
    </>
  );
}
