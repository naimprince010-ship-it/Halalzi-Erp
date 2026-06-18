"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";
import { downloadCsvExport } from "@/lib/export/export-client";

type ProductStatus = "active" | "inactive";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  salePrice: number | string;
  costPrice: number | string | null;
  stockQuantity: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};

type ProductsResponse = {
  products: Product[];
};

type ProductResponse = {
  product: Product;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
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

function duplicateSkuMessage() {
  return "SKU already exists for your company. Please use a different SKU.";
}

export default function ProductsDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [archivingProductId, setArchivingProductId] = useState<string | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    sku: "",
    category: "",
    salePrice: "0",
    costPrice: "",
    stockQuantity: "0",
    status: "active" as ProductStatus,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    category: "",
    salePrice: "0",
    costPrice: "",
    stockQuantity: "0",
    status: "active" as ProductStatus,
  });

  const canReadProducts = currentUser?.permissions.includes("products.read") ?? false;
  const canCreateProducts = currentUser?.permissions.includes("products.create") ?? false;
  const canUpdateProducts = currentUser?.permissions.includes("products.update") ?? false;
  const canDeleteProducts = currentUser?.permissions.includes("products.delete") ?? false;
  const canAdjustInventory = currentUser?.permissions.includes("inventory.adjust") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);

    try {
      await downloadCsvExport("/api/exports/products");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function loadProducts() {
    setProductsLoading(true);
    setPageError(null);

    try {
      const response = await fetch("/api/products", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<ProductsResponse> & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not load products. Please try again.");
      }

      setProducts(payload.products ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load products. Please try again.");
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

        if (!user.permissions.includes("products.read")) {
          return;
        }

        await loadProducts();
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
          setProductsLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  function normalizeApiErrorMessage(responseStatus: number, payload: ApiErrorPayload, fallback: string) {
    const message = payload.error?.message ?? fallback;

    if (
      responseStatus === 409 ||
      message.toLowerCase().includes("sku already") ||
      message.toLowerCase().includes("sku")
    ) {
      return duplicateSkuMessage();
    }

    return message;
  }

  async function handleCreateProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setEditError(null);
    setEditSuccess(null);
    setArchiveError(null);
    setArchiveSuccess(null);

    setCreating(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          sku: createForm.sku,
          category: createForm.category.trim() ? createForm.category : undefined,
          salePrice: Number(createForm.salePrice),
          costPrice: createForm.costPrice.trim() ? Number(createForm.costPrice) : undefined,
          stockQuantity: Number.parseInt(createForm.stockQuantity, 10),
          status: createForm.status,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<ProductResponse> & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiErrorMessage(response.status, payload, "Could not create product. Please try again."));
      }

      setCreateSuccess(`${payload.product?.name ?? "Product"} created successfully.`);
      setCreateForm({
        name: "",
        sku: "",
        category: "",
        salePrice: "0",
        costPrice: "",
        stockQuantity: "0",
        status: "active",
      });
      await loadProducts();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create product. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(product: Product) {
    setEditTargetId(product.id);
    setEditForm({
      name: product.name,
      sku: product.sku,
      category: product.category ?? "",
      salePrice: String(product.salePrice),
      costPrice: product.costPrice === null ? "" : String(product.costPrice),
      stockQuantity: String(product.stockQuantity),
      status: product.status,
    });
    setEditError(null);
    setEditSuccess(null);
    setArchiveError(null);
    setArchiveSuccess(null);
  }

  function cancelEdit() {
    setEditTargetId(null);
    setEditForm({
      name: "",
      sku: "",
      category: "",
      salePrice: "0",
      costPrice: "",
      stockQuantity: "0",
      status: "active",
    });
  }

  async function handleEditProduct(productId: string) {
    setEditError(null);
    setEditSuccess(null);
    setCreateError(null);
    setCreateSuccess(null);
    setArchiveError(null);
    setArchiveSuccess(null);

    setEditingProductId(productId);

    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        sku: editForm.sku,
        category: editForm.category.trim() ? editForm.category : null,
        salePrice: Number(editForm.salePrice),
        costPrice: editForm.costPrice.trim() ? Number(editForm.costPrice) : null,
        status: editForm.status,
      };

      if (canAdjustInventory) {
        body.stockQuantity = Number.parseInt(editForm.stockQuantity, 10);
      }

      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<ProductResponse> & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(normalizeApiErrorMessage(response.status, payload, "Could not update product. Please try again."));
      }

      setEditSuccess(`${payload.product?.name ?? "Product"} updated successfully.`);
      cancelEdit();
      await loadProducts();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update product. Please try again.");
    } finally {
      setEditingProductId(null);
    }
  }

  async function handleArchiveProduct(product: Product) {
    setArchiveError(null);
    setArchiveSuccess(null);
    setCreateError(null);
    setCreateSuccess(null);
    setEditError(null);
    setEditSuccess(null);

    const confirmed = window.confirm(`Archive ${product.name}? This sets status to inactive.`);
    if (!confirmed) {
      return;
    }

    setArchivingProductId(product.id);

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<ProductResponse> & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not archive product. Please try again.");
      }

      setArchiveSuccess(`${payload.product?.name ?? "Product"} archived successfully.`);
      await loadProducts();
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Could not archive product. Please try again.");
    } finally {
      setArchivingProductId(null);
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
            <p className="eyebrow">Products</p>
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

        {!canReadProducts ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view products.</h2>
            <p>
              Ask a company administrator to grant <strong>products.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Product catalog</p>
                <h2>Manage products and stock visibility</h2>
                <p>
                  Track product profile, commercial pricing, stock quantity, and archive status in
                  your company workspace.
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
            {archiveError ? <div className="form-error">{archiveError}</div> : null}
            {archiveSuccess ? <div className="form-success">{archiveSuccess}</div> : null}

            {canCreateProducts ? (
              <section className="users-create-panel" aria-label="Create product panel">
                <p className="eyebrow">Create product</p>
                <h2>Add new product</h2>

                <form className="products-create-form" onSubmit={handleCreateProduct}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={createForm.name}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>SKU</span>
                    <input
                      value={createForm.sku}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, sku: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Category</span>
                    <input
                      value={createForm.category}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, category: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Sale price</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.salePrice}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, salePrice: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Cost price</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.costPrice}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, costPrice: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Stock quantity</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={createForm.stockQuantity}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, stockQuantity: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="role-select"
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          status: event.target.value as ProductStatus,
                        }))
                      }
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </label>

                  <div className="products-create-actions">
                    <button className="primary-button" type="submit" disabled={creating}>
                      {creating ? "Creating..." : "Create product"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {productsLoading ? (
              <section className="users-list" aria-label="Products loading">
                <article className="user-row skeleton-block" />
                <article className="user-row skeleton-block" />
              </section>
            ) : (
              <section className="users-list" aria-label="Products list">
                {products.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No products found for this company.</strong>
                  </article>
                ) : (
                  products.map((product) => (
                    <article className="product-row" key={product.id}>
                      <div>
                        <span>Name</span>
                        <strong>{product.name}</strong>
                      </div>
                      <div>
                        <span>SKU</span>
                        <strong>{product.sku}</strong>
                      </div>
                      <div>
                        <span>Category</span>
                        <strong>{product.category || "-"}</strong>
                      </div>
                      <div>
                        <span>Sale price</span>
                        <strong>{formatMoney(product.salePrice)}</strong>
                      </div>
                      <div>
                        <span>Cost price</span>
                        <strong>{formatMoney(product.costPrice)}</strong>
                      </div>
                      <div>
                        <span>Stock</span>
                        <strong>{product.stockQuantity}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{product.status}</strong>
                      </div>
                      <div>
                        <span>Updated</span>
                        <strong>{formatDate(product.updatedAt)}</strong>
                      </div>

                      <div className="product-row-actions">
                        {canUpdateProducts ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => startEdit(product)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDeleteProducts ? (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={archivingProductId === product.id || product.status === "inactive"}
                            onClick={() => handleArchiveProduct(product)}
                          >
                            {archivingProductId === product.id ? "Archiving..." : "Archive"}
                          </button>
                        ) : null}
                      </div>

                      {editTargetId === product.id && canUpdateProducts ? (
                        <form
                          className="product-edit-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleEditProduct(product.id);
                          }}
                        >
                          <label className="field">
                            <span>Name</span>
                            <input
                              value={editForm.name}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, name: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="field">
                            <span>SKU</span>
                            <input
                              value={editForm.sku}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, sku: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="field">
                            <span>Category</span>
                            <input
                              value={editForm.category}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, category: event.target.value }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Sale price</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editForm.salePrice}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, salePrice: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="field">
                            <span>Cost price</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editForm.costPrice}
                              onChange={(event) =>
                                setEditForm((current) => ({ ...current, costPrice: event.target.value }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Status</span>
                            <select
                              className="role-select"
                              value={editForm.status}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  status: event.target.value as ProductStatus,
                                }))
                              }
                            >
                              <option value="active">active</option>
                              <option value="inactive">inactive</option>
                            </select>
                          </label>

                          {canAdjustInventory ? (
                            <label className="field">
                              <span>Stock quantity</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={editForm.stockQuantity}
                                onChange={(event) =>
                                  setEditForm((current) => ({
                                    ...current,
                                    stockQuantity: event.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                          ) : (
                            <div className="field products-readonly-note">
                              <span>Stock quantity</span>
                              <strong>{product.stockQuantity}</strong>
                              <small>
                                Stock changes need <strong>inventory.adjust</strong> permission.
                              </small>
                            </div>
                          )}

                          <div className="product-edit-actions">
                            <button
                              className="primary-button"
                              type="submit"
                              disabled={editingProductId === product.id}
                            >
                              {editingProductId === product.id ? "Saving..." : "Save"}
                            </button>
                            <button className="secondary-button" type="button" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

