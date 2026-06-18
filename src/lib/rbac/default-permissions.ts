export const DEFAULT_PERMISSIONS = [
  { key: "dashboard.read", module: "dashboard", action: "read", description: "View dashboard" },
  { key: "profile.read", module: "profile", action: "read", description: "View own profile" },
  { key: "profile.update", module: "profile", action: "update", description: "Update own profile" },
  { key: "company.read", module: "company", action: "read", description: "View company details" },
  { key: "users.read", module: "users", action: "read", description: "View users" },
  { key: "users.create", module: "users", action: "create", description: "Create users" },
  { key: "users.update", module: "users", action: "update", description: "Update users" },
  { key: "users.disable", module: "users", action: "disable", description: "Disable users" },
  { key: "roles.read", module: "roles", action: "read", description: "View roles" },
  { key: "roles.assign", module: "roles", action: "assign", description: "Assign roles" },
  { key: "roles.update", module: "roles", action: "update", description: "Update role permissions" },
  { key: "products.read", module: "products", action: "read", description: "View products" },
  { key: "products.create", module: "products", action: "create", description: "Create products" },
  { key: "products.update", module: "products", action: "update", description: "Update products" },
  { key: "products.delete", module: "products", action: "delete", description: "Archive products" },
  { key: "inventory.adjust", module: "inventory", action: "adjust", description: "Adjust stock quantity" },
  { key: "sales.read", module: "sales", action: "read", description: "View sales orders" },
  { key: "sales.create", module: "sales", action: "create", description: "Create sales orders" },
  { key: "sales.update", module: "sales", action: "update", description: "Update sales orders" },
  { key: "sales.confirm", module: "sales", action: "confirm", description: "Confirm sales orders" },
  { key: "sales.cancel", module: "sales", action: "cancel", description: "Cancel sales orders" },
  { key: "vendors.read", module: "vendors", action: "read", description: "View vendors" },
  { key: "vendors.create", module: "vendors", action: "create", description: "Create vendors" },
  { key: "vendors.update", module: "vendors", action: "update", description: "Update vendors" },
  { key: "purchases.read", module: "purchases", action: "read", description: "View purchase orders" },
  { key: "purchases.create", module: "purchases", action: "create", description: "Create purchase orders" },
  { key: "purchases.update", module: "purchases", action: "update", description: "Update purchase orders" },
  { key: "purchases.receive", module: "purchases", action: "receive", description: "Receive purchase orders" },
  { key: "purchases.cancel", module: "purchases", action: "cancel", description: "Cancel purchase orders" },
  { key: "finance.read", module: "finance", action: "read", description: "View finance records" },
  {
    key: "finance.accounts.create",
    module: "finance",
    action: "accounts.create",
    description: "Create finance accounts",
  },
  {
    key: "finance.accounts.update",
    module: "finance",
    action: "accounts.update",
    description: "Update finance accounts",
  },
  {
    key: "finance.journals.create",
    module: "finance",
    action: "journals.create",
    description: "Create journal entries",
  },
  {
    key: "finance.journals.update",
    module: "finance",
    action: "journals.update",
    description: "Update draft journal entries",
  },
  {
    key: "finance.journals.post",
    module: "finance",
    action: "journals.post",
    description: "Post journal entries",
  },
  {
    key: "finance.journals.cancel",
    module: "finance",
    action: "journals.cancel",
    description: "Cancel draft journal entries",
  },
  {
    key: "finance.receivables.update",
    module: "finance",
    action: "receivables.update",
    description: "Update receivables",
  },
  {
    key: "finance.payables.update",
    module: "finance",
    action: "payables.update",
    description: "Update payables",
  },
  { key: "crm.read", module: "crm", action: "read", description: "View CRM leads and customers" },
  { key: "crm.create", module: "crm", action: "create", description: "Create CRM leads and customers" },
  { key: "crm.update", module: "crm", action: "update", description: "Update CRM leads and customers" },
  { key: "crm.convert", module: "crm", action: "convert", description: "Convert leads to customers" },
  { key: "crm.archive", module: "crm", action: "archive", description: "Archive CRM leads and customers" },
  { key: "audit.read", module: "audit", action: "read", description: "View audit logs" },
] as const;

export type PermissionKey = (typeof DEFAULT_PERMISSIONS)[number]["key"];

const permissionKeys = new Set(DEFAULT_PERMISSIONS.map((permission) => permission.key));

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeys.has(value as PermissionKey);
}
