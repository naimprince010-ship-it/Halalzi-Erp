"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";
import { downloadCsvExport } from "@/lib/export/export-client";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: unknown;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type ApiErrorPayload = {
  error?: { message?: string };
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

export default function AuditDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReadAudit = currentUser?.permissions.includes("audit.read") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  async function loadAuditLogs() {
    setLogsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/audit-logs", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { auditLogs?: AuditLog[] } & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(message(payload, "Could not load audit logs."));
      }

      setAuditLogs(payload.auditLogs ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load audit logs.");
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const user = await getCurrentUser();
        if (!active) return;

        setCurrentUser(user);

        if (user.permissions.includes("audit.read")) {
          await loadAuditLogs();
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

  async function handleLogout() {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log out. Please try again.");
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      await downloadCsvExport("/api/exports/audit-logs");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export audit logs.");
    } finally {
      setExporting(false);
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
            <p className="eyebrow">Audit</p>
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

        {!canReadAudit ? (
          <section className="access-panel" role="alert">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view audit logs.</h2>
            <p>
              Ask a company administrator to grant <strong>audit.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Audit trail</p>
                <h2>Company activity log</h2>
                <p>Review recent security and operational activity for this company workspace.</p>
              </div>
            </section>

            <section className="dashboard-grid" aria-label="Audit summary">
              <article className="stat-tile">
                <span>Visible logs</span>
                <strong>{auditLogs.length}</strong>
              </article>
              <article className="stat-tile">
                <span>Latest activity</span>
                <strong>{auditLogs[0] ? dateTime(auditLogs[0].createdAt) : "-"}</strong>
              </article>
              <article className="stat-tile">
                <span>Scope</span>
                <strong>Company</strong>
              </article>
            </section>

            <section className="audit-section">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Recent activity</p>
                  <h2>Last 100 events</h2>
                </div>
                <div className="section-actions">
                  <button className="secondary-button" type="button" onClick={handleExport} disabled={exporting}>
                    {exporting ? "Exporting..." : "Export CSV"}
                  </button>
                  <button className="secondary-button" type="button" onClick={loadAuditLogs} disabled={logsLoading}>
                    {logsLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="users-list">
                {logsLoading ? <article className="user-row skeleton-block" /> : null}
                {!logsLoading && auditLogs.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No audit events have been recorded yet.</strong>
                    <span>Future create, update, status, and security events can be written here.</span>
                  </article>
                ) : null}
                {auditLogs.map((log) => (
                  <article className="audit-row" key={log.id}>
                    <div>
                      <span>Time</span>
                      <strong>{dateTime(log.createdAt)}</strong>
                    </div>
                    <div>
                      <span>Action</span>
                      <strong>{log.action}</strong>
                    </div>
                    <div>
                      <span>Entity</span>
                      <strong>{log.entityType}</strong>
                    </div>
                    <div>
                      <span>User</span>
                      <strong>{log.user ? log.user.name : "System"}</strong>
                    </div>
                    <div className="audit-summary">
                      <span>Summary</span>
                      <strong>{log.summary}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
