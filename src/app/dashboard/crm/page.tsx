"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type LeadStage = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
type LeadStatus = "active" | "converted" | "archived";
type CustomerStatus = "active" | "inactive" | "archived";
type ActivityType = "call" | "email" | "whatsapp" | "meeting" | "note" | "stage_change" | "conversion" | "archive";

type Customer = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  notes?: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
};

type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  status: LeadStatus;
  estimatedValue: number | string | null;
  expectedCloseDate: string | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  convertedCustomerId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  convertedCustomer?: Pick<Customer, "id" | "name" | "companyName" | "email" | "phone" | "status"> | null;
};

type LeadActivity = {
  id: string;
  leadId: string;
  userId: string | null;
  type: ActivityType;
  note: string;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
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
  { label: "CRM", permission: "crm.read", href: "/dashboard/crm" },
  { label: "Procurement", permission: "purchases.read", href: "/dashboard/procurement" },
  { label: "Finance", permission: "finance.read", href: "/dashboard/finance" },
  { label: "Audit", permission: "audit.read", href: "/dashboard/audit" },
  { label: "Users", permission: "users.read", href: "/dashboard/users" },
  { label: "Roles", permission: "roles.read", href: "/dashboard/roles" },
  { label: "Profile", permission: "profile.read", href: "/dashboard/profile" },
];

const emptyLeadForm = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  source: "",
  stage: "new" as LeadStage,
  estimatedValue: "",
  expectedCloseDate: "",
  nextFollowUpAt: "",
  notes: "",
};

const emptyCustomerForm = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  status: "active" as Exclude<CustomerStatus, "archived">,
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

function formatMoney(value: number | string | null) {
  if (value === null || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeError(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function leadPayload(form: typeof emptyLeadForm) {
  return {
    name: form.name.trim(),
    companyName: form.companyName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    source: form.source.trim() || undefined,
    stage: form.stage,
    estimatedValue: form.estimatedValue.trim() ? Number(form.estimatedValue) : undefined,
    expectedCloseDate: form.expectedCloseDate || undefined,
    nextFollowUpAt: form.nextFollowUpAt || undefined,
    notes: form.notes.trim() || undefined,
  };
}

function customerPayload(form: typeof emptyCustomerForm) {
  return {
    name: form.name.trim(),
    companyName: form.companyName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    notes: form.notes.trim() || undefined,
    status: form.status,
  };
}

function formFromLead(lead: Lead) {
  return {
    name: lead.name,
    companyName: lead.companyName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source ?? "",
    stage: lead.stage,
    estimatedValue: lead.estimatedValue === null ? "" : String(lead.estimatedValue),
    expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : "",
    nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : "",
    notes: lead.notes ?? "",
  };
}

export default function CrmDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmLoading, setCrmLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number | null>(null);

  const [pageError, setPageError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [createLeadForm, setCreateLeadForm] = useState(emptyLeadForm);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [editLeadForm, setEditLeadForm] = useState(emptyLeadForm);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, note: "" });

  const [creatingLead, setCreatingLead] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [archivingLeadId, setArchivingLeadId] = useState<string | null>(null);
  const [archivingCustomerId, setArchivingCustomerId] = useState<string | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);

  const canReadCrm = currentUser?.permissions.includes("crm.read") ?? false;
  const canCreateCrm = currentUser?.permissions.includes("crm.create") ?? false;
  const canUpdateCrm = currentUser?.permissions.includes("crm.update") ?? false;
  const canConvertCrm = currentUser?.permissions.includes("crm.convert") ?? false;
  const canArchiveCrm = currentUser?.permissions.includes("crm.archive") ?? false;

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null,
    [leads, selectedLeadId],
  );

  const activeLeads = useMemo(() => leads.filter((lead) => lead.status === "active"), [leads]);
  const followUpsDue = useMemo(() => {
    if (nowTimestamp === null) {
      return [];
    }

    return leads.filter(
      (lead) =>
        lead.status === "active" &&
        lead.nextFollowUpAt &&
        new Date(lead.nextFollowUpAt).getTime() <= nowTimestamp,
    );
  }, [leads, nowTimestamp]);
  const convertedLeads = useMemo(() => leads.filter((lead) => lead.status === "converted"), [leads]);

  async function loadLeads() {
    const response = await fetch("/api/crm/leads", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { leads?: Lead[] } & ApiErrorPayload;
    if (!response.ok) throw new Error(normalizeError(payload, "Could not load CRM leads."));
    const nextLeads = payload.leads ?? [];
    const nextSelectedLeadId =
      selectedLeadId && nextLeads.some((lead) => lead.id === selectedLeadId)
        ? selectedLeadId
        : nextLeads[0]?.id ?? null;

    setLeads(nextLeads);
    setSelectedLeadId(nextSelectedLeadId);
    await loadActivities(nextSelectedLeadId);
  }

  async function loadCustomers() {
    const response = await fetch("/api/crm/customers", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { customers?: Customer[] } & ApiErrorPayload;
    if (!response.ok) throw new Error(normalizeError(payload, "Could not load CRM customers."));
    setCustomers(payload.customers ?? []);
  }

  async function refreshCrm() {
    setCrmLoading(true);
    setPageError(null);
    try {
      await Promise.all([loadLeads(), loadCustomers()]);
      setNowTimestamp(Date.now());
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load CRM data.");
    } finally {
      setCrmLoading(false);
    }
  }

  async function loadActivities(leadId: string | null) {
    if (!leadId) {
      setActivities([]);
      return;
    }
    try {
      const response = await fetch(`/api/crm/leads/${leadId}/activities`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { activities?: LeadActivity[] } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not load CRM activities."));
      setActivities(payload.activities ?? []);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not load CRM activities.");
    }
  }

  useEffect(() => {
    let active = true;
    async function loadPage() {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        setCurrentUser(user);
        if (!user.permissions.includes("crm.read")) return;
        await refreshCrm();
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
    // Initial auth/page load only; CRM refresh is triggered manually after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  async function handleCreateLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingLead(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload(createLeadForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { lead?: Lead } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not create lead."));
      setCreateLeadForm(emptyLeadForm);
      setSuccess(`${payload.lead?.name ?? "Lead"} created.`);
      await refreshCrm();
      if (payload.lead?.id) setSelectedLeadId(payload.lead.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create lead.");
    } finally {
      setCreatingLead(false);
    }
  }

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingCustomer(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerPayload(customerForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { customer?: Customer } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not create customer."));
      setCustomerForm(emptyCustomerForm);
      setSuccess(`${payload.customer?.name ?? "Customer"} created.`);
      await loadCustomers();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create customer.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleUpdateLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editLeadId) return;
    setSavingLeadId(editLeadId);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crm/leads/${editLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload(editLeadForm)),
      });
      const payload = (await response.json().catch(() => ({}))) as { lead?: Lead } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not update lead."));
      setSuccess(`${payload.lead?.name ?? "Lead"} updated.`);
      setEditLeadId(null);
      await refreshCrm();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update lead.");
    } finally {
      setSavingLeadId(null);
    }
  }

  async function handleConvertLead(lead: Lead) {
    setConvertingLeadId(lead.id);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: lead.name,
            companyName: lead.companyName ?? undefined,
            email: lead.email ?? undefined,
            phone: lead.phone ?? undefined,
            notes: lead.notes ?? undefined,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { lead?: Lead } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not convert lead."));
      setSuccess(`${payload.lead?.name ?? "Lead"} converted to customer.`);
      await refreshCrm();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not convert lead.");
    } finally {
      setConvertingLeadId(null);
    }
  }

  async function handleArchiveLead(lead: Lead) {
    setArchivingLeadId(lead.id);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}/archive`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { lead?: Lead } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not archive lead."));
      setSuccess(`${payload.lead?.name ?? "Lead"} archived.`);
      await refreshCrm();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not archive lead.");
    } finally {
      setArchivingLeadId(null);
    }
  }

  async function handleArchiveCustomer(customer: Customer) {
    setArchivingCustomerId(customer.id);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crm/customers/${customer.id}/archive`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { customer?: Customer } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not archive customer."));
      setSuccess(`${payload.customer?.name ?? "Customer"} archived.`);
      await loadCustomers();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not archive customer.");
    } finally {
      setArchivingCustomerId(null);
    }
  }

  async function handleAddActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLead) return;
    setAddingActivity(true);
    setActionError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crm/leads/${selectedLead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activityForm),
      });
      const payload = (await response.json().catch(() => ({}))) as { activity?: LeadActivity } & ApiErrorPayload;
      if (!response.ok) throw new Error(normalizeError(payload, "Could not add activity."));
      setActivityForm({ type: "note", note: "" });
      setSuccess("Activity added.");
      await loadActivities(selectedLead.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not add activity.");
    } finally {
      setAddingActivity(false);
    }
  }

  function beginEditLead(lead: Lead) {
    setEditLeadId(lead.id);
    setEditLeadForm(formFromLead(lead));
    setActionError(null);
    setSuccess(null);
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
            <p className="eyebrow">CRM</p>
            <h1>{currentUser.company.name}</h1>
          </div>
          <div className="user-menu">
            <span>{currentUser.user.name}</span>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {!canReadCrm ? (
          <section className="access-panel" role="alert" aria-live="polite">
            <p className="eyebrow">Access denied</p>
            <h2>CRM access is not enabled for your role.</h2>
            <p>Ask a company admin to grant crm.read before opening CRM records.</p>
          </section>
        ) : (
          <>
            <section className="dashboard-hero">
              <div>
                <p className="eyebrow">Customer relationship management</p>
                <h2>Pipeline, follow-ups, and customer records</h2>
                <p>Track leads, next actions, customer contacts, and conversion flow inside the same tenant-safe ERP workspace.</p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button" type="button" onClick={refreshCrm} disabled={crmLoading}>
                  {crmLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </section>

            {pageError ? <div className="form-error">{pageError}</div> : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
            {success ? <div className="form-success">{success}</div> : null}

            <section className="dashboard-grid" aria-label="CRM summary">
              <article className="stat-tile">
                <span>Active leads</span>
                <strong>{activeLeads.length}</strong>
              </article>
              <article className="stat-tile">
                <span>Follow-ups due</span>
                <strong>{followUpsDue.length}</strong>
              </article>
              <article className="stat-tile">
                <span>Converted</span>
                <strong>{convertedLeads.length}</strong>
              </article>
              <article className="stat-tile">
                <span>Customers</span>
                <strong>{customers.filter((customer) => customer.status !== "archived").length}</strong>
              </article>
            </section>

            <section className="module-section">
              <div className="section-heading-row">
                <div>
                  <span>Lead desk</span>
                  <h2>Leads</h2>
                </div>
                <span>{crmLoading ? "Loading..." : `${leads.length} records`}</span>
              </div>

              {canCreateCrm ? (
                <form className="crm-form" onSubmit={handleCreateLead}>
                  <label className="field">
                    <span>Name</span>
                    <input value={createLeadForm.name} onChange={(event) => setCreateLeadForm({ ...createLeadForm, name: event.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Company</span>
                    <input value={createLeadForm.companyName} onChange={(event) => setCreateLeadForm({ ...createLeadForm, companyName: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input value={createLeadForm.phone} onChange={(event) => setCreateLeadForm({ ...createLeadForm, phone: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input type="email" value={createLeadForm.email} onChange={(event) => setCreateLeadForm({ ...createLeadForm, email: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Source</span>
                    <input value={createLeadForm.source} onChange={(event) => setCreateLeadForm({ ...createLeadForm, source: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Stage</span>
                    <select value={createLeadForm.stage} onChange={(event) => setCreateLeadForm({ ...createLeadForm, stage: event.target.value as LeadStage })}>
                      {["new", "contacted", "qualified", "proposal", "won", "lost"].map((stage) => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Value</span>
                    <input type="number" min="0" step="0.01" value={createLeadForm.estimatedValue} onChange={(event) => setCreateLeadForm({ ...createLeadForm, estimatedValue: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Follow-up</span>
                    <input type="date" value={createLeadForm.nextFollowUpAt} onChange={(event) => setCreateLeadForm({ ...createLeadForm, nextFollowUpAt: event.target.value })} />
                  </label>
                  <label className="field crm-wide-field">
                    <span>Notes</span>
                    <textarea value={createLeadForm.notes} onChange={(event) => setCreateLeadForm({ ...createLeadForm, notes: event.target.value })} />
                  </label>
                  <div className="crm-actions">
                    <button className="primary-button" type="submit" disabled={creatingLead}>{creatingLead ? "Creating..." : "Create lead"}</button>
                  </div>
                </form>
              ) : null}

              <div className="crm-record-list">
                {leads.length === 0 ? <p className="muted-text">No CRM leads yet.</p> : null}
                {leads.map((lead) => (
                  <article className={selectedLead?.id === lead.id ? "crm-record-row active" : "crm-record-row"} key={lead.id}>
                    <button
                      className="crm-row-main"
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        void loadActivities(lead.id);
                      }}
                    >
                      <strong>{lead.name}</strong>
                      <span>{lead.companyName ?? lead.phone ?? lead.email ?? "No contact detail"}</span>
                    </button>
                    <div>
                      <span>Stage</span>
                      <strong>{lead.stage}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{lead.status}</strong>
                    </div>
                    <div>
                      <span>Follow-up</span>
                      <strong>{formatDate(lead.nextFollowUpAt)}</strong>
                    </div>
                    <div>
                      <span>Value</span>
                      <strong>{formatMoney(lead.estimatedValue)}</strong>
                    </div>
                    <div className="crm-row-actions">
                      {canUpdateCrm && lead.status === "active" ? <button className="secondary-button" type="button" onClick={() => beginEditLead(lead)}>Edit</button> : null}
                      {canConvertCrm && lead.status === "active" ? <button className="secondary-button" type="button" onClick={() => handleConvertLead(lead)} disabled={convertingLeadId === lead.id}>{convertingLeadId === lead.id ? "Converting..." : "Convert"}</button> : null}
                      {canArchiveCrm && lead.status !== "archived" ? <button className="secondary-button" type="button" onClick={() => handleArchiveLead(lead)} disabled={archivingLeadId === lead.id}>{archivingLeadId === lead.id ? "Archiving..." : "Archive"}</button> : null}
                    </div>
                    {editLeadId === lead.id ? (
                      <form className="crm-edit-form" onSubmit={handleUpdateLead}>
                        <input value={editLeadForm.name} onChange={(event) => setEditLeadForm({ ...editLeadForm, name: event.target.value })} required />
                        <input value={editLeadForm.companyName} onChange={(event) => setEditLeadForm({ ...editLeadForm, companyName: event.target.value })} placeholder="Company" />
                        <select value={editLeadForm.stage} onChange={(event) => setEditLeadForm({ ...editLeadForm, stage: event.target.value as LeadStage })}>
                          {["new", "contacted", "qualified", "proposal", "won", "lost"].map((stage) => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>
                        <input type="date" value={editLeadForm.nextFollowUpAt} onChange={(event) => setEditLeadForm({ ...editLeadForm, nextFollowUpAt: event.target.value })} />
                        <textarea value={editLeadForm.notes} onChange={(event) => setEditLeadForm({ ...editLeadForm, notes: event.target.value })} />
                        <div className="crm-actions">
                          <button className="primary-button" type="submit" disabled={savingLeadId === lead.id}>{savingLeadId === lead.id ? "Saving..." : "Save lead"}</button>
                          <button className="secondary-button" type="button" onClick={() => setEditLeadId(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="crm-split">
              <article className="module-section">
                <div className="section-heading-row">
                  <div>
                    <span>Customer contacts</span>
                    <h2>Customers</h2>
                  </div>
                </div>
                {canCreateCrm ? (
                  <form className="crm-form compact" onSubmit={handleCreateCustomer}>
                    <input placeholder="Name" value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} required />
                    <input placeholder="Company" value={customerForm.companyName} onChange={(event) => setCustomerForm({ ...customerForm, companyName: event.target.value })} />
                    <input placeholder="Phone" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
                    <input placeholder="Email" type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
                    <div className="crm-actions">
                      <button className="primary-button" type="submit" disabled={creatingCustomer}>{creatingCustomer ? "Creating..." : "Create customer"}</button>
                    </div>
                  </form>
                ) : null}
                <div className="crm-record-list">
                  {customers.length === 0 ? <p className="muted-text">No CRM customers yet.</p> : null}
                  {customers.map((customer) => (
                    <article className="crm-customer-row" key={customer.id}>
                      <div>
                        <strong>{customer.name}</strong>
                        <span>{customer.companyName ?? customer.phone ?? customer.email ?? "No contact detail"}</span>
                      </div>
                      <strong>{customer.status}</strong>
                      {canArchiveCrm && customer.status !== "archived" ? (
                        <button className="secondary-button" type="button" onClick={() => handleArchiveCustomer(customer)} disabled={archivingCustomerId === customer.id}>
                          {archivingCustomerId === customer.id ? "Archiving..." : "Archive"}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </article>

              <article className="module-section">
                <div className="section-heading-row">
                  <div>
                    <span>Timeline</span>
                    <h2>{selectedLead ? selectedLead.name : "Select a lead"}</h2>
                  </div>
                </div>
                {selectedLead && canCreateCrm ? (
                  <form className="crm-form compact" onSubmit={handleAddActivity}>
                    <select value={activityForm.type} onChange={(event) => setActivityForm({ ...activityForm, type: event.target.value as ActivityType })}>
                      {["note", "call", "email", "whatsapp", "meeting"].map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <input placeholder="Activity note" value={activityForm.note} onChange={(event) => setActivityForm({ ...activityForm, note: event.target.value })} required />
                    <div className="crm-actions">
                      <button className="primary-button" type="submit" disabled={addingActivity}>{addingActivity ? "Adding..." : "Add activity"}</button>
                    </div>
                  </form>
                ) : null}
                <div className="crm-timeline">
                  {activities.length === 0 ? <p className="muted-text">No activity yet.</p> : null}
                  {activities.map((activity) => (
                    <div className="crm-activity" key={activity.id}>
                      <strong>{activity.type}</strong>
                      <p>{activity.note}</p>
                      <span>{formatDateTime(activity.createdAt)}{activity.user ? ` by ${activity.user.name}` : ""}</span>
                    </div>
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
