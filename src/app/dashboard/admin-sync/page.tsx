"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, type CurrentUserResponse } from "@/lib/api/auth-client";

type SyncResult = {
  ok: boolean;
  permissionCount: number;
  adminPermissionCount: number;
  posPermissions: string[];
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

export default function AdminSyncPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        if (active) router.replace("/login");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function syncPermissions() {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/sync-permissions", {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<SyncResult> & ApiErrorPayload;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not sync permissions.");
      }

      setResult({
        ok: Boolean(payload.ok),
        permissionCount: payload.permissionCount ?? 0,
        adminPermissionCount: payload.adminPermissionCount ?? 0,
        posPermissions: payload.posPermissions ?? [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sync permissions.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-main">
        <div className="topbar skeleton-line" />
      </main>
    );
  }

  if (!currentUser) return null;

  const canSync = currentUser.permissions.includes("roles.update");

  return (
    <main className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin maintenance</p>
          <h1>Sync default permissions</h1>
        </div>
        <Link className="secondary-button" href="/dashboard/pos">
          Back to POS
        </Link>
      </header>

      <section className="access-panel">
        <p className="eyebrow">Permission repair</p>
        <h2>Repair Admin role permissions for {currentUser.company.name}</h2>
        <p>
          This syncs the current codebase permission list into the database and attaches the Admin
          role to the current user. It does not change passwords.
        </p>

        {!canSync ? (
          <div className="form-error">You need roles.update permission to run this sync.</div>
        ) : (
          <button className="primary-button" type="button" onClick={syncPermissions} disabled={busy}>
            {busy ? "Syncing..." : "Sync permissions"}
          </button>
        )}

        {error ? <div className="form-error">{error}</div> : null}
        {result ? (
          <div className="form-success">
            Synced {result.permissionCount} permissions. Admin now has {result.adminPermissionCount} permissions.
            POS permissions: {result.posPermissions.join(", ") || "none"}.
          </div>
        ) : null}
      </section>
    </main>
  );
}
