import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function includesAll(content, values) {
  return values.every((value) => content.includes(value));
}

const checks = [];

function check(name, passed, details = "") {
  checks.push({ name, passed, details });
}

const schema = await read("prisma/schema.prisma");
const permissions = await read("src/lib/rbac/default-permissions.ts");
const roles = await read("src/lib/rbac/default-roles.ts");
const posShared = await read("src/app/api/pos/_shared.ts");
const posProducts = await read("src/app/api/pos/products/route.ts");
const posSales = await read("src/app/api/pos/sales/route.ts");
const posDetail = await read("src/app/api/pos/sales/[id]/route.ts");
const posReceipt = await read("src/app/api/pos/sales/[id]/receipt/route.ts");
const posSummary = await read("src/app/api/pos/summary/route.ts");
const migration = await read("prisma/migrations/20260625150000_add_pos_foundation/migration.sql");

check("schema_has_pos_models", includesAll(schema, ["model PosSale", "model PosSaleItem", "enum PosSaleStatus"]));
check(
  "schema_has_pos_stock_and_payment_enums",
  includesAll(schema, ["pos_sale_complete", "pos_sale_cancel", "pos_sale", "mobile_money"]),
);
check(
  "migration_creates_pos_tables",
  includesAll(migration, ['CREATE TABLE "PosSale"', 'CREATE TABLE "PosSaleItem"', 'CREATE TYPE "PosSaleStatus"']),
);
check(
  "rbac_has_pos_permissions",
  includesAll(permissions, ["pos.read", "pos.create", "pos.cancel", "pos.receipts.print", "pos.sessions.read"]),
);
check("rbac_has_cashier_template", includesAll(roles, ['key: "cashier"', '"pos.create"', '"pos.receipts.print"']));
check("shared_helper_validates_pos_sales", includesAll(posShared, ["createPosSaleSchema", "preparePosSaleItems"]));
check(
  "product_search_is_limited",
  includesAll(posProducts, ["take: limit + 1", "nextCursor", "hasMore", "Math.min(Math.max(Math.trunc(parsed), 1), 50)"]),
);
check(
  "sale_creation_is_atomic",
  includesAll(posSales, ["prisma.$transaction", "preparePosSaleItems", "recordStockLedgerEntry", "currentBalance: { increment"]),
);
check(
  "sale_routes_require_pos_permissions",
  includesAll(posSales + posProducts + posDetail + posReceipt + posSummary, [
    'requirePermission("pos.create")',
    'requirePermission("pos.read")',
    'requirePermission("pos.receipts.print")',
  ]),
);
check("receipt_uses_print_helper", includesAll(posReceipt, ["renderPrintableDocument", "POS Receipt"]));
check("summary_endpoint_exists", includesAll(posSummary, ["todaySummary", "latestSales"]));

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-147",
  title: "POS schema/API foundation verification",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-147_pos_schema_api_foundation_verification.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-147_pos_schema_api_foundation_verification.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-147 verification passed (${checks.length}/${checks.length}).`);
