"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

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

export default function ProfileDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
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

  const canReadProfile = currentUser?.permissions.includes("profile.read") ?? false;

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
            <p className="eyebrow">Profile</p>
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

        {!canReadProfile ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view profile details.</h2>
            <p>
              Ask a company administrator to grant <strong>profile.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">User profile</p>
                <h2>Account and workspace details</h2>
                <p>
                  This panel shows your current user information, company scope, assigned roles,
                  and permission visibility.
                </p>
              </div>
            </section>

            <section className="company-details-grid" aria-label="Profile details">
              <article className="detail-card">
                <span>User name</span>
                <strong>{currentUser.user.name}</strong>
              </article>
              <article className="detail-card">
                <span>User email</span>
                <strong>{currentUser.user.email}</strong>
              </article>
              <article className="detail-card">
                <span>User status</span>
                <strong>{currentUser.user.status}</strong>
              </article>
              <article className="detail-card">
                <span>Company name</span>
                <strong>{currentUser.company.name}</strong>
              </article>
              <article className="detail-card">
                <span>Company slug</span>
                <strong>{currentUser.company.slug}</strong>
              </article>
              <article className="detail-card">
                <span>Permission count</span>
                <strong>{currentUser.permissions.length}</strong>
              </article>
              <article className="detail-card detail-card-wide">
                <span>Roles</span>
                <div className="role-list" aria-label="Current user roles">
                  {currentUser.roles.map((role) => (
                    <span className="role-pill" key={role}>
                      {role}
                    </span>
                  ))}
                </div>
              </article>
              <article className="detail-card detail-card-wide">
                <span>Permissions</span>
                <div className="role-list" aria-label="Current user permissions">
                  {currentUser.permissions.map((permission) => (
                    <span className="role-pill" key={permission}>
                      {permission}
                    </span>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

