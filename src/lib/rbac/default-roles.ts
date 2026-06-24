import { DEFAULT_PERMISSIONS, type PermissionKey } from "./default-permissions";

export type RbacClient = {
  permission: {
    upsert(args: {
      where: { key: string };
      update: Record<string, never>;
      create: { key: string; module: string; action: string; description: string };
    }): Promise<{ id: string; key: string }>;
    findMany(args: { where: { key: { in: string[] } }; select: { id: true; key: true } }): Promise<
      { id: string; key: string }[]
    >;
  };
  role: {
    upsert(args: {
      where: { companyId_key: { companyId: string; key: string } };
      update: { name: string; description: string; isSystem: boolean };
      create: { companyId: string; name: string; key: string; description: string; isSystem: boolean };
    }): Promise<{ id: string; key: string }>;
    findUnique(args: {
      where: { companyId_key: { companyId: string; key: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  rolePermission: {
    createMany(args: { data: { roleId: string; permissionId: string }[]; skipDuplicates: boolean }): Promise<unknown>;
  };
  userRole: {
    create(args: { data: { userId: string; roleId: string } }): Promise<unknown>;
  };
};

const ADMIN_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "profile.read",
  "profile.update",
  "company.read",
  "users.read",
  "users.create",
  "users.update",
  "users.disable",
  "roles.read",
  "roles.assign",
  "roles.update",
  "products.read",
  "products.create",
  "products.update",
  "products.delete",
  "inventory.adjust",
  "sales.read",
  "sales.create",
  "sales.update",
  "sales.confirm",
  "sales.cancel",
  "sales.quotations.read",
  "sales.quotations.create",
  "sales.quotations.update",
  "sales.quotations.send",
  "sales.quotations.accept",
  "sales.quotations.reject",
  "sales.quotations.expire",
  "sales.quotations.convert",
  "sales.invoices.read",
  "sales.invoices.create",
  "sales.invoices.update",
  "sales.invoices.issue",
  "sales.invoices.cancel",
  "vendors.read",
  "vendors.create",
  "vendors.update",
  "purchases.read",
  "purchases.create",
  "purchases.update",
  "purchases.submit",
  "purchases.approve",
  "purchases.reject",
  "purchases.receive",
  "purchases.cancel",
  "finance.read",
  "finance.accounts.create",
  "finance.accounts.update",
  "finance.journals.create",
  "finance.journals.update",
  "finance.journals.post",
  "finance.journals.cancel",
  "finance.journals.reverse",
  "finance.receivables.update",
  "finance.payables.update",
  "finance.periods.read",
  "finance.periods.manage",
  "finance.payments.read",
  "finance.payments.create",
  "finance.expenses.read",
  "finance.expenses.create",
  "finance.expenses.reverse",
  "finance.cashbank.read",
  "finance.cashbank.manage",
  "finance.reports.read",
  "crm.read",
  "crm.create",
  "crm.update",
  "crm.convert",
  "crm.archive",
  "crm.deals.read",
  "crm.deals.create",
  "crm.deals.update",
  "crm.deals.close",
  "crm.tasks.read",
  "crm.tasks.create",
  "crm.tasks.update",
  "crm.pipeline.read",
  "crm.pipeline.update",
  "audit.read",
];

const STAFF_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "profile.read",
  "profile.update",
  "products.read",
  "sales.read",
  "sales.quotations.read",
  "sales.invoices.read",
  "vendors.read",
  "purchases.read",
  "finance.read",
  "finance.periods.read",
  "finance.payments.read",
  "finance.expenses.read",
  "finance.cashbank.read",
  "finance.reports.read",
  "crm.read",
  "crm.create",
  "crm.update",
  "crm.deals.read",
  "crm.deals.create",
  "crm.deals.update",
  "crm.tasks.read",
  "crm.tasks.create",
  "crm.tasks.update",
  "crm.pipeline.read",
];

export const ROLE_TEMPLATES: {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionKey[];
}[] = [
  {
    key: "admin",
    name: "Company Admin",
    description: "Full control inside the company workspace.",
    isSystem: true,
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: "sales_operator",
    name: "Sales Operator",
    description: "Manage sales orders, quotations, and invoices.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "products.read",
      "sales.read",
      "sales.create",
      "sales.update",
      "sales.confirm",
      "sales.cancel",
      "sales.quotations.read",
      "sales.quotations.create",
      "sales.quotations.update",
      "sales.quotations.send",
      "sales.quotations.accept",
      "sales.quotations.reject",
      "sales.quotations.expire",
      "sales.quotations.convert",
      "sales.invoices.read",
      "sales.invoices.create",
      "sales.invoices.update",
      "sales.invoices.issue",
      "sales.invoices.cancel",
    ],
  },
  {
    key: "procurement_clerk",
    name: "Procurement Clerk",
    description: "Create and receive purchase orders. Cannot approve.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "products.read",
      "vendors.read",
      "vendors.create",
      "vendors.update",
      "purchases.read",
      "purchases.create",
      "purchases.update",
      "purchases.submit",
      "purchases.receive",
      "purchases.cancel",
    ],
  },
  {
    key: "procurement_approver",
    name: "Procurement Approver",
    description: "Review and approve or reject purchase orders.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "products.read",
      "vendors.read",
      "purchases.read",
      "purchases.approve",
      "purchases.reject",
    ],
  },
  {
    key: "warehouse_receiver",
    name: "Warehouse Receiver",
    description: "Manage inventory adjustments and order receiving/confirmation.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "products.read",
      "inventory.adjust",
      "purchases.read",
      "purchases.receive",
      "sales.read",
      "sales.confirm",
    ],
  },
  {
    key: "finance_operator",
    name: "Finance Operator",
    description: "Manage finance accounts, journals, payments, and periods.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "finance.read",
      "finance.accounts.create",
      "finance.accounts.update",
      "finance.journals.create",
      "finance.journals.update",
      "finance.journals.post",
      "finance.journals.cancel",
      "finance.journals.reverse",
      "finance.receivables.update",
      "finance.payables.update",
      "finance.periods.read",
      "finance.periods.manage",
      "finance.payments.read",
      "finance.payments.create",
      "finance.expenses.read",
      "finance.expenses.create",
      "finance.expenses.reverse",
      "finance.cashbank.read",
      "finance.cashbank.manage",
      "finance.reports.read",
    ],
  },
  {
    key: "crm_operator",
    name: "CRM Operator",
    description: "Manage leads, customers, deals, and sales tasks.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "crm.read",
      "crm.create",
      "crm.update",
      "crm.convert",
      "crm.archive",
      "crm.deals.read",
      "crm.deals.create",
      "crm.deals.update",
      "crm.deals.close",
      "crm.tasks.read",
      "crm.tasks.create",
      "crm.tasks.update",
      "crm.pipeline.read",
      "crm.pipeline.update",
    ],
  },
  {
    key: "auditor",
    name: "Auditor / Read-only",
    description: "Read-only access across all operations and audit logs.",
    isSystem: false,
    permissions: [
      "dashboard.read",
      "profile.read",
      "profile.update",
      "company.read",
      "users.read",
      "roles.read",
      "products.read",
      "sales.read",
      "sales.quotations.read",
      "sales.invoices.read",
      "vendors.read",
      "purchases.read",
      "finance.read",
      "finance.periods.read",
      "finance.payments.read",
      "finance.expenses.read",
      "finance.cashbank.read",
      "finance.reports.read",
      "crm.read",
      "crm.deals.read",
      "crm.tasks.read",
      "crm.pipeline.read",
      "audit.read",
    ],
  },
  {
    key: "staff",
    name: "Staff",
    description: "Basic dashboard and profile access.",
    isSystem: true,
    permissions: STAFF_PERMISSIONS,
  },
];

export async function ensurePermissions(client: RbacClient) {
  for (const permission of DEFAULT_PERMISSIONS) {
    await client.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: permission,
    });
  }
}

export async function createDefaultCompanyRoles(client: RbacClient, companyId: string) {
  await ensurePermissions(client);

  const roles = await Promise.all(
    ROLE_TEMPLATES.map((template) =>
      client.role.upsert({
        where: { companyId_key: { companyId, key: template.key } },
        update: {
          name: template.name,
          description: template.description,
          isSystem: template.isSystem,
        },
        create: {
          companyId,
          name: template.name,
          key: template.key,
          description: template.description,
          isSystem: template.isSystem,
        },
      })
    )
  );

  const permissions = await client.permission.findMany({
    where: { key: { in: [...new Set(ROLE_TEMPLATES.flatMap((t) => t.permissions))] } },
    select: { id: true, key: true },
  });

  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (let i = 0; i < ROLE_TEMPLATES.length; i++) {
    const template = ROLE_TEMPLATES[i];
    const roleId = roles[i].id;

    await client.rolePermission.createMany({
      data: template.permissions.map((key) => ({
        roleId,
        permissionId: permissionByKey.get(key)!,
      })),
      skipDuplicates: true,
    });
  }

  const adminRole = roles.find((r) => r.key === "admin")!;
  const staffRole = roles.find((r) => r.key === "staff")!;

  return { adminRole, staffRole };
}

export async function assignAdminRole(client: RbacClient, userId: string, companyId: string) {
  const adminRole = await client.role.findUnique({
    where: { companyId_key: { companyId, key: "admin" } },
    select: { id: true },
  });

  if (!adminRole) {
    throw new Error("Company Admin role is missing.");
  }

  await client.userRole.create({
    data: {
      userId,
      roleId: adminRole.id,
    },
  });
}
