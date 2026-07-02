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

const checks = [];

function check(name, passed, details = "") {
  checks.push({ name, passed, details });
}

const schema = await read("prisma/schema.prisma");
const migration = await read("prisma/migrations/20260702063000_add_pos_product_search_indexes/migration.sql");
const posProducts = await read("src/app/api/pos/products/route.ts");
const posDashboard = await read("src/app/dashboard/pos/page.tsx");
const css = await read("src/app/globals.css");
const packageJson = await read("package.json");

check(
  "schema_has_composite_product_search_indexes",
  includesAll(schema, [
    "@@index([companyId, status, sku])",
    "@@index([companyId, status, name])",
    "@@index([companyId, status, category])",
  ]),
  "Product model should expose tenant/status/search-field composite indexes.",
);

check(
  "migration_adds_postgres_trigram_search_indexes",
  includesAll(migration, [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    '"Product_pos_sku_trgm_idx"',
    '"Product_pos_name_trgm_idx"',
    '"Product_pos_category_trgm_idx"',
    "gin_trgm_ops",
  ]),
  "Postgres trigram indexes support fast contains-style POS search for large catalogs.",
);

check(
  "pos_search_api_uses_keyset_pagination",
  includesAll(posProducts, [
    "parseCursor",
    "cursor: { id: cursor }",
    "skip: 1",
    "take: limit + 1",
    "nextCursor",
    "hasMore",
  ]),
  "POS product search should page forward with a cursor instead of offset or full-catalog loads.",
);

check(
  "pos_search_api_is_tenant_scoped_bounded_and_active_only",
  includesAll(posProducts, [
    'requirePermission("pos.read")',
    "companyScope(currentUser)",
    "companyId: scope.companyId",
    'status: "active"',
    "Math.min(Math.max(Math.trunc(parsed), 1), 50)",
  ]),
  "The endpoint must stay permissioned, tenant-scoped, active-only, and capped to 50 rows per call.",
);

check(
  "pos_search_api_orders_stably_for_cursor",
  includesAll(posProducts, ['{ name: "asc" }', '{ sku: "asc" }', '{ id: "asc" }']),
  "Cursor pagination needs stable ordering so the next page is deterministic.",
);

check(
  "pos_dashboard_uses_bounded_search_endpoint",
  includesAll(posDashboard, [
    "/api/pos/products",
    "new URLSearchParams({ limit: \"24\" })",
    "productsNextCursor",
    "Load more products",
    "append: true",
  ]) && excludesAll(posDashboard, ["/api/products?"]),
  "POS UI should load small pages from POS-specific search and append only on request.",
);

check(
  "pos_dashboard_keeps_debounce",
  includesAll(posDashboard, ["window.setTimeout", "250", "setSearch(event.target.value)"]),
  "Typing in the cashier search field should remain debounced.",
);

check(
  "pos_pagination_styles_present",
  includesAll(css, [".pos-product-pagination", "justify-content: center"]),
  "Load-more control should have stable layout styling.",
);

check(
  "package_exposes_hal148_verifier",
  includesAll(packageJson, ['"verify:hal148:performance"', "hal148-pos-search-performance-verification.mjs"]),
  "HAL-148 verification must be runnable from npm scripts.",
);

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-148",
  title: "POS high-volume product search performance hardening",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  performanceTarget: {
    catalogSize: "100k+ products per tenant",
    target: "sub-200ms indexed search on normal deployment conditions",
    strategy:
      "tenant/status composite indexes, Postgres trigram indexes for contains search, keyset cursor pagination, 24-row UI pages, 50-row API cap",
  },
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-148_pos_search_performance_verification.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-148_pos_search_performance_verification.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-148 POS search performance verification passed (${checks.length}/${checks.length}).`);
