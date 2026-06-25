"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type PosProduct = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  salePrice: number | string;
  stockQuantity: number;
};

type PosSaleItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
};

type PosSale = {
  id: string;
  saleNumber: string;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  status: "completed" | "cancelled";
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  changeAmount: number | string;
  paymentMethod: PaymentMethod;
  paymentAccountId: string | null;
  completedAt: string;
  items: PosSaleItem[];
};

type FinanceAccount = {
  id: string;
  name: string;
  code: string;
  kind: "general" | "cash" | "bank" | "mobile_money";
  status: "active" | "inactive";
  currentBalance: number | string;
};

type PaymentMethod = "cash" | "bank_transfer" | "card" | "cheque" | "mobile_money" | "other";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type CartItem = {
  product: PosProduct;
  quantity: number;
};

const navItems = [
  { label: "Dashboard", permission: "dashboard.read", href: "/dashboard" },
  { label: "Company", permission: "company.read", href: "/dashboard/company" },
  { label: "Products", permission: "products.read", href: "/dashboard/products" },
  { label: "Sales", permission: "sales.read", href: "/dashboard/sales" },
  { label: "POS", permission: "pos.read", href: "/dashboard/pos" },
  { label: "CRM", permission: "crm.read", href: "/dashboard/crm" },
  { label: "Procurement", permission: "purchases.read", href: "/dashboard/procurement" },
  { label: "Finance", permission: "finance.read", href: "/dashboard/finance" },
  { label: "Audit", permission: "audit.read", href: "/dashboard/audit" },
  { label: "Users", permission: "users.read", href: "/dashboard/users" },
  { label: "Roles", permission: "roles.read", href: "/dashboard/roles" },
  { label: "Profile", permission: "profile.read", href: "/dashboard/profile" },
];

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

function money(value: number | string | null | undefined) {
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

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function apiMessage(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function lineTotal(item: CartItem) {
  return Math.round(Number(item.product.salePrice) * item.quantity * 100) / 100;
}

export default function PosDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [recentSales, setRecentSales] = useState<PosSale[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<FinanceAccount[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [lastSale, setLastSale] = useState<PosSale | null>(null);

  const canReadPos = currentUser?.permissions.includes("pos.read") ?? false;
  const canCreatePos = currentUser?.permissions.includes("pos.create") ?? false;
  const canPrintReceipts = currentUser?.permissions.includes("pos.receipts.print") ?? false;
  const canReadFinance = currentUser?.permissions.includes("finance.read") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const subtotal = useMemo(() => Math.round(cart.reduce((sum, item) => sum + lineTotal(item), 0) * 100) / 100, [cart]);
  const discount = Math.max(Number(discountAmount || 0), 0);
  const total = Math.max(Math.round((subtotal - discount) * 100) / 100, 0);
  const paid = paidAmount.trim() === "" ? total : Math.max(Number(paidAmount || 0), 0);
  const change = Math.max(Math.round((paid - total) * 100) / 100, 0);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const user = await getCurrentUser();

        if (!active) return;
        setCurrentUser(user);

        if (!user.permissions.includes("pos.read")) return;

        await Promise.all([
          loadProducts(""),
          loadRecentSales(),
          user.permissions.includes("finance.read") ? loadPaymentAccounts() : Promise.resolve(),
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

  useEffect(() => {
    if (!canReadPos) return;
    const handle = window.setTimeout(() => {
      void loadProducts(search);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [search, canReadPos]);

  async function loadProducts(query: string) {
    setProductsLoading(true);
    setPageError(null);

    try {
      const params = new URLSearchParams({ limit: "24" });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`/api/pos/products?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: PosProduct[] } & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not load POS products."));
      }

      setProducts(payload.data ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load POS products.");
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadRecentSales() {
    setSalesLoading(true);

    try {
      const response = await fetch("/api/pos/sales?take=8", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: PosSale[] } & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not load POS sales."));
      }

      setRecentSales(payload.data ?? []);
    } catch {
      setRecentSales([]);
    } finally {
      setSalesLoading(false);
    }
  }

  async function loadPaymentAccounts() {
    try {
      const response = await fetch("/api/finance/accounts", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { accounts?: FinanceAccount[] };
      const accounts = (payload.accounts ?? []).filter(
        (account) => account.status === "active" && ["cash", "bank", "mobile_money"].includes(account.kind),
      );
      setPaymentAccounts(accounts);
    } catch {
      setPaymentAccounts([]);
    }
  }

  function addToCart(product: PosProduct) {
    setSaleError(null);
    setSaleSuccess(null);
    setLastSale(null);

    if (product.stockQuantity <= 0) {
      setSaleError(`${product.name} is out of stock.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing) {
        return [...current, { product, quantity: 1 }];
      }

      return current.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, product.stockQuantity) }
          : item,
      );
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(Math.max(quantity, 1), item.product.stockQuantity) }
          : item,
      ),
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  async function completeSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaleError(null);
    setSaleSuccess(null);
    setLastSale(null);

    if (cart.length === 0) {
      setSaleError("Add at least one product to complete a POS sale.");
      return;
    }

    if (paid < total) {
      setSaleError("Paid amount must cover the total.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          discountAmount: discount,
          paidAmount: paid,
          paymentMethod,
          paymentAccountId: paymentAccountId || undefined,
          items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: PosSale } & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not complete POS sale."));
      }

      const sale = payload.data;
      setSaleSuccess(`Sale ${sale?.saleNumber ?? ""} completed.`.trim());
      setLastSale(sale ?? null);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscountAmount("0");
      setPaidAmount("");
      await Promise.all([loadProducts(search), loadRecentSales(), canReadFinance ? loadPaymentAccounts() : Promise.resolve()]);
    } catch (error) {
      setSaleError(error instanceof Error ? error.message : "Could not complete POS sale.");
    } finally {
      setSubmitting(false);
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
            <p className="eyebrow">POS</p>
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

        {!canReadPos ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view POS.</h2>
            <p>
              Ask a company administrator to grant <strong>pos.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Cashier workspace</p>
                <h2>Fast product search, cart, payment, and receipt</h2>
                <p>
                  Complete walk-in sales without loading the full catalog. Stock and payment side
                  effects are handled by the POS API.
                </p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button" type="button" onClick={() => loadRecentSales()} disabled={salesLoading}>
                  {salesLoading ? "Refreshing..." : "Refresh sales"}
                </button>
              </div>
            </section>

            {saleError ? <div className="form-error">{saleError}</div> : null}
            {saleSuccess ? <div className="form-success">{saleSuccess}</div> : null}

            <section className="pos-layout">
              <div className="pos-product-panel">
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Products</p>
                    <h2>Search catalog</h2>
                  </div>
                  <span>{productsLoading ? "Loading..." : `${products.length} shown`}</span>
                </div>

                <label className="field pos-search-field">
                  <span>Search by SKU, name, or category</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Start typing to search"
                  />
                </label>

                <div className="pos-product-grid">
                  {products.length === 0 ? (
                    <article className="empty-state pos-empty">
                      <strong>No products found.</strong>
                      <span>Try another search term or add active products first.</span>
                    </article>
                  ) : (
                    products.map((product) => (
                      <button
                        className="pos-product-card"
                        disabled={!canCreatePos || product.stockQuantity <= 0}
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                      >
                        <span>{product.sku}</span>
                        <strong>{product.name}</strong>
                        <small>{product.category ?? "Uncategorized"}</small>
                        <b>{money(product.salePrice)}</b>
                        <em>{product.stockQuantity} in stock</em>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <form className="pos-cart-panel" onSubmit={completeSale}>
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">Cart</p>
                    <h2>Current sale</h2>
                  </div>
                  <span>{cart.length} items</span>
                </div>

                <div className="pos-cart-list">
                  {cart.length === 0 ? (
                    <article className="empty-state pos-empty">
                      <strong>Cart is empty.</strong>
                      <span>Add products from the search panel.</span>
                    </article>
                  ) : (
                    cart.map((item) => (
                      <article className="pos-cart-row" key={item.product.id}>
                        <div>
                          <span>{item.product.sku}</span>
                          <strong>{item.product.name}</strong>
                          <small>{money(item.product.salePrice)} each</small>
                        </div>
                        <label>
                          <span>Qty</span>
                          <input
                            min="1"
                            max={item.product.stockQuantity}
                            step="1"
                            type="number"
                            value={item.quantity}
                            onChange={(event) => updateQuantity(item.product.id, Number.parseInt(event.target.value, 10) || 1)}
                          />
                        </label>
                        <strong>{money(lineTotal(item))}</strong>
                        <button className="secondary-button" type="button" onClick={() => removeFromCart(item.product.id)}>
                          Remove
                        </button>
                      </article>
                    ))
                  )}
                </div>

                <div className="pos-payment-grid">
                  <label className="field">
                    <span>Customer name</span>
                    <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Discount</span>
                    <input min="0" step="0.01" type="number" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Payment method</span>
                    <select className="role-select" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canReadFinance && paymentAccounts.length > 0 ? (
                    <label className="field">
                      <span>Payment account</span>
                      <select className="role-select" value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}>
                        <option value="">No linked account</option>
                        {paymentAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name} ({account.kind})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Paid amount</span>
                    <input
                      min="0"
                      placeholder={total > 0 ? `Exact: ${total}` : "0.00"}
                      step="0.01"
                      type="number"
                      value={paidAmount}
                      onChange={(event) => setPaidAmount(event.target.value)}
                    />
                  </label>
                </div>

                <div className="pos-total-box">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Discount</span>
                    <strong>{money(discount)}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <div>
                    <span>Change</span>
                    <strong>{money(change)}</strong>
                  </div>
                </div>

                <div className="pos-cart-actions">
                  <button className="secondary-button" type="button" onClick={() => setCart([])} disabled={cart.length === 0 || submitting}>
                    Clear
                  </button>
                  <button className="primary-button" type="submit" disabled={!canCreatePos || cart.length === 0 || submitting || paid < total}>
                    {submitting ? "Completing..." : "Complete sale"}
                  </button>
                </div>

                {lastSale && canPrintReceipts ? (
                  <a className="pos-receipt-link" href={`/api/pos/sales/${lastSale.id}/receipt`} target="_blank" rel="noreferrer">
                    Print receipt for {lastSale.saleNumber}
                  </a>
                ) : null}
              </form>
            </section>

            <section className="pos-recent-panel" aria-label="Recent POS sales">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Recent sales</p>
                  <h2>Latest POS receipts</h2>
                </div>
              </div>
              <div className="pos-recent-list">
                {recentSales.length === 0 ? (
                  <article className="empty-state pos-empty">
                    <strong>No POS sales yet.</strong>
                    <span>Completed sales will appear here.</span>
                  </article>
                ) : (
                  recentSales.map((sale) => (
                    <article className="pos-recent-row" key={sale.id}>
                      <div>
                        <span>Receipt</span>
                        <strong>{sale.saleNumber}</strong>
                      </div>
                      <div>
                        <span>Customer</span>
                        <strong>{sale.customerNameSnapshot ?? "Walk-in"}</strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>{money(sale.totalAmount)}</strong>
                      </div>
                      <div>
                        <span>Completed</span>
                        <strong>{dateTime(sale.completedAt)}</strong>
                      </div>
                      {canPrintReceipts ? (
                        <a className="secondary-button" href={`/api/pos/sales/${sale.id}/receipt`} target="_blank" rel="noreferrer">
                          Receipt
                        </a>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
