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

const page = await read("src/app/dashboard/pos/page.tsx");
const css = await read("src/app/globals.css");
const dashboardClient = await read("src/components/dashboard/DashboardClient.tsx");
const productPage = await read("src/app/dashboard/products/page.tsx");
const salesPage = await read("src/app/dashboard/sales/page.tsx");

check("pos_dashboard_route_exists", includesAll(page, ["export default function PosDashboardPage", "pos-layout"]));
check("pos_requires_permissions", includesAll(page, ['permissions.includes("pos.read")', 'permissions.includes("pos.create")', 'permissions.includes("pos.receipts.print")']));
check("pos_product_search_wired", includesAll(page, ["/api/pos/products", "URLSearchParams", "limit: \"24\""]));
check("pos_sale_create_wired", includesAll(page, ["/api/pos/sales", "Complete sale", "paymentMethod", "paymentAccountId"]));
check("pos_receipt_link_wired", includesAll(page, ["/api/pos/sales/${lastSale.id}/receipt", "Print receipt"]));
check("pos_recent_sales_wired", includesAll(page, ["loadRecentSales", "/api/pos/sales?take=8"]));
check("pos_nav_added_to_core_pages", includesAll(dashboardClient + productPage + salesPage, ["/dashboard/pos", "pos.read"]));
check("pos_styles_present", includesAll(css, [".pos-layout", ".pos-product-grid", ".pos-cart-panel", ".pos-recent-row"]));

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-148",
  linearIssue: "HAL-125",
  title: "POS dashboard UI verification",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-148_pos_dashboard_ui_verification.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-148_pos_dashboard_ui_verification.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-148 verification passed (${checks.length}/${checks.length}).`);
