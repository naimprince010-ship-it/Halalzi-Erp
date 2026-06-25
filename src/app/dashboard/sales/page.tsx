"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";
import { downloadCsvExport } from "@/lib/export/export-client";
import { SalesQuoteInvoicePanel } from "@/components/sales/SalesQuoteInvoicePanel";

type SalesOrderStatus = "draft" | "confirmed" | "cancelled" | "completed";

type SalesOrderItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
};

type SalesOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  status: SalesOrderStatus;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: SalesOrderItem[];
};

type Product = {
  id: string;
  name: string;
  sku: string;
  salePrice: number | string;
  stockQuantity: number;
  status: "active" | "inactive";
};

type SalesOrdersResponse = {
  data: SalesOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SalesOrderResponse = {
  data: SalesOrder;
};

type ProductsResponse = {
  products: Product[];
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type OrderFormItem = {
  productId: string;
  quantity: string;
};

const navItems = [
  { label: "Dashboard", permission: "dashboard.read", href: "/dashboard" },
  { label: "Company", permission: "company.read", href: "/dashboard/company" },
  { label: "Products", permission: "products.read", href: "/dashboard/products" },
  { label: "Sales", permission: "sales.read", href: "/dashboard/sales" },
  { label: "CRM", permission: "crm.read", href: "/dashboard/crm" },
  { label: "Procurement", permission: "purchases.read", href: "/dashboard/procurement" },
  { label: "Finance", permission: "finance.read", href: "/dashboard/finance" },
  { label: "Audit", permission: "audit.read", href: "/dashboard/audit" },
  { label: "Users", permission: "users.read", href: "/dashboard/users" },
  { label: "Roles", permission: "roles.read", href: "/dashboard/roles" },
  { label: "Profile", permission: "profile.read", href: "/dashboard/profile" },
];

const emptyOrderForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  customerAddress: "",
  notes: "",
  discountAmount: "0",
  items: [{ productId: "", quantity: "1" }] as OrderFormItem[],
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "-";
  }

  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeApiError(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function statusBadgeClass(status: SalesOrderStatus) {
  return `status-badge status-badge-${status}`;
}

function buildOrderPayload(form: typeof emptyOrderForm) {
  return {
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined,
    customerAddress: form.customerAddress.trim() || undefined,
    notes: form.notes.trim() || undefined,
    discountAmount: Number(form.discountAmount || 0),
    items: form.items.map((item) => ({
      productId: item.productId,
      quantity: Number.parseInt(item.quantity, 10),
    })),
  };
}

export default function SalesDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [pageError, setPageError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(emptyOrderForm);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyOrderForm);

  const [creating, setCreating] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canReadSales = currentUser?.permissions.includes("sales.read") ?? false;
  const canCreateSales = currentUser?.permissions.includes("sales.create") ?? false;
  const canUpdateSales = currentUser?.permissions.includes("sales.update") ?? false;
  const canConfirmSales = currentUser?.permissions.includes("sales.confirm") ?? false;
  const canCancelSales = currentUser?.permissions.includes("sales.cancel") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status === "active"),
    [products],
  );

  async function handleExport() {
    setExporting(true);
    setExportError(null);

    try {
      await downloadCsvExport("/api/exports/sales-orders");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function loadSalesOrders() {
    setOrdersLoading(true);
    setPageError(null);

    try {
      const response = await fetch("/api/sales-orders", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<SalesOrdersResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiError(payload, "Could not load sales orders. Please try again."));
      }

      setOrders(payload.data ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load sales orders. Please try again.");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadProducts() {
    setProductsLoading(true);

    try {
      const response = await fetch("/api/products", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<ProductsResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiError(payload, "Could not load products. Please try again."));
      }

      setProducts(payload.products ?? []);
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const user = await getCurrentUser();

        if (!active) {
          return;
        }

        setCurrentUser(user);

        if (!user.permissions.includes("sales.read")) {
          return;
        }

        await Promise.all([loadSalesOrders(), loadProducts()]);
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
          setOrdersLoading(false);
          setProductsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  function updateOrderItem(
    mode: "create" | "edit",
    index: number,
    field: keyof OrderFormItem,
    value: string,
  ) {
    const setForm = mode === "create" ? setCreateForm : setEditForm;

    setForm((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], [field]: value };
      return { ...current, items };
    });
  }

  function addOrderItem(mode: "create" | "edit") {
    const setForm = mode === "create" ? setCreateForm : setEditForm;

    setForm((current) => ({
      ...current,
      items: [...current.items, { productId: "", quantity: "1" }],
    }));
  }

  function removeOrderItem(mode: "create" | "edit", index: number) {
    const setForm = mode === "create" ? setCreateForm : setEditForm;

    setForm((current) => {
      if (current.items.length === 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  function resetMessages() {
    setCreateError(null);
    setCreateSuccess(null);
    setEditError(null);
    setEditSuccess(null);
    setActionError(null);
    setActionSuccess(null);
  }

  async function handleCreateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setCreating(true);

    try {
      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderPayload(createForm)),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<SalesOrderResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiError(payload, "Could not create sales order. Please try again."));
      }

      setCreateSuccess(`Draft order ${payload.data?.orderNumber ?? ""} created successfully.`.trim());
      setCreateForm(emptyOrderForm);
      await loadSalesOrders();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create sales order. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function startEditOrder(order: SalesOrder) {
    resetMessages();
    setEditTargetId(order.id);
    setEditForm({
      customerName: order.customerName,
      customerPhone: order.customerPhone ?? "",
      customerEmail: order.customerEmail ?? "",
      customerAddress: order.customerAddress ?? "",
      notes: order.notes ?? "",
      discountAmount: String(order.discountAmount ?? 0),
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: String(item.quantity),
      })),
    });
  }

  function cancelEditOrder() {
    setEditTargetId(null);
    setEditForm(emptyOrderForm);
  }

  async function handleUpdateOrder(orderId: string) {
    resetMessages();
    setSavingOrderId(orderId);

    try {
      const response = await fetch(`/api/sales-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderPayload(editForm)),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<SalesOrderResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiError(payload, "Could not update sales order. Please try again."));
      }

      setEditSuccess(`Order ${payload.data?.orderNumber ?? ""} updated successfully.`.trim());
      cancelEditOrder();
      await loadSalesOrders();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update sales order. Please try again.");
    } finally {
      setSavingOrderId(null);
    }
  }

  async function handleConfirmOrder(order: SalesOrder) {
    resetMessages();
    setConfirmingOrderId(order.id);

    try {
      const response = await fetch(`/api/sales-orders/${order.id}/confirm`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<SalesOrderResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        const message = normalizeApiError(payload, "Could not confirm sales order. Please try again.");
        if (message.toLowerCase().includes("insufficient stock")) {
          throw new Error(`Insufficient stock: ${message}`);
        }
        throw new Error(message);
      }

      setActionSuccess(`Order ${order.orderNumber} confirmed successfully.`);
      await loadSalesOrders();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not confirm sales order. Please try again.");
    } finally {
      setConfirmingOrderId(null);
    }
  }

  async function handleCancelOrder(order: SalesOrder) {
    resetMessages();
    setCancellingOrderId(order.id);

    try {
      const response = await fetch(`/api/sales-orders/${order.id}/cancel`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<SalesOrderResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiError(payload, "Could not cancel sales order. Please try again."));
      }

      setActionSuccess(`Order ${order.orderNumber} cancelled successfully.`);
      await loadSalesOrders();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not cancel sales order. Please try again.");
    } finally {
      setCancellingOrderId(null);
    }
  }

  async function handleLogout() {
    setPageError(null);

    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setPageError("Could not log out. Please try again.");
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

  if (!currentUser) {
    return null;
  }

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
            <p className="eyebrow">Sales</p>
            <h1>{currentUser.company.name}</h1>
          </div>
          <div className="user-menu">
            <span>{currentUser.user.name}</span>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {pageError ? <div className="form-error">{pageError}</div> : null}

        {!canReadSales ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view sales orders.</h2>
            <p>
              Ask a company administrator to grant <strong>sales.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Sales orders</p>
                <h2>Order lifecycle and customer billing</h2>
                <p>
                  Create, update, confirm, and cancel sales orders with role-aware controls and
                  tenant-scoped API actions.
                </p>
              </div>
              <div className="hero-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? "Exporting…" : "Export CSV"}
                </button>
              </div>
            </section>

            {exportError ? <div className="form-error">{exportError}</div> : null}

            {createError ? <div className="form-error">{createError}</div> : null}
            {createSuccess ? <div className="form-success">{createSuccess}</div> : null}
            {editError ? <div className="form-error">{editError}</div> : null}
            {editSuccess ? <div className="form-success">{editSuccess}</div> : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
            {actionSuccess ? <div className="form-success">{actionSuccess}</div> : null}

            <SalesQuoteInvoicePanel
              orders={orders}
              products={activeProducts}
              productsLoading={productsLoading}
              permissions={currentUser.permissions}
              onOrdersChanged={loadSalesOrders}
            />

            {canCreateSales ? (
              <section className="users-create-panel" aria-label="Create sales order panel">
                <p className="eyebrow">Create draft order</p>
                <h2>New sales order</h2>

                <form className="sales-order-form" onSubmit={handleCreateOrder}>
                  <label className="field">
                    <span>Customer name</span>
                    <input
                      value={createForm.customerName}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerName: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={createForm.customerPhone}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerPhone: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={createForm.customerEmail}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerEmail: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Address</span>
                    <input
                      value={createForm.customerAddress}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerAddress: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Discount amount</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={createForm.discountAmount}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, discountAmount: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field sales-order-notes-field">
                    <span>Notes</span>
                    <textarea
                      className="sales-order-notes"
                      value={createForm.notes}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </label>

                  <div className="sales-items-box">
                    <div className="sales-items-header">
                      <strong>Line items</strong>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => addOrderItem("create")}
                        disabled={productsLoading || activeProducts.length === 0}
                      >
                        Add item
                      </button>
                    </div>

                    {createForm.items.map((item, index) => (
                      <div className="sales-item-row" key={`create-item-${index + 1}`}>
                        <label className="field">
                          <span>Product</span>
                          <select
                            className="role-select"
                            value={item.productId}
                            onChange={(event) => updateOrderItem("create", index, "productId", event.target.value)}
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
                            onChange={(event) => updateOrderItem("create", index, "quantity", event.target.value)}
                            required
                          />
                        </label>
                        <div className="sales-item-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => removeOrderItem("create", index)}
                            disabled={createForm.items.length === 1}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="sales-order-actions">
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={creating || productsLoading || activeProducts.length === 0}
                    >
                      {creating ? "Creating..." : "Create draft order"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {ordersLoading ? (
              <section className="users-list" aria-label="Sales orders loading">
                <article className="user-row skeleton-block" />
                <article className="user-row skeleton-block" />
              </section>
            ) : (
              <section className="users-list" aria-label="Sales orders list">
                {orders.length === 0 ? (
                  <article className="user-row user-row-empty empty-state">
                    <strong>No sales orders found for this company.</strong>
                    <span>Create the first draft order to start the quote-to-cash workflow.</span>
                  </article>
                ) : (
                  orders.map((order) => {
                    const draftOrder = order.status === "draft";
                    const cancellable = order.status === "draft" || order.status === "confirmed";

                    return (
                      <article className="sales-order-row" key={order.id}>
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
                          <strong className={statusBadgeClass(order.status)}>{order.status}</strong>
                        </div>
                        <div>
                          <span>Subtotal</span>
                          <strong>{formatMoney(order.subtotal)}</strong>
                        </div>
                        <div>
                          <span>Discount</span>
                          <strong>{formatMoney(order.discountAmount)}</strong>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{formatMoney(order.totalAmount)}</strong>
                        </div>
                        <div>
                          <span>Created</span>
                          <strong>{formatDateTime(order.createdAt)}</strong>
                        </div>
                        <div>
                          <span>Updated</span>
                          <strong>{formatDateTime(order.updatedAt)}</strong>
                        </div>
                        <div>
                          <span>Items</span>
                          <strong>{order.items?.length ?? 0}</strong>
                        </div>

                        <div className="sales-order-actions-row">
                          <a
                            className="secondary-button"
                            href={`/api/sales-orders/${order.id}/print`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Print
                          </a>

                          {canUpdateSales && draftOrder ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => startEditOrder(order)}
                            >
                              Edit draft
                            </button>
                          ) : null}

                          {canConfirmSales && draftOrder ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleConfirmOrder(order)}
                              disabled={confirmingOrderId === order.id}
                            >
                              {confirmingOrderId === order.id ? "Confirming..." : "Confirm"}
                            </button>
                          ) : null}

                          {canCancelSales && cancellable ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleCancelOrder(order)}
                              disabled={cancellingOrderId === order.id}
                            >
                              {cancellingOrderId === order.id ? "Cancelling..." : "Cancel"}
                            </button>
                          ) : null}
                        </div>

                        {editTargetId === order.id && canUpdateSales && draftOrder ? (
                          <form
                            className="sales-order-edit-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleUpdateOrder(order.id);
                            }}
                          >
                            <label className="field">
                              <span>Customer name</span>
                              <input
                                value={editForm.customerName}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, customerName: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label className="field">
                              <span>Phone</span>
                              <input
                                value={editForm.customerPhone}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, customerPhone: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Email</span>
                              <input
                                type="email"
                                value={editForm.customerEmail}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, customerEmail: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Address</span>
                              <input
                                value={editForm.customerAddress}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, customerAddress: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Discount amount</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editForm.discountAmount}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, discountAmount: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field sales-order-notes-field">
                              <span>Notes</span>
                              <textarea
                                className="sales-order-notes"
                                value={editForm.notes}
                                onChange={(event) =>
                                  setEditForm((current) => ({ ...current, notes: event.target.value }))
                                }
                              />
                            </label>

                            <div className="sales-items-box">
                              <div className="sales-items-header">
                                <strong>Line items</strong>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => addOrderItem("edit")}
                                  disabled={activeProducts.length === 0}
                                >
                                  Add item
                                </button>
                              </div>

                              {editForm.items.map((item, index) => (
                                <div className="sales-item-row" key={`edit-item-${index + 1}`}>
                                  <label className="field">
                                    <span>Product</span>
                                    <select
                                      className="role-select"
                                      value={item.productId}
                                      onChange={(event) =>
                                        updateOrderItem("edit", index, "productId", event.target.value)
                                      }
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
                                      onChange={(event) =>
                                        updateOrderItem("edit", index, "quantity", event.target.value)
                                      }
                                      required
                                    />
                                  </label>
                                  <div className="sales-item-actions">
                                    <button
                                      className="secondary-button"
                                      type="button"
                                      onClick={() => removeOrderItem("edit", index)}
                                      disabled={editForm.items.length === 1}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="sales-order-actions">
                              <button
                                className="primary-button"
                                type="submit"
                                disabled={savingOrderId === order.id}
                              >
                                {savingOrderId === order.id ? "Saving..." : "Save draft changes"}
                              </button>
                              <button className="secondary-button" type="button" onClick={cancelEditOrder}>
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
          </>
        )}
      </section>
    </main>
  );
}

