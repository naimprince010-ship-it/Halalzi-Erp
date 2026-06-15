"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type UserRole = {
  id: string;
  name: string;
  key: string;
};

type AvailableRole = {
  id: string;
  name: string;
  key: string;
  permissions: { id: string; key: string }[];
};

type CompanyUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  roles: UserRole[];
};

type UsersResponse = {
  users: CompanyUser[];
};

type CreateUserResponse = {
  user: CompanyUser;
};

type UpdateUserStatusResponse = {
  user: CompanyUser;
};

type AssignRoleResponse = {
  user: CompanyUser;
};

type EditUserInfoResponse = {
  user: CompanyUser;
};

type ApiErrorPayload = {
  error?: {
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

export default function UsersDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);
  const [assigningRoleUserId, setAssigningRoleUserId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    temporaryPassword: "",
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  async function loadUsers() {
    setUsersLoading(true);

    try {
      const response = await fetch("/api/users", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<UsersResponse>;

      if (!response.ok) {
        throw new Error("Could not load users. Please try again.");
      }

      setUsers(payload.users ?? []);
    } catch {
      setError("Could not load users. Please try again.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const response = await fetch("/api/roles", { method: "GET", cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<{ roles: AvailableRole[] }>;
      if (response.ok) {
        setAvailableRoles(payload.roles ?? []);
      }
    } catch {
      // silently ignore — role selector will be empty
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

        if (!user.permissions.includes("users.read")) {
          return;
        }

        await loadUsers();

        if (user.permissions.includes("roles.assign")) {
          await loadRoles();
        }
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setUsersLoading(false);
          setLoading(false);
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

  const canReadUsers = currentUser?.permissions.includes("users.read") ?? false;
  const canCreateUsers = currentUser?.permissions.includes("users.create") ?? false;
  const canAssignRoles = currentUser?.permissions.includes("roles.assign") ?? false;
  const canUpdateUsers = currentUser?.permissions.includes("users.update") ?? false;

  function updateCreateField(
    field: "name" | "email" | "temporaryPassword",
    value: string,
  ) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    setCreating(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createForm),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<CreateUserResponse> &
        ApiErrorPayload;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not create user. Please try again.");
      }

      setCreateForm({
        name: "",
        email: "",
        temporaryPassword: "",
      });
      setCreateSuccess(`User ${payload.user?.email ?? "account"} created successfully.`);
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create user. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(user: CompanyUser, status: "active" | "disabled") {
    setStatusError(null);
    setStatusSuccess(null);
    setUpdatingUserId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | Partial<UpdateUserStatusResponse>
        | ApiErrorPayload;

      if (!response.ok) {
        throw new Error(
          (payload as ApiErrorPayload).error?.message ??
            "Could not update user status. Please try again.",
        );
      }

      setStatusSuccess(
        `${(payload as UpdateUserStatusResponse).user?.email ?? "User"} marked as ${status}.`,
      );
      await loadUsers();
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Could not update user status. Please try again.",
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleRoleChange(user: CompanyUser, roleId: string) {
    setRoleError(null);
    setRoleSuccess(null);
    setAssigningRoleUserId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | Partial<AssignRoleResponse>
        | ApiErrorPayload;

      if (!response.ok) {
        throw new Error(
          (payload as ApiErrorPayload).error?.message ?? "Could not assign role. Please try again.",
        );
      }

      setRoleSuccess(
        `Role updated for ${(payload as AssignRoleResponse).user?.name ?? "user"}.`,
      );
      setSelectedRoleId((prev) => ({ ...prev, [user.id]: "" }));
      await loadUsers();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Could not assign role. Please try again.");
    } finally {
      setAssigningRoleUserId(null);
    }
  }

  async function handleEditUser(user: CompanyUser) {
    setEditError(null);
    setEditSuccess(null);
    setEditingUserId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name || undefined,
          email: editForm.email || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | Partial<EditUserInfoResponse>
        | ApiErrorPayload;

      if (!response.ok) {
        throw new Error(
          (payload as ApiErrorPayload).error?.message ?? "Could not update user. Please try again.",
        );
      }

      setEditSuccess(
        `${(payload as EditUserInfoResponse).user?.name ?? "User"} updated successfully.`,
      );
      setEditForm({ name: "", email: "" });
      await loadUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update user. Please try again.");
    } finally {
      setEditingUserId(null);
    }
  }

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
            <p className="eyebrow">Users</p>
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
        {statusError ? <div className="form-error">{statusError}</div> : null}
        {statusSuccess ? <div className="form-success">{statusSuccess}</div> : null}
        {roleError ? <div className="form-error">{roleError}</div> : null}
        {roleSuccess ? <div className="form-success">{roleSuccess}</div> : null}
        {editError ? <div className="form-error">{editError}</div> : null}
        {editSuccess ? <div className="form-success">{editSuccess}</div> : null}

        {!canReadUsers ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>You do not have permission to view users.</h2>
            <p>
              Ask a company administrator to grant <strong>users.read</strong> to your role.
            </p>
          </section>
        ) : (
          <>
            {canCreateUsers ? (
              <section className="users-create-panel" aria-label="Create user panel">
                <p className="eyebrow">Create user</p>
                <h2>Add staff user</h2>
                <form className="users-create-form" onSubmit={handleCreateUser}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={createForm.name}
                      onChange={(event) => updateCreateField("name", event.target.value)}
                      placeholder="Staff User"
                      minLength={2}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      value={createForm.email}
                      onChange={(event) => updateCreateField("email", event.target.value)}
                      type="email"
                      placeholder="staff@example.com"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Temporary password</span>
                    <input
                      value={createForm.temporaryPassword}
                      onChange={(event) => updateCreateField("temporaryPassword", event.target.value)}
                      type="password"
                      minLength={8}
                      required
                    />
                  </label>
                  <div className="users-create-actions">
                    <button className="primary-button" disabled={creating} type="submit">
                      {creating ? "Creating user..." : "Create user"}
                    </button>
                  </div>
                </form>
                {createError ? <div className="form-error">{createError}</div> : null}
                {createSuccess ? <div className="form-success">{createSuccess}</div> : null}
              </section>
            ) : null}

            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Company users</p>
                <h2>User directory</h2>
                <p>
                  This list is scoped to your company workspace and includes active account details
                  for administration.
                </p>
              </div>
            </section>

            {usersLoading ? (
              <section className="users-list" aria-label="Users list loading">
                <article className="user-row skeleton-block" />
                <article className="user-row skeleton-block" />
                <article className="user-row skeleton-block" />
              </section>
            ) : (
              <section className="users-list" aria-label="Company users list">
                {users.length === 0 ? (
                  <article className="user-row user-row-empty">
                    <strong>No users found for this company.</strong>
                  </article>
                ) : (
                  users.map((user) => (
                    <article className="user-row" key={user.id}>
                      <div>
                        <span>Name</span>
                        <strong>{user.name}</strong>
                      </div>
                      <div>
                        <span>Email</span>
                        <strong>{user.email}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{user.status}</strong>
                      </div>
                      <div>
                        <span>Created</span>
                        <strong>{formatDate(user.createdAt)}</strong>
                      </div>
                      <div className="user-row-actions">
                        {canUpdateUsers ? (
                          <button
                            className="secondary-button"
                            disabled={editingUserId === user.id}
                            type="button"
                            onClick={() => {
                              setEditingUserId(user.id);
                              setEditForm({ name: user.name, email: user.email });
                            }}
                          >
                            {editingUserId === user.id ? "Editing..." : "Edit"}
                          </button>
                        ) : null}
                        {user.status === "active" ? (
                          <button
                            className="secondary-button"
                            disabled={updatingUserId === user.id || user.id === currentUser.user.id}
                            type="button"
                            onClick={() => handleStatusChange(user, "disabled")}
                          >
                            {updatingUserId === user.id ? "Updating..." : "Disable"}
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            disabled={updatingUserId === user.id}
                            type="button"
                            onClick={() => handleStatusChange(user, "active")}
                          >
                            {updatingUserId === user.id ? "Updating..." : "Enable"}
                          </button>
                        )}
                      </div>
                      <div className="user-row-extra">
                        <span>Roles:</span>
                        <div className="role-list">
                          {user.roles.length > 0 ? (
                            user.roles.map((r) => (
                              <span className="role-pill" key={r.id}>
                                {r.name}
                              </span>
                            ))
                          ) : (
                            <span className="role-pill">No role</span>
                          )}
                        </div>
                        {canAssignRoles && availableRoles.length > 0 ? (
                          <>
                            <select
                              aria-label={`Select role for ${user.name}`}
                              className="role-select"
                              disabled={assigningRoleUserId === user.id}
                              value={selectedRoleId[user.id] ?? ""}
                              onChange={(event) =>
                                setSelectedRoleId((prev) => ({
                                  ...prev,
                                  [user.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Change role…</option>
                              {availableRoles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="secondary-button"
                              disabled={
                                !selectedRoleId[user.id] ||
                                assigningRoleUserId === user.id ||
                                (user.id === currentUser.user.id &&
                                  !availableRoles
                                    .find((r) => r.id === selectedRoleId[user.id])
                                    ?.permissions.some((p) => p.key === "roles.assign"))
                              }
                              type="button"
                              onClick={() => {
                                const rid = selectedRoleId[user.id];
                                if (rid) handleRoleChange(user, rid);
                              }}
                            >
                              {assigningRoleUserId === user.id ? "Assigning…" : "Assign"}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {editingUserId === user.id ? (
                        <div className="user-edit-form">
                          <label className="field">
                            <span>Name</span>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                              minLength={2}
                              maxLength={80}
                            />
                          </label>
                          <label className="field">
                            <span>Email</span>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, email: event.target.value }))
                              }
                              maxLength={255}
                            />
                          </label>
                          <div className="user-edit-actions">
                            <button
                              className="primary-button"
                              disabled={
                                !editForm.name.trim() ||
                                !editForm.email.trim() ||
                                (editForm.name === user.name && editForm.email === user.email)
                              }
                              type="button"
                              onClick={() => handleEditUser(user)}
                            >
                              Save
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => setEditingUserId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
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


