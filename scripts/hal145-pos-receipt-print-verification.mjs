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

const posReceipt = await read("src/app/api/pos/sales/[id]/receipt/route.ts");
const printRenderer = await read("src/lib/print/document-html.ts");
const posDashboard = await read("src/app/dashboard/pos/page.tsx");
const packageJson = await read("package.json");

check(
  "receipt_route_is_permissioned_and_tenant_scoped",
  includesAll(posReceipt, [
    'requirePermission("pos.receipts.print")',
    "companyScope(currentUser)",
    "companyId: scope.companyId",
    "prisma.posSale.findFirst",
    "You do not have permission to access this POS receipt.",
  ]),
  "Receipt access must require receipt permission and company scope.",
);

check(
  "receipt_route_is_no_store_html",
  includesAll(posReceipt, ['"Content-Type": "text/html; charset=utf-8"', '"Cache-Control": "no-store"']),
  "Receipt response should be printable HTML and not cache private transaction data.",
);

check(
  "receipt_includes_customer_cashier_payment_and_totals",
  includesAll(posReceipt, [
    "POS Receipt",
    "Receipt number",
    "partyName: sale.customerNameSnapshot ?? \"Walk-in customer\"",
    "partyContact: sale.customerPhoneSnapshot",
    "Payment method",
    "Payment account",
    "Cashier",
    "tenderedAmount: Number(sale.paidAmount)",
    "changeAmount: Number(sale.changeAmount)",
  ]),
  "Receipt must include the visible fields a cashier/customer expects.",
);

check(
  "receipt_includes_line_items_without_internal_ids",
  includesAll(posReceipt, [
    "productNameSnapshot",
    "productSkuSnapshot",
    "quantity: item.quantity",
    "unitAmount: Number(item.unitPrice)",
    "lineTotal: Number(item.lineTotal)",
  ]) && excludesAll(posReceipt, ["productId: true", "posSaleId: true"]),
  "Receipt should show item details without exposing internal relation IDs.",
);

check(
  "shared_renderer_supports_receipt_polish",
  includesAll(printRenderer, [
    "documentNumberLabel",
    "tenderedAmount",
    "changeAmount",
    "receipt-footer",
    "Print / Save PDF",
    "escapeHtml",
  ]),
  "Shared print renderer should support receipt labels, tendered/change rows, footer text, and escaped output.",
);

check(
  "dashboard_exposes_receipt_links_only_with_permission",
  includesAll(posDashboard, [
    'permissions.includes("pos.receipts.print")',
    "canPrintReceipts",
    "/api/pos/sales/${lastSale.id}/receipt",
    "/api/pos/sales/${sale.id}/receipt",
    "target=\"_blank\"",
  ]),
  "POS dashboard receipt links should stay permission-aware and open print pages in a separate tab.",
);

check(
  "package_exposes_hal145_verifier",
  includesAll(packageJson, ['"verify:hal145:pos-receipt"', "hal145-pos-receipt-print-verification.mjs"]),
  "HAL-145 verification must be runnable from npm scripts.",
);

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-145",
  title: "POS receipt and print polish",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-145_pos_receipt_print_verification.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-145_pos_receipt_print_verification.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-145 POS receipt verification passed (${checks.length}/${checks.length}).`);
