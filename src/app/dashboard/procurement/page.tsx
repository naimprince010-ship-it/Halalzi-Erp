"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";
import { downloadCsvExport } from "@/lib/export/export-client";

type VendorStatus = "active" | "inactive" | "blocked";
type PurchaseStatus = "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "received" | "cancelled";

type Vendor = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  status: VendorStatus;
  updatedAt: string;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  costPrice: number | string | null;
  salePrice: number | string;
  stockQuantity: number;
  status: "active" | "inactive";
};

type PurchaseItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitCost: number | string;
  lineTotal: number | string;
};

type PurchaseOrder = {
  id: string;
  purchaseOrderNumber: string;
  vendorId: string;
  vendorNameSnapshot: string;
  status: PurchaseStatus;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  notes: string | null;
  submittedAt: string | null;
  submittedBy: { id: string; name: string; email: string } | null;
  approvedAt: string | null;
  approvedBy: { id: string; name: string; email: string } | null;
  rejectedAt: string | null;
  rejectedBy: { id: string; name: string; email: string } | null;
  rejectionReason: string | null;
  approvalNote: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: PurchaseItem[];
};

type ApiErrorPayload = {
  error?: { message?: string };
};

type LineForm = {
  productId: string;
  quantity: string;
  unitCost: string;
};

type PurchaseForm = {
  vendorId: string;
  discountAmount: string;
  notes: string;
  items: LineForm[];
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

function emptyPurchaseForm(): PurchaseForm {
  return {
    vendorId: "",
    discountAmount: "0",
    notes: "",
    items: [{ productId: "", quantity: "1", unitCost: "" }],
  };
}

function money(value: number | string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateTime(value: string) {
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

function statusLabel(status: PurchaseStatus) {
  const labels: Record<PurchaseStatus, string> = {
    draft: "Draft",
    pending_approval: "Pending approval",
    approved: "Approved",
    rejected: "Rejected",
    ordered: "Ordered",
    received: "Received",
    cancelled: "Cancelled",
  };

  return labels[status];
}

function purchasePayload(form: PurchaseForm) {
  return {
    vendorId: form.vendorId,
    discountAmount: Number(form.discountAmount || 0),
    notes: form.notes.trim() || undefined,
    items: form.items.map((item) => ({
      productId: item.productId,
      quantity: Number.parseInt(item.quantity, 10),
      unitCost: item.unitCost.trim() ? Number(item.unitCost) : undefined,
    })),
  };
}

export default function ProcurementDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({
    name: "",
    code: "",
    phone: "",
    email: "",
    contactPerson: "",
    status: "active" as VendorStatus,
  });
  const [vendorEditId, setVendorEditId] = useState<string | null>(null);
  const [vendorEditForm, setVendorEditForm] = useState(vendorForm);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(emptyPurchaseForm);
  const [purchaseEditId, setPurchaseEditId] = useState<string | null>(null);
  const [purchaseEditForm, setPurchaseEditForm] = useState<PurchaseForm>(emptyPurchaseForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canReadVendors = currentUser?.permissions.includes("vendors.read") ?? false;
  const canCreateVendors = currentUser?.permissions.includes("vendors.create") ?? false;
  const canUpdateVendors = currentUser?.permissions.includes("vendors.update") ?? false;
  const canReadPurchases = currentUser?.permissions.includes("purchases.read") ?? false;
  const canCreatePurchases = currentUser?.permissions.includes("purchases.create") ?? false;
  const canUpdatePurchases = currentUser?.permissions.includes("purchases.update") ?? false;
  const canSubmitPurchases = currentUser?.permissions.includes("purchases.submit") ?? false;
  const canApprovePurchases = currentUser?.permissions.includes("purchases.approve") ?? false;
  const canRejectPurchases = currentUser?.permissions.includes("purchases.reject") ?? false;
  const canReceivePurchases = currentUser?.permissions.includes("purchases.receive") ?? false;
  const canCancelPurchases = currentUser?.permissions.includes("purchases.cancel") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.status === "active"), [vendors]);
  const activeProducts = useMemo(() => products.filter((product) => product.status === "active"), [products]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function handleExportPurchaseOrders() {
    setExporting(true);
    setExportError(null);

    try {
      await downloadCsvExport("/api/exports/purchase-orders");
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function loadVendors() {
    setVendorsLoading(true);
    try {
      const response = await fetch("/api/vendors", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { vendors?: Vendor[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not load vendors."));
      setVendors(payload.vendors ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load vendors.");
    } finally {
      setVendorsLoading(false);
    }
  }

  async function loadProducts() {
    setProductsLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { products?: Product[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not load products."));
      setProducts(payload.products ?? []);
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const response = await fetch("/api/purchase-orders", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { purchaseOrders?: PurchaseOrder[] } &
        ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not load purchase orders."));
      setOrders(payload.purchaseOrders ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load purchase orders.");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function refreshProcurement() {
    await Promise.all([
      canReadVendors ? loadVendors() : Promise.resolve(),
      canReadPurchases ? loadOrders() : Promise.resolve(),
      canReadPurchases ? loadProducts() : Promise.resolve(),
    ]);
  }

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const user = await getCurrentUser();
        if (!active) return;

        setCurrentUser(user);
        await Promise.all([
          user.permissions.includes("vendors.read") ? loadVendors() : Promise.resolve(),
          user.permissions.includes("purchases.read") ? loadOrders() : Promise.resolve(),
          user.permissions.includes("purchases.read") ? loadProducts() : Promise.resolve(),
        ]);
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

  function changeLine(mode: "create" | "edit", index: number, field: keyof LineForm, value: string) {
    const setForm = mode === "create" ? setPurchaseForm : setPurchaseEditForm;
    setForm((current) => {
      const items = [...current.items];
      const nextItem = { ...items[index], [field]: value };
      if (field === "productId") {
        const product = productById.get(value);
        nextItem.unitCost = product ? String(product.costPrice ?? product.salePrice) : "";
      }
      items[index] = nextItem;
      return { ...current, items };
    });
  }

  function addLine(mode: "create" | "edit") {
    const setForm = mode === "create" ? setPurchaseForm : setPurchaseEditForm;
    setForm((current) => ({
      ...current,
      items: [...current.items, { productId: "", quantity: "1", unitCost: "" }],
    }));
  }

  function removeLine(mode: "create" | "edit", index: number) {
    const setForm = mode === "create" ? setPurchaseForm : setPurchaseEditForm;
    setForm((current) => ({
      ...current,
      items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function createVendor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setBusy("create-vendor");
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vendorForm,
          code: vendorForm.code || undefined,
          phone: vendorForm.phone || undefined,
          email: vendorForm.email || undefined,
          contactPerson: vendorForm.contactPerson || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { vendor?: Vendor } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not create vendor."));
      setSuccess(`${payload.vendor?.name ?? "Vendor"} created.`);
      setVendorForm({ name: "", code: "", phone: "", email: "", contactPerson: "", status: "active" });
      await loadVendors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create vendor.");
    } finally {
      setBusy(null);
    }
  }

  async function saveVendor(vendorId: string) {
    clearMessages();
    setBusy(`vendor-${vendorId}`);
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vendorEditForm,
          code: vendorEditForm.code || null,
          phone: vendorEditForm.phone || null,
          email: vendorEditForm.email || null,
          contactPerson: vendorEditForm.contactPerson || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { vendor?: Vendor } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not update vendor."));
      setSuccess(`${payload.vendor?.name ?? "Vendor"} updated.`);
      setVendorEditId(null);
      await loadVendors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update vendor.");
    } finally {
      setBusy(null);
    }
  }

  async function createPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setBusy("create-purchase");
    try {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchasePayload(purchaseForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { purchaseOrder?: PurchaseOrder } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not create purchase order."));
      setSuccess(`Purchase order ${payload.purchaseOrder?.purchaseOrderNumber ?? ""} created.`.trim());
      setPurchaseForm(emptyPurchaseForm());
      await refreshProcurement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create purchase order.");
    } finally {
      setBusy(null);
    }
  }

  async function savePurchase(orderId: string) {
    clearMessages();
    setBusy(`purchase-${orderId}`);
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchasePayload(purchaseEditForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { purchaseOrder?: PurchaseOrder } & ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not update purchase order."));
      setSuccess(`Purchase order ${payload.purchaseOrder?.purchaseOrderNumber ?? ""} updated.`.trim());
      setPurchaseEditId(null);
      await refreshProcurement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update purchase order.");
    } finally {
      setBusy(null);
    }
  }

  async function orderAction(order: PurchaseOrder, action: "submit" | "approve" | "reject" | "ordered" | "receive" | "cancel") {
    clearMessages();
    setBusy(`${action}-${order.id}`);
    try {
      let requestBody: string | undefined;

      if (action === "ordered") {
        requestBody = JSON.stringify({ status: "ordered" });
      } else if (action === "approve") {
        requestBody = JSON.stringify({});
      } else if (action === "reject") {
        const reason = window.prompt("Why is this purchase order rejected?");

        if (!reason?.trim()) {
          setBusy(null);
          return;
        }

        requestBody = JSON.stringify({ reason: reason.trim() });
      }

      const response = await fetch(
        action === "ordered" ? `/api/purchase-orders/${order.id}` : `/api/purchase-orders/${order.id}/${action}`,
        {
          method: action === "ordered" ? "PATCH" : "POST",
          headers: requestBody ? { "Content-Type": "application/json" } : undefined,
          body: requestBody,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
      if (!response.ok) throw new Error(message(payload, "Could not update purchase order."));
      const actionLabel =
        action === "ordered"
          ? "marked ordered"
          : action === "cancel"
            ? "cancelled"
            : action === "submit"
              ? "submitted for approval"
              : action === "approve"
                ? "approved"
                : action === "reject"
                  ? "rejected"
                  : "received";
      setSuccess(`Purchase order ${order.purchaseOrderNumber} ${actionLabel}.`);
      await refreshProcurement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update purchase order.");
    } finally {
      setBusy(null);
    }
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

  const noAccess = !canReadVendors && !canReadPurchases;

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
            <p className="eyebrow">Procurement</p>
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

        {noAccess ? (
          <section className="access-panel" role="alert">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view procurement.</h2>
            <p>
              Ask a company administrator to grant <strong>vendors.read</strong> or <strong>purchases.read</strong>.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Procurement</p>
                <h2>Vendors and purchase receiving</h2>
                <p>Manage suppliers, draft purchase orders, receive stock, and keep purchasing tenant scoped.</p>
              </div>
              {canReadPurchases ? (
                <div className="hero-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleExportPurchaseOrders}
                    disabled={exporting}
                  >
                    {exporting ? "Exporting…" : "Export purchase orders CSV"}
                  </button>
                </div>
              ) : null}
            </section>

            {exportError ? <div className="form-error">{exportError}</div> : null}

            {canReadVendors ? (
              <section className="procurement-section">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Vendors</p>
                    <h2>Supplier master</h2>
                  </div>
                  <span>{vendors.length} vendors</span>
                </div>

                {canCreateVendors ? (
                  <form className="procurement-form" onSubmit={createVendor}>
                    <label className="field">
                      <span>Name</span>
                      <input value={vendorForm.name} onChange={(event) => setVendorForm({ ...vendorForm, name: event.target.value })} required />
                    </label>
                    <label className="field">
                      <span>Code</span>
                      <input value={vendorForm.code} onChange={(event) => setVendorForm({ ...vendorForm, code: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Contact</span>
                      <input value={vendorForm.contactPerson} onChange={(event) => setVendorForm({ ...vendorForm, contactPerson: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Phone</span>
                      <input value={vendorForm.phone} onChange={(event) => setVendorForm({ ...vendorForm, phone: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input type="email" value={vendorForm.email} onChange={(event) => setVendorForm({ ...vendorForm, email: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select className="role-select" value={vendorForm.status} onChange={(event) => setVendorForm({ ...vendorForm, status: event.target.value as VendorStatus })}>
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                        <option value="blocked">blocked</option>
                      </select>
                    </label>
                    <div className="procurement-actions">
                      <button className="primary-button" disabled={busy === "create-vendor"} type="submit">
                        {busy === "create-vendor" ? "Creating..." : "Create vendor"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="users-list">
                  {vendorsLoading ? <article className="user-row skeleton-block" /> : null}
                  {!vendorsLoading && vendors.length === 0 ? (
                    <article className="user-row user-row-empty">
                      <strong>No vendors found for this company.</strong>
                    </article>
                  ) : null}
                  {vendors.map((vendor) => (
                    <article className="vendor-row" key={vendor.id}>
                      <div><span>Name</span><strong>{vendor.name}</strong></div>
                      <div><span>Code</span><strong>{vendor.code || "-"}</strong></div>
                      <div><span>Contact</span><strong>{vendor.contactPerson || "-"}</strong></div>
                      <div><span>Phone</span><strong>{vendor.phone || "-"}</strong></div>
                      <div><span>Email</span><strong>{vendor.email || "-"}</strong></div>
                      <div><span>Status</span><strong>{vendor.status}</strong></div>
                      <div><span>Updated</span><strong>{dateTime(vendor.updatedAt)}</strong></div>
                      <div className="procurement-row-actions">
                        {canUpdateVendors ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                              setVendorEditId(vendor.id);
                              setVendorEditForm({
                                name: vendor.name,
                                code: vendor.code ?? "",
                                phone: vendor.phone ?? "",
                                email: vendor.email ?? "",
                                contactPerson: vendor.contactPerson ?? "",
                                status: vendor.status,
                              });
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                      {vendorEditId === vendor.id && canUpdateVendors ? (
                        <form className="procurement-edit-form" onSubmit={(event) => { event.preventDefault(); void saveVendor(vendor.id); }}>
                          <label className="field"><span>Name</span><input value={vendorEditForm.name} onChange={(event) => setVendorEditForm({ ...vendorEditForm, name: event.target.value })} required /></label>
                          <label className="field"><span>Code</span><input value={vendorEditForm.code} onChange={(event) => setVendorEditForm({ ...vendorEditForm, code: event.target.value })} /></label>
                          <label className="field"><span>Status</span><select className="role-select" value={vendorEditForm.status} onChange={(event) => setVendorEditForm({ ...vendorEditForm, status: event.target.value as VendorStatus })}><option value="active">active</option><option value="inactive">inactive</option><option value="blocked">blocked</option></select></label>
                          <div className="procurement-actions">
                            <button className="primary-button" disabled={busy === `vendor-${vendor.id}`} type="submit">{busy === `vendor-${vendor.id}` ? "Saving..." : "Save vendor"}</button>
                            <button className="secondary-button" type="button" onClick={() => setVendorEditId(null)}>Cancel</button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {canReadPurchases ? (
              <section className="procurement-section">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Purchase orders</p>
                    <h2>Order and receiving flow</h2>
                  </div>
                  <span>{orders.length} orders</span>
                </div>

                {canCreatePurchases ? (
                  <form className="procurement-form" onSubmit={createPurchase}>
                    <label className="field">
                      <span>Vendor</span>
                      <select className="role-select" value={purchaseForm.vendorId} onChange={(event) => setPurchaseForm({ ...purchaseForm, vendorId: event.target.value })} required>
                        <option value="">Select vendor</option>
                        {activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Discount</span>
                      <input type="number" min="0" step="0.01" value={purchaseForm.discountAmount} onChange={(event) => setPurchaseForm({ ...purchaseForm, discountAmount: event.target.value })} />
                    </label>
                    <label className="field procurement-wide-field">
                      <span>Notes</span>
                      <input value={purchaseForm.notes} onChange={(event) => setPurchaseForm({ ...purchaseForm, notes: event.target.value })} />
                    </label>
                    <LineItems
                      activeProducts={activeProducts}
                      addLine={() => addLine("create")}
                      busy={productsLoading}
                      changeLine={(index, field, value) => changeLine("create", index, field, value)}
                      items={purchaseForm.items}
                      removeLine={(index) => removeLine("create", index)}
                    />
                    <div className="procurement-actions">
                      <button className="primary-button" disabled={busy === "create-purchase" || activeVendors.length === 0 || activeProducts.length === 0} type="submit">
                        {busy === "create-purchase" ? "Creating..." : "Create draft purchase order"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="users-list">
                  {ordersLoading ? <article className="user-row skeleton-block" /> : null}
                  {!ordersLoading && orders.length === 0 ? (
                    <article className="user-row user-row-empty">
                      <strong>No purchase orders found for this company.</strong>
                    </article>
                  ) : null}
                  {orders.map((order) => {
                    const isDraft = order.status === "draft";
                    const isPendingApproval = order.status === "pending_approval";
                    const isApproved = order.status === "approved";
                    const canReceive = order.status === "ordered";
                    const canCancel =
                      order.status === "draft" ||
                      order.status === "pending_approval" ||
                      order.status === "approved" ||
                      order.status === "rejected" ||
                      order.status === "ordered" ||
                      order.status === "received";

                    return (
                      <article className="purchase-order-row" key={order.id}>
                        <div><span>PO number</span><strong>{order.purchaseOrderNumber}</strong></div>
                        <div><span>Vendor</span><strong>{order.vendorNameSnapshot}</strong></div>
                        <div><span>Status</span><strong>{statusLabel(order.status)}</strong></div>
                        <div><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>
                        <div><span>Discount</span><strong>{money(order.discountAmount)}</strong></div>
                        <div><span>Total</span><strong>{money(order.totalAmount)}</strong></div>
                        <div><span>Items</span><strong>{order.items.length}</strong></div>
                        <div><span>Updated</span><strong>{dateTime(order.updatedAt)}</strong></div>
                        <div className="procurement-row-actions">
                          {canUpdatePurchases && isDraft ? <button className="secondary-button" type="button" onClick={() => { setPurchaseEditId(order.id); setPurchaseEditForm({ vendorId: order.vendorId, discountAmount: String(order.discountAmount ?? 0), notes: order.notes ?? "", items: order.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity), unitCost: String(item.unitCost) })) }); }}>Edit draft</button> : null}
                          {canSubmitPurchases && isDraft ? <button className="secondary-button" disabled={busy === `submit-${order.id}`} type="button" onClick={() => orderAction(order, "submit")}>Submit</button> : null}
                          {canApprovePurchases && isPendingApproval ? <button className="secondary-button" disabled={busy === `approve-${order.id}`} type="button" onClick={() => orderAction(order, "approve")}>Approve</button> : null}
                          {canRejectPurchases && isPendingApproval ? <button className="secondary-button" disabled={busy === `reject-${order.id}`} type="button" onClick={() => orderAction(order, "reject")}>Reject</button> : null}
                          {canUpdatePurchases && isApproved ? <button className="secondary-button" disabled={busy === `ordered-${order.id}`} type="button" onClick={() => orderAction(order, "ordered")}>Mark ordered</button> : null}
                          {canReceivePurchases && canReceive ? <button className="secondary-button" disabled={busy === `receive-${order.id}`} type="button" onClick={() => orderAction(order, "receive")}>Receive</button> : null}
                          {canCancelPurchases && canCancel ? <button className="secondary-button" disabled={busy === `cancel-${order.id}`} type="button" onClick={() => orderAction(order, "cancel")}>Cancel</button> : null}
                        </div>
                        <div className="purchase-items-summary">
                          {order.submittedAt ? <span>Submitted by {order.submittedBy?.name ?? "unknown"} at {dateTime(order.submittedAt)}</span> : null}
                          {order.approvedAt ? <span>Approved by {order.approvedBy?.name ?? "unknown"} at {dateTime(order.approvedAt)}</span> : null}
                          {order.rejectedAt ? <span>Rejected by {order.rejectedBy?.name ?? "unknown"} at {dateTime(order.rejectedAt)}</span> : null}
                          {order.approvalNote ? <span>Approval note: {order.approvalNote}</span> : null}
                          {order.rejectionReason ? <span>Rejection reason: {order.rejectionReason}</span> : null}
                        </div>
                        <div className="purchase-items-summary">
                          {order.items.map((item) => <span key={item.id}>{item.productNameSnapshot} x {item.quantity} at {money(item.unitCost)}</span>)}
                        </div>
                        {purchaseEditId === order.id && canUpdatePurchases && isDraft ? (
                          <form className="procurement-edit-form purchase-edit-form" onSubmit={(event) => { event.preventDefault(); void savePurchase(order.id); }}>
                            <label className="field">
                              <span>Vendor</span>
                              <select className="role-select" value={purchaseEditForm.vendorId} onChange={(event) => setPurchaseEditForm({ ...purchaseEditForm, vendorId: event.target.value })} required>
                                <option value="">Select vendor</option>
                                {activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                              </select>
                            </label>
                            <label className="field">
                              <span>Discount</span>
                              <input type="number" min="0" step="0.01" value={purchaseEditForm.discountAmount} onChange={(event) => setPurchaseEditForm({ ...purchaseEditForm, discountAmount: event.target.value })} />
                            </label>
                            <LineItems
                              activeProducts={activeProducts}
                              addLine={() => addLine("edit")}
                              busy={productsLoading}
                              changeLine={(index, field, value) => changeLine("edit", index, field, value)}
                              items={purchaseEditForm.items}
                              removeLine={(index) => removeLine("edit", index)}
                            />
                            <div className="procurement-actions">
                              <button className="primary-button" disabled={busy === `purchase-${order.id}`} type="submit">Save draft</button>
                              <button className="secondary-button" type="button" onClick={() => setPurchaseEditId(null)}>Cancel</button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function LineItems({
  activeProducts,
  addLine,
  busy,
  changeLine,
  items,
  removeLine,
}: {
  activeProducts: Product[];
  addLine: () => void;
  busy: boolean;
  changeLine: (index: number, field: keyof LineForm, value: string) => void;
  items: LineForm[];
  removeLine: (index: number) => void;
}) {
  return (
    <div className="purchase-items-box">
      <div className="sales-items-header">
        <strong>Line items</strong>
        <button className="secondary-button" disabled={busy || activeProducts.length === 0} onClick={addLine} type="button">
          Add item
        </button>
      </div>
      {items.map((item, index) => (
        <div className="purchase-item-row" key={`${index}-${item.productId || "new"}`}>
          <label className="field">
            <span>Product</span>
            <select className="role-select" value={item.productId} onChange={(event) => changeLine(index, "productId", event.target.value)} required>
              <option value="">Select product</option>
              {activeProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku}) - stock {product.stockQuantity}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quantity</span>
            <input min="1" step="1" type="number" value={item.quantity} onChange={(event) => changeLine(index, "quantity", event.target.value)} required />
          </label>
          <label className="field">
            <span>Unit cost</span>
            <input min="0" step="0.01" type="number" value={item.unitCost} onChange={(event) => changeLine(index, "unitCost", event.target.value)} />
          </label>
          <button className="secondary-button" disabled={items.length === 1} onClick={() => removeLine(index)} type="button">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
