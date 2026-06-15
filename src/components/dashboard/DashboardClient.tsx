"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type DashboardSummary = {
  users: number | null;
  products: { active: number; lowStock: number } | null;
  sales: { draft: number; confirmed: number } | null;
  procurement: { draft: number; ordered: number } | null;
  finance: { activeAccounts: number; openReceivables: number; openPayables: number } | null;
};

type DashboardSummaryResponse = {
  summary?: DashboardSummary;
  error?: { message?: string };
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

function numberValue(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString();
}

function money(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((user) => {
        if (active) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (active) {
          router.replace("/login");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const visibleNav = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.permissions.includes("dashboard.read")) {
      return;
    }

    let active = true;

    async function loadSummary() {
      setSummaryLoading(true);

      try {
        const response = await fetch("/api/dashboard/summary", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as DashboardSummaryResponse;

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Could not load dashboard summary.");
        }

        if (active) {
          setSummary(payload.summary ?? null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load dashboard summary.");
        }
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [currentUser]);

  async function handleLogout() {
    setError(null);

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
            <p className="eyebrow">Workspace</p>
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
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>Operational workspace overview</h2>
            <p>
              Track the current state of users, products, sales, procurement, and finance from one
              tenant-scoped command center.
            </p>
          </div>
        </section>
        <section className="dashboard-grid" aria-label="Workspace summary">
          <article className="stat-tile">
            <span>Company status</span>
            <strong>{currentUser.company.status}</strong>
          </article>
          <article className="stat-tile">
            <span>Your role</span>
            <strong>{currentUser.roles.join(", ")}</strong>
          </article>
          <article className="stat-tile">
            <span>Permissions</span>
            <strong>{currentUser.permissions.length}</strong>
          </article>
        </section>
        <section className="operations-overview" aria-label="Operational summary">
          <article className="overview-card">
            <span>Users</span>
            <strong>{summaryLoading ? "Loading..." : numberValue(summary?.users)}</strong>
            <small>Company users visible to your role</small>
          </article>
          <article className="overview-card">
            <span>Products</span>
            <strong>{summaryLoading ? "Loading..." : numberValue(summary?.products?.active)}</strong>
            <small>{summary?.products ? `${summary.products.lowStock} low stock` : "Requires products.read"}</small>
          </article>
          <article className="overview-card">
            <span>Sales</span>
            <strong>{summaryLoading ? "Loading..." : `${numberValue(summary?.sales?.draft)} draft`}</strong>
            <small>{summary?.sales ? `${summary.sales.confirmed} confirmed` : "Requires sales.read"}</small>
          </article>
          <article className="overview-card">
            <span>Procurement</span>
            <strong>{summaryLoading ? "Loading..." : `${numberValue(summary?.procurement?.draft)} draft`}</strong>
            <small>
              {summary?.procurement ? `${summary.procurement.ordered} ordered` : "Requires purchases.read"}
            </small>
          </article>
          <article className="overview-card overview-card-wide">
            <span>Open receivables</span>
            <strong>{summaryLoading ? "Loading..." : money(summary?.finance?.openReceivables)}</strong>
            <small>{summary?.finance ? `${summary.finance.activeAccounts} active accounts` : "Requires finance.read"}</small>
          </article>
          <article className="overview-card overview-card-wide">
            <span>Open payables</span>
            <strong>{summaryLoading ? "Loading..." : money(summary?.finance?.openPayables)}</strong>
            <small>Outstanding supplier payments</small>
          </article>
        </section>
        <section className="module-section">
          <h2>Available sections</h2>
          <div className="module-grid">
            {visibleNav.map((item) => (
              <Link className="module-card" href={item.href} key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.permission}</span>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}


