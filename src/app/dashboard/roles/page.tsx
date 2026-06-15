"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type RolePermission = {
  id: string;
  key: string;
  description: string | null;
};

type CompanyRole = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  createdAt: string;
  permissions: RolePermission[];
};

type RolesResponse = {
  roles: CompanyRole[];
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

export default function RolesDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);

  async function loadRoles() {
    setRolesLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/roles", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<RolesResponse>;

      if (!response.ok) {
        throw new Error("Could not load roles. Please try again.");
      }

      setRoles(payload.roles ?? []);
    } catch {
      setError("Could not load roles. Please try again.");
    } finally {
      setRolesLoading(false);
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

        if (!user.permissions.includes("roles.read")) {
          return;
        }

        await loadRoles();
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRolesLoading(false);
        }
      }
    }

    loadPage();

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

  const canReadRoles = currentUser?.permissions.includes("roles.read") ?? false;

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
            <p className="eyebrow">Roles</p>
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

        {!canReadRoles ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view roles.</h2>
            <p>
              Ask a company administrator to grant <strong>roles.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Company roles</p>
                <h2>Role and permission visibility</h2>
                <p>
                  This list shows role definitions and their assigned permissions within your
                  company workspace.
                </p>
              </div>
            </section>

            {rolesLoading ? (
              <section className="users-list" aria-label="Roles list loading">
                <article className="user-row skeleton-block" />
                <article className="user-row skeleton-block" />
              </section>
            ) : (
              <section className="users-list" aria-label="Company roles list">
                {roles.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No roles found for this company.</strong>
                  </article>
                ) : (
                  roles.map((role) => (
                    <article className="detail-card" key={role.id}>
                      <span>Role</span>
                      <strong>{role.name}</strong>
                      <span>Key</span>
                      <strong>{role.key}</strong>
                      {role.description ? (
                        <>
                          <span>Description</span>
                          <strong>{role.description}</strong>
                        </>
                      ) : null}
                      <span>Permission count</span>
                      <strong>{role.permissions.length}</strong>
                      <span>Created</span>
                      <strong>{formatDate(role.createdAt)}</strong>
                      <span>Permissions</span>
                      <div className="role-list" aria-label={`Permissions for ${role.name}`}>
                        {role.permissions.length === 0 ? (
                          <span className="role-pill">No permissions</span>
                        ) : (
                          role.permissions.map((permission) => (
                            <span className="role-pill" key={permission.id}>
                              {permission.key}
                            </span>
                          ))
                        )}
                      </div>
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

