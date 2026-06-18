import { DEFAULT_PERMISSIONS, type PermissionKey } from "./default-permissions";

type RbacClient = {
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
  "vendors.read",
  "vendors.create",
  "vendors.update",
  "purchases.read",
  "purchases.create",
  "purchases.update",
  "purchases.receive",
  "purchases.cancel",
  "finance.read",
  "finance.accounts.create",
  "finance.accounts.update",
  "finance.journals.create",
  "finance.journals.update",
  "finance.journals.post",
  "finance.journals.cancel",
  "finance.receivables.update",
  "finance.payables.update",
  "crm.read",
  "crm.create",
  "crm.update",
  "crm.convert",
  "crm.archive",
  "audit.read",
];

const STAFF_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "profile.read",
  "profile.update",
  "products.read",
  "sales.read",
  "vendors.read",
  "purchases.read",
  "finance.read",
  "crm.read",
  "crm.create",
  "crm.update",
];

export async function ensurePermissions(client: RbacClient) {
  await Promise.all(
    DEFAULT_PERMISSIONS.map((permission) =>
      client.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      }),
    ),
  );
}

export async function createDefaultCompanyRoles(client: RbacClient, companyId: string) {
  await ensurePermissions(client);

  const adminRole = await client.role.upsert({
    where: { companyId_key: { companyId, key: "admin" } },
    update: {
      name: "Company Admin",
      description: "Full control inside the company workspace.",
      isSystem: true,
    },
    create: {
      companyId,
      name: "Company Admin",
      key: "admin",
      description: "Full control inside the company workspace.",
      isSystem: true,
    },
  });

  const staffRole = await client.role.upsert({
    where: { companyId_key: { companyId, key: "staff" } },
    update: {
      name: "Staff",
      description: "Basic dashboard and profile access.",
      isSystem: true,
    },
    create: {
      companyId,
      name: "Staff",
      key: "staff",
      description: "Basic dashboard and profile access.",
      isSystem: true,
    },
  });

  const permissions = await client.permission.findMany({
    where: { key: { in: [...ADMIN_PERMISSIONS] } },
    select: { id: true, key: true },
  });

  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  await client.rolePermission.createMany({
    data: ADMIN_PERMISSIONS.map((key) => ({
      roleId: adminRole.id,
      permissionId: permissionByKey.get(key)!,
    })),
    skipDuplicates: true,
  });

  await client.rolePermission.createMany({
    data: STAFF_PERMISSIONS.map((key) => ({
      roleId: staffRole.id,
      permissionId: permissionByKey.get(key)!,
    })),
    skipDuplicates: true,
  });

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
