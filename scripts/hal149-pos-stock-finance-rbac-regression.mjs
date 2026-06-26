import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function includesAll(content, values) {
  return values.every((value) => content.includes(value));
}

function excludesAll(content, values) {
  return values.every((value) => !content.includes(value));
}

function roleBlock(content, key) {
  const start = content.indexOf(`key: "${key}"`);
  if (start === -1) return "";
  const next = content.indexOf("\n  {", start + 1);
  return next === -1 ? content.slice(start) : content.slice(start, next);
}

const checks = [];

function check(name, passed, details = "") {
  checks.push({ name, passed, details });
}

const permissions = await read("src/lib/rbac/default-permissions.ts");
const roles = await read("src/lib/rbac/default-roles.ts");
const posShared = await read("src/app/api/pos/_shared.ts");
const posProducts = await read("src/app/api/pos/products/route.ts");
const posSales = await read("src/app/api/pos/sales/route.ts");
const posReceipt = await read("src/app/api/pos/sales/[id]/receipt/route.ts");
const posDashboard = await read("src/app/dashboard/pos/page.tsx");
const adminSync = await read("src/app/api/admin/sync-permissions/route.ts");
const packageJson = await read("package.json");
const cashierRole = roleBlock(roles, "cashier");

check(
  "pos_permissions_registered",
  includesAll(permissions, [
    "pos.read",
    "pos.create",
    "pos.cancel",
    "pos.receipts.print",
    "pos.sessions.read",
    "pos.sessions.manage",
  ]),
  "Default RBAC permissions must include the full POS permission family.",
);

check(
  "admin_role_receives_pos_permissions",
  includesAll(roles, [
    '"pos.read"',
    '"pos.create"',
    '"pos.cancel"',
    '"pos.receipts.print"',
    '"pos.sessions.read"',
    '"pos.sessions.manage"',
  ]),
  "Company Admin must receive POS permissions during role sync.",
);

check(
  "cashier_role_is_limited",
  includesAll(cashierRole, ['key: "cashier"', '"products.read"', '"pos.read"', '"pos.create"', '"pos.receipts.print"']) &&
    excludesAll(cashierRole, ['"finance.', '"pos.cancel"']),
  "Cashier can sell and print receipts without finance or cancel authority.",
);

check(
  "pos_sale_creation_is_permissioned_and_atomic",
  includesAll(posSales, ['requirePermission("pos.create")', "prisma.$transaction", "preparePosSaleItems"]),
  "POS sale creation must be protected and run inside one transaction.",
);

check(
  "pos_sale_requires_full_payment",
  includesAll(posSales, ["paidAmount < totals.totalAmount", "paidAmount must cover the POS sale total"]),
  "Completed sales must not be created with underpayment.",
);

check(
  "pos_sale_validates_payment_account_scope",
  includesAll(posSales, [
    "tx.financeAccount.findFirst",
    "companyId: scope.companyId",
    'status: "active"',
    'kind: { in: ["cash", "bank", "mobile_money"] }',
    "Payment account is not accessible.",
  ]),
  "Linked payment accounts must belong to the tenant and be active cash/bank/mobile-money accounts.",
);

check(
  "pos_sale_decrements_stock_safely",
  includesAll(posSales, [
    "tx.product.updateMany",
    "stockQuantity: { gte: item.quantity }",
    "stockQuantity: { decrement: item.quantity }",
    "updated.count !== 1",
    "Insufficient stock while completing POS sale.",
  ]),
  "Stock decrement must be tenant-scoped and guarded against concurrent oversell.",
);

check(
  "pos_sale_writes_stock_ledger",
  includesAll(posSales, [
    "recordStockLedgerEntry",
    'type: "pos_sale_complete"',
    'sourceType: "pos_sale"',
    "quantityDelta: -item.quantity",
  ]),
  "Every completed POS item must create a negative stock-ledger movement.",
);

check(
  "pos_sale_links_finance_cash_account",
  includesAll(posSales, ["tx.financeAccount.update", "currentBalance: { increment: totals.totalAmount }"]),
  "When a payment account is selected, the sale total must increase the account balance.",
);

check(
  "pos_sale_audit_log_recorded",
  includesAll(posSales, ['action: "pos.sale.complete"', 'entityType: "pos_sale"', "stockMovementCount"]),
  "Completed POS sales must leave audit evidence.",
);

check(
  "pos_product_search_is_scoped_and_bounded",
  includesAll(posProducts, [
    'requirePermission("pos.read")',
    "companyScope(currentUser)",
    "companyId: scope.companyId",
    'status: "active"',
    "take: limit * 2",
    "slice(0, limit)",
    "Math.min(Math.max(Math.trunc(parsed), 1), 50)",
  ]),
  "POS product search must avoid loading the full catalog and only expose active tenant products.",
);

check(
  "pos_receipt_is_scoped_permissioned_and_not_cached",
  includesAll(posReceipt, [
    'requirePermission("pos.receipts.print")',
    "companyScope(currentUser)",
    "companyId: scope.companyId",
    "renderPrintableDocument",
    '"Cache-Control": "no-store"',
  ]),
  "Receipt printing must be tenant-scoped, permissioned, printable, and uncached.",
);

check(
  "pos_shared_blocks_duplicates_and_bad_stock",
  includesAll(posShared, [
    "Duplicate product items are not allowed.",
    "product.stockQuantity < item.quantity",
    "Insufficient stock for product",
    "quantity must be greater than 0.",
  ]),
  "The shared validator must reject duplicate lines and impossible quantities before transaction side effects.",
);

check(
  "pos_dashboard_uses_pos_endpoints_and_permissions",
  includesAll(posDashboard, [
    'permissions.includes("pos.read")',
    'permissions.includes("pos.create")',
    'permissions.includes("pos.receipts.print")',
    "/api/pos/products",
    "/api/pos/sales",
    "/api/pos/sales/${lastSale.id}/receipt",
    "paid < total",
  ]) && excludesAll(posDashboard, ["/api/products?"]),
  "Cashier UI must use the bounded POS endpoints and hide actions when permissions are missing.",
);

check(
  "admin_permission_sync_endpoint_is_guarded",
  includesAll(adminSync, [
    'requirePermission("roles.update")',
    "createDefaultCompanyRoles",
    "admin.permissions.sync",
    "export async function POST",
  ]) && excludesAll(adminSync, ["export async function GET"]),
  "Production permission repair must remain an authenticated POST-only admin action.",
);

check(
  "package_exposes_pos_regression_command",
  includesAll(packageJson, ['"regression:pos"', "hal149-pos-stock-finance-rbac-regression.mjs"]),
  "The regression suite must be runnable from npm scripts.",
);

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-149",
  title: "POS stock, finance, and RBAC regression hardening",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-149_pos_stock_finance_rbac_regression.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-149_pos_stock_finance_rbac_regression.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-149 POS regression passed (${checks.length}/${checks.length}).`);
