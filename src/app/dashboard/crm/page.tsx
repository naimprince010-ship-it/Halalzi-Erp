"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUserResponse } from "@/lib/api/auth-client";

type CrmTab = "overview" | "pipeline" | "deals" | "tasks" | "customers";
type DealStatus = "active" | "won" | "lost" | "archived" | "cancelled";
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type ApiErrorPayload = { error?: { code?: string; message?: string } };

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  description: string | null;
  isActive: boolean;
  _count?: { activeDeals: number };
};

type Customer = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  status: string;
};

type Deal = {
  id: string;
  name: string;
  description: string | null;
  value: number | string | null;
  probability: number;
  expectedCloseDate: string | null;
  currentStageId: string;
  leadId: string | null;
  customerContactId: string | null;
  status: DealStatus;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentStage?: PipelineStage | null;
  lead?: Pick<Lead, "id" | "name" | "companyName" | "email" | "phone" | "stage" | "status"> | null;
  customerContact?: Pick<Customer, "id" | "name" | "companyName" | "email" | "phone" | "status"> | null;
};

type SalesTask = {
  id: string;
  dealId: string | null;
  leadId: string | null;
  customerContactId: string | null;
  assignedToUserId: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  completedAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  deal?: Pick<Deal, "id" | "name" | "status"> | null;
  lead?: Pick<Lead, "id" | "name" | "status"> | null;
  customerContact?: Pick<Customer, "id" | "name" | "status"> | null;
  assignedToUser?: { id: string; name: string; email: string } | null;
};

type CrmSummary = {
  dealCounts?: Array<{ status: DealStatus; _count: { _all: number } }>;
  activeDealValue?: number | string;
  taskCounts?: Array<{ status: TaskStatus; _count: { _all: number } }>;
  overdueTasks?: number;
  stages?: PipelineStage[];
};

type Customer360 = {
  customer: Customer;
  deals: Deal[];
  tasks: SalesTask[];
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

const emptyDealForm = {
  name: "",
  description: "",
  value: "",
  probability: "50",
  expectedCloseDate: "",
  currentStageId: "",
  leadId: "",
  customerContactId: "",
};

const emptyTaskForm = {
  title: "",
  description: "",
  dueAt: "",
  status: "pending" as TaskStatus,
  priority: "medium" as TaskPriority,
  dealId: "",
  leadId: "",
  customerContactId: "",
};

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function normalizeError(payload: ApiErrorPayload, fallback: string) {
  return payload.error?.message ?? fallback;
}

function hasPermission(user: CurrentUserResponse | null, permission: string) {
  return user?.permissions.includes(permission) ?? false;
}

async function readJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) throw new Error(normalizeError(payload, fallback));
  return payload;
}

async function writeJson<T>(url: string, method: string, body?: unknown, fallback = "Request failed. Please try again.") {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) throw new Error(normalizeError(payload, fallback));
  return payload;
}

function dealPayload(form: typeof emptyDealForm) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    value: form.value.trim() ? Number(form.value) : undefined,
    probability: Number.parseInt(form.probability, 10),
    expectedCloseDate: form.expectedCloseDate || undefined,
    currentStageId: form.currentStageId || undefined,
    leadId: form.leadId || undefined,
    customerContactId: form.customerContactId || undefined,
  };
}

function taskPayload(form: typeof emptyTaskForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    dueAt: form.dueAt || undefined,
    status: form.status,
    priority: form.priority,
    dealId: form.dealId || undefined,
    leadId: form.leadId || undefined,
    customerContactId: form.customerContactId || undefined,
  };
}

export default function CrmDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmLoading, setCrmLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<CrmTab>("overview");
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer360, setCustomer360] = useState<Customer360 | null>(null);

  const [dealForm, setDealForm] = useState(emptyDealForm);
  const [editDealId, setEditDealId] = useState<string | null>(null);
  const [editDealForm, setEditDealForm] = useState(emptyDealForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [lostReasonByDeal, setLostReasonByDeal] = useState<Record<string, string>>({});
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const canReadCrm = hasPermission(currentUser, "crm.read");
  const canReadPipeline = hasPermission(currentUser, "crm.pipeline.read");
  const canReadDeals = hasPermission(currentUser, "crm.deals.read");
  const canCreateDeals = hasPermission(currentUser, "crm.deals.create");
  const canUpdateDeals = hasPermission(currentUser, "crm.deals.update");
  const canCloseDeals = hasPermission(currentUser, "crm.deals.close");
  const canReadTasks = hasPermission(currentUser, "crm.tasks.read");
  const canCreateTasks = hasPermission(currentUser, "crm.tasks.create");
  const canUpdateTasks = hasPermission(currentUser, "crm.tasks.update");

  const visibleNav = useMemo(() => {
    if (!currentUser) return [];
    return navItems.filter((item) => currentUser.permissions.includes(item.permission));
  }, [currentUser]);

  const activeDeals = useMemo(() => deals.filter((deal) => deal.status === "active"), [deals]);
  const openTasks = useMemo(() => tasks.filter((task) => task.status === "pending" || task.status === "in_progress"), [tasks]);

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ id: CrmTab; label: string; enabled: boolean }> = [
      { id: "overview", label: "Overview", enabled: canReadCrm },
      { id: "pipeline", label: "Pipeline", enabled: canReadPipeline && canReadDeals },
      { id: "deals", label: "Deals", enabled: canReadDeals },
      { id: "tasks", label: "Tasks", enabled: canReadTasks },
      { id: "customers", label: "Customer 360", enabled: canReadCrm },
    ];
    return tabs.filter((tab) => tab.enabled);
  }, [canReadCrm, canReadDeals, canReadPipeline, canReadTasks]);

  async function loadCrmData(permissionList = currentUser?.permissions ?? []) {
    setCrmLoading(true);
    setPageError(null);
    try {
      const mayReadCrm = permissionList.includes("crm.read");
      const mayReadDeals = permissionList.includes("crm.deals.read");
      const mayReadPipeline = permissionList.includes("crm.pipeline.read");
      const mayReadTasks = permissionList.includes("crm.tasks.read");
      const [summaryResult, stageResult, dealResult, taskResult, leadResult, customerResult] = await Promise.allSettled([
        mayReadDeals ? readJson<{ summary: CrmSummary }>("/api/crm/summary", "Could not load CRM summary.") : Promise.resolve({ summary: null }),
        mayReadPipeline ? readJson<{ stages: PipelineStage[] }>("/api/crm/pipeline-stages", "Could not load pipeline stages.") : Promise.resolve({ stages: [] }),
        mayReadDeals ? readJson<{ deals: Deal[] }>("/api/crm/deals", "Could not load deals.") : Promise.resolve({ deals: [] }),
        mayReadTasks ? readJson<{ tasks: SalesTask[] }>("/api/crm/tasks", "Could not load tasks.") : Promise.resolve({ tasks: [] }),
        mayReadCrm ? readJson<{ leads: Lead[] }>("/api/crm/leads", "Could not load leads.") : Promise.resolve({ leads: [] }),
        mayReadCrm ? readJson<{ customers: Customer[] }>("/api/crm/customers", "Could not load customers.") : Promise.resolve({ customers: [] }),
      ]);

      const failures = [summaryResult, stageResult, dealResult, taskResult, leadResult, customerResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => (result.reason instanceof Error ? result.reason.message : "Could not load CRM data."));

      if (failures.length > 0) throw new Error(failures[0]);

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value.summary);
      if (stageResult.status === "fulfilled") setStages(stageResult.value.stages);
      if (dealResult.status === "fulfilled") setDeals(dealResult.value.deals);
      if (taskResult.status === "fulfilled") setTasks(taskResult.value.tasks);
      if (leadResult.status === "fulfilled") setLeads(leadResult.value.leads);
      if (customerResult.status === "fulfilled") {
        setCustomers(customerResult.value.customers);
        setSelectedCustomerId((current) => current || customerResult.value.customers[0]?.id || "");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load CRM data.");
    } finally {
      setCrmLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadPage() {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        setCurrentUser(user);
        if (user.permissions.includes("crm.read")) {
          await loadCrmData(user.permissions);
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
    // Initial auth/page load only; manual refresh handles later mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  async function handleCreateDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction("create-deal");
    setActionError(null);
    setSuccess(null);
    try {
      const payload = await writeJson<{ deal: Deal }>("/api/crm/deals", "POST", dealPayload(dealForm), "Could not create deal.");
      setDealForm(emptyDealForm);
      setSuccess(`${payload.deal.name} created.`);
      await loadCrmData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create deal.");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleUpdateDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDealId) return;
    setSavingAction(`update-deal-${editDealId}`);
    setActionError(null);
    setSuccess(null);
    try {
      const payload = await writeJson<{ deal: Deal }>(
        `/api/crm/deals/${editDealId}`,
        "PATCH",
        dealPayload(editDealForm),
        "Could not update deal.",
      );
      setEditDealId(null);
      setEditDealForm(emptyDealForm);
      setSuccess(`${payload.deal.name} updated.`);
      await loadCrmData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update deal.");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleDealAction(deal: Deal, action: "close-won" | "close-lost" | "archive") {
    setSavingAction(`${action}-${deal.id}`);
    setActionError(null);
    setSuccess(null);
    try {
      const body =
        action === "close-lost"
          ? { lostReason: lostReasonByDeal[deal.id]?.trim() || "Not a fit right now." }
          : action === "close-won"
            ? { note: "Closed from CRM dashboard." }
            : undefined;
      const payload = await writeJson<{ deal: Deal }>(
        `/api/crm/deals/${deal.id}/${action}`,
        "POST",
        body,
        `Could not ${action.replace("-", " ")} deal.`,
      );
      setSuccess(`${payload.deal.name} ${action.replace("-", " ")} completed.`);
      await loadCrmData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Could not ${action.replace("-", " ")} deal.`);
    } finally {
      setSavingAction(null);
    }
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction("create-task");
    setActionError(null);
    setSuccess(null);
    try {
      const payload = await writeJson<{ task: SalesTask }>("/api/crm/tasks", "POST", taskPayload(taskForm), "Could not create task.");
      setTaskForm(emptyTaskForm);
      setSuccess(`${payload.task.title} created.`);
      await loadCrmData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create task.");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleTaskAction(task: SalesTask, action: "complete" | "cancel") {
    setSavingAction(`${action}-task-${task.id}`);
    setActionError(null);
    setSuccess(null);
    try {
      const payload = await writeJson<{ task: SalesTask }>(
        `/api/crm/tasks/${task.id}/${action}`,
        "POST",
        undefined,
        `Could not ${action} task.`,
      );
      setSuccess(`${payload.task.title} ${action}d.`);
      await loadCrmData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Could not ${action} task.`);
    } finally {
      setSavingAction(null);
    }
  }

  async function loadCustomer360(customerId: string) {
    setSelectedCustomerId(customerId);
    setCustomer360(null);
    setActionError(null);
    if (!customerId) return;
    try {
      const payload = await readJson<{ customer360: Customer360 }>(
        `/api/crm/customers/${customerId}/360`,
        "Could not load customer 360.",
      );
      setCustomer360(payload.customer360);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not load customer 360.");
    }
  }

  function startEditDeal(deal: Deal) {
    setEditDealId(deal.id);
    setEditDealForm({
      name: deal.name,
      description: deal.description ?? "",
      value: deal.value === null ? "" : String(deal.value),
      probability: String(deal.probability),
      expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : "",
      currentStageId: deal.currentStageId,
      leadId: deal.leadId ?? "",
      customerContactId: deal.customerContactId ?? "",
    });
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
                <p className="eyebrow">Modern sales CRM</p>
                <h2>Pipeline, deals, tasks, and customer context</h2>
                <p>Manage day-to-day sales motion with tenant-scoped controls, clean pipeline visibility, and role-aware actions.</p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button" type="button" onClick={() => void loadCrmData()} disabled={crmLoading}>
                  {crmLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </section>

            {pageError ? <div className="form-error">{pageError}</div> : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
            {success ? <div className="form-success">{success}</div> : null}

            <div className="crm-tabs" role="tablist" aria-label="CRM workspace tabs">
              {visibleTabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "crm-tab active" : "crm-tab"}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" ? (
              <>
                <section className="dashboard-grid" aria-label="CRM summary">
                  <article className="stat-tile">
                    <span>Active deals</span>
                    <strong>{activeDeals.length}</strong>
                  </article>
                  <article className="stat-tile">
                    <span>Pipeline value</span>
                    <strong>{formatMoney(summary?.activeDealValue)}</strong>
                  </article>
                  <article className="stat-tile">
                    <span>Open tasks</span>
                    <strong>{openTasks.length}</strong>
                  </article>
                  <article className="stat-tile">
                    <span>Overdue tasks</span>
                    <strong>{summary?.overdueTasks ?? 0}</strong>
                  </article>
                </section>
                <section className="crm-split">
                  <article className="module-section">
                    <div className="section-heading-row">
                      <div>
                        <span>Pipeline health</span>
                        <h2>Stage distribution</h2>
                      </div>
                    </div>
                    <div className="crm-stage-list">
                      {stages.map((stage) => (
                        <div className="crm-stage-summary" key={stage.id}>
                          <strong>{stage.name}</strong>
                          <span>{stage._count?.activeDeals ?? deals.filter((deal) => deal.currentStageId === stage.id).length} deals</span>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="module-section">
                    <div className="section-heading-row">
                      <div>
                        <span>Next actions</span>
                        <h2>Upcoming tasks</h2>
                      </div>
                    </div>
                    <div className="crm-record-list">
                      {openTasks.slice(0, 5).map((task) => (
                        <article className="crm-task-row" key={task.id}>
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.deal?.name ?? task.customerContact?.name ?? task.lead?.name ?? "General CRM task"}</span>
                          </div>
                          <strong>{task.priority}</strong>
                          <span>{formatDate(task.dueAt)}</span>
                        </article>
                      ))}
                      {openTasks.length === 0 ? <p className="muted-text">No open CRM tasks.</p> : null}
                    </div>
                  </article>
                </section>
              </>
            ) : null}

            {activeTab === "pipeline" ? (
              <section className="crm-pipeline-grid" aria-label="CRM pipeline">
                {stages.map((stage) => (
                  <article className="crm-pipeline-column" key={stage.id}>
                    <header>
                      <strong>{stage.name}</strong>
                      <span>{deals.filter((deal) => deal.currentStageId === stage.id && deal.status === "active").length}</span>
                    </header>
                    <div className="crm-pipeline-cards">
                      {deals
                        .filter((deal) => deal.currentStageId === stage.id && deal.status === "active")
                        .map((deal) => (
                          <div className="crm-deal-card" key={deal.id}>
                            <strong>{deal.name}</strong>
                            <span>{formatMoney(deal.value)} · {deal.probability}%</span>
                            <small>{deal.customerContact?.name ?? deal.lead?.name ?? "No linked contact"}</small>
                          </div>
                        ))}
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

            {activeTab === "deals" ? (
              <section className="module-section">
                <div className="section-heading-row">
                  <div>
                    <span>Opportunities</span>
                    <h2>Deals</h2>
                  </div>
                  <span>{deals.length} records</span>
                </div>

                {canCreateDeals ? (
                  <form className="crm-form" onSubmit={handleCreateDeal}>
                    <label className="field">
                      <span>Name</span>
                      <input value={dealForm.name} onChange={(event) => setDealForm({ ...dealForm, name: event.target.value })} required />
                    </label>
                    <label className="field">
                      <span>Stage</span>
                      <select value={dealForm.currentStageId} onChange={(event) => setDealForm({ ...dealForm, currentStageId: event.target.value })}>
                        <option value="">Default stage</option>
                        {stages.filter((stage) => stage.isActive).map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Value</span>
                      <input min="0" step="0.01" type="number" value={dealForm.value} onChange={(event) => setDealForm({ ...dealForm, value: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Probability</span>
                      <input min="0" max="100" type="number" value={dealForm.probability} onChange={(event) => setDealForm({ ...dealForm, probability: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Expected close</span>
                      <input type="date" value={dealForm.expectedCloseDate} onChange={(event) => setDealForm({ ...dealForm, expectedCloseDate: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Lead</span>
                      <select value={dealForm.leadId} onChange={(event) => setDealForm({ ...dealForm, leadId: event.target.value })}>
                        <option value="">No lead</option>
                        {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Customer</span>
                      <select value={dealForm.customerContactId} onChange={(event) => setDealForm({ ...dealForm, customerContactId: event.target.value })}>
                        <option value="">No customer</option>
                        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                    </label>
                    <label className="field crm-wide-field">
                      <span>Description</span>
                      <textarea value={dealForm.description} onChange={(event) => setDealForm({ ...dealForm, description: event.target.value })} />
                    </label>
                    <div className="crm-actions">
                      <button className="primary-button" disabled={savingAction === "create-deal"} type="submit">
                        {savingAction === "create-deal" ? "Creating..." : "Create deal"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="crm-record-list">
                  {deals.map((deal) => (
                    <article className="crm-deal-row" key={deal.id}>
                      <div>
                        <span>Deal</span>
                        <strong>{deal.name}</strong>
                      </div>
                      <div>
                        <span>Stage</span>
                        <strong>{deal.currentStage?.name ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Value</span>
                        <strong>{formatMoney(deal.value)}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{deal.status}</strong>
                      </div>
                      <div>
                        <span>Close date</span>
                        <strong>{formatDate(deal.expectedCloseDate)}</strong>
                      </div>
                      <div className="crm-row-actions">
                        {canUpdateDeals && deal.status === "active" ? (
                          <button className="secondary-button" type="button" onClick={() => startEditDeal(deal)}>Edit</button>
                        ) : null}
                        {canCloseDeals && deal.status === "active" ? (
                          <>
                            <button className="secondary-button" disabled={savingAction === `close-won-${deal.id}`} type="button" onClick={() => handleDealAction(deal, "close-won")}>
                              Won
                            </button>
                            <input
                              aria-label={`Lost reason for ${deal.name}`}
                              className="crm-inline-input"
                              placeholder="Lost reason"
                              value={lostReasonByDeal[deal.id] ?? ""}
                              onChange={(event) => setLostReasonByDeal({ ...lostReasonByDeal, [deal.id]: event.target.value })}
                            />
                            <button className="secondary-button" disabled={savingAction === `close-lost-${deal.id}`} type="button" onClick={() => handleDealAction(deal, "close-lost")}>
                              Lost
                            </button>
                          </>
                        ) : null}
                        {canUpdateDeals && deal.status !== "archived" ? (
                          <button className="secondary-button" disabled={savingAction === `archive-${deal.id}`} type="button" onClick={() => handleDealAction(deal, "archive")}>
                            Archive
                          </button>
                        ) : null}
                      </div>
                      {editDealId === deal.id ? (
                        <form className="crm-edit-form" onSubmit={handleUpdateDeal}>
                          <input value={editDealForm.name} onChange={(event) => setEditDealForm({ ...editDealForm, name: event.target.value })} required />
                          <select value={editDealForm.currentStageId} onChange={(event) => setEditDealForm({ ...editDealForm, currentStageId: event.target.value })}>
                            {stages.filter((stage) => stage.isActive).map((stage) => (
                              <option key={stage.id} value={stage.id}>{stage.name}</option>
                            ))}
                          </select>
                          <input min="0" step="0.01" type="number" value={editDealForm.value} onChange={(event) => setEditDealForm({ ...editDealForm, value: event.target.value })} />
                          <input min="0" max="100" type="number" value={editDealForm.probability} onChange={(event) => setEditDealForm({ ...editDealForm, probability: event.target.value })} />
                          <textarea value={editDealForm.description} onChange={(event) => setEditDealForm({ ...editDealForm, description: event.target.value })} />
                          <div className="crm-actions">
                            <button className="primary-button" disabled={savingAction === `update-deal-${deal.id}`} type="submit">Save</button>
                            <button className="secondary-button" type="button" onClick={() => setEditDealId(null)}>Cancel</button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  ))}
                  {deals.length === 0 ? <p className="muted-text">No deals yet.</p> : null}
                </div>
              </section>
            ) : null}

            {activeTab === "tasks" ? (
              <section className="module-section">
                <div className="section-heading-row">
                  <div>
                    <span>Follow-up work</span>
                    <h2>Sales tasks</h2>
                  </div>
                  <span>{tasks.length} records</span>
                </div>
                {canCreateTasks ? (
                  <form className="crm-form" onSubmit={handleCreateTask}>
                    <label className="field">
                      <span>Title</span>
                      <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required />
                    </label>
                    <label className="field">
                      <span>Priority</span>
                      <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as TaskPriority })}>
                        {["low", "medium", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Due date</span>
                      <input type="date" value={taskForm.dueAt} onChange={(event) => setTaskForm({ ...taskForm, dueAt: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>Deal</span>
                      <select value={taskForm.dealId} onChange={(event) => setTaskForm({ ...taskForm, dealId: event.target.value })}>
                        <option value="">No deal</option>
                        {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name}</option>)}
                      </select>
                    </label>
                    <label className="field crm-wide-field">
                      <span>Description</span>
                      <textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} />
                    </label>
                    <div className="crm-actions">
                      <button className="primary-button" disabled={savingAction === "create-task"} type="submit">
                        {savingAction === "create-task" ? "Creating..." : "Create task"}
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="crm-record-list">
                  {tasks.map((task) => (
                    <article className="crm-task-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.description ?? task.deal?.name ?? "General CRM task"}</span>
                      </div>
                      <strong>{task.priority}</strong>
                      <strong>{task.status}</strong>
                      <span>{formatDate(task.dueAt)}</span>
                      <div className="crm-row-actions">
                        {canUpdateTasks && task.status !== "completed" && task.status !== "cancelled" ? (
                          <>
                            <button className="secondary-button" type="button" onClick={() => handleTaskAction(task, "complete")}>Complete</button>
                            <button className="secondary-button" type="button" onClick={() => handleTaskAction(task, "cancel")}>Cancel</button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {tasks.length === 0 ? <p className="muted-text">No CRM tasks yet.</p> : null}
                </div>
              </section>
            ) : null}

            {activeTab === "customers" ? (
              <section className="crm-split">
                <article className="module-section">
                  <div className="section-heading-row">
                    <div>
                      <span>Customer list</span>
                      <h2>Contacts</h2>
                    </div>
                  </div>
                  <label className="field">
                    <span>Select customer</span>
                    <select value={selectedCustomerId} onChange={(event) => loadCustomer360(event.target.value)}>
                      <option value="">Choose customer</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </select>
                  </label>
                  <div className="crm-record-list">
                    {customers.slice(0, 8).map((customer) => (
                      <button className="crm-row-main crm-customer-button" key={customer.id} type="button" onClick={() => loadCustomer360(customer.id)}>
                        <strong>{customer.name}</strong>
                        <span>{customer.companyName ?? customer.phone ?? customer.email ?? "No contact detail"}</span>
                      </button>
                    ))}
                  </div>
                </article>
                <article className="module-section">
                  <div className="section-heading-row">
                    <div>
                      <span>Customer 360</span>
                      <h2>{customer360?.customer.name ?? "Select a customer"}</h2>
                    </div>
                  </div>
                  {customer360 ? (
                    <div className="crm-360-panel">
                      <div>
                        <span>Company</span>
                        <strong>{customer360.customer.companyName ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Email</span>
                        <strong>{customer360.customer.email ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Phone</span>
                        <strong>{customer360.customer.phone ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Open deals</span>
                        <strong>{customer360.deals.filter((deal) => deal.status === "active").length}</strong>
                      </div>
                      <div className="crm-360-wide">
                        <span>Recent deals</span>
                        {customer360.deals.slice(0, 5).map((deal) => (
                          <p key={deal.id}>{deal.name} · {formatMoney(deal.value)} · {deal.status}</p>
                        ))}
                      </div>
                      <div className="crm-360-wide">
                        <span>Tasks</span>
                        {customer360.tasks.slice(0, 5).map((task) => (
                          <p key={task.id}>{task.title} · {task.status} · {formatDate(task.dueAt)}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="muted-text">Choose a customer to see deals and tasks in one place.</p>
                  )}
                </article>
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
