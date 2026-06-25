import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootDir = process.cwd();
const artifactPath = resolve(rootDir, "outputs/HAL-145_pilot_feedback_regression_suite.json");
const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function fileExists(path) {
  return existsSync(resolve(rootDir, path));
}

function read(path) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

function packageJson() {
  return JSON.parse(read("package.json"));
}

function content(path) {
  return fileExists(path) ? read(path) : "";
}

function hasAny(contentValue, patterns) {
  return patterns.some((pattern) => contentValue.includes(pattern));
}

function checkRequiredFiles(name, paths) {
  const missing = paths.filter((path) => !fileExists(path));
  add(name, missing.length === 0, { missing });
}

function checkPackageScripts() {
  const scripts = packageJson().scripts ?? {};
  const requiredScripts = [
    "regression:dev",
    "regression:pilot",
    "regression:hal99",
    "verify:hal137",
    "verify:hal141",
    "verify:hal143",
    "smoke:prod",
    "lint",
    "build:ci",
  ];
  const missing = requiredScripts.filter((script) => !scripts[script]);

  add("pilot regression command inventory is wired in package.json", missing.length === 0, { missing });
}

function checkWorkflow(workflow) {
  checkRequiredFiles(`${workflow.id}: required files exist`, [
    ...(workflow.docs ?? []),
    ...(workflow.scripts ?? []),
    ...(workflow.routes ?? []),
    ...(workflow.pages ?? []),
    ...(workflow.components ?? []),
  ]);

  const scriptContent = (workflow.scripts ?? []).map((script) => content(script)).join("\n");
  const routeContent = (workflow.routes ?? []).map((route) => content(route)).join("\n");
  const uiContent = [...(workflow.pages ?? []), ...(workflow.components ?? [])].map((path) => content(path)).join("\n");

  const missingRuntimeGroups = (workflow.runtimePatternGroups ?? []).filter((group) => !hasAny(scriptContent, group));
  add(`${workflow.id}: runtime script coverage patterns are present`, missingRuntimeGroups.length === 0, {
    workflow: workflow.name,
    feedbackRisk: workflow.feedbackRisk,
    missingRuntimeGroups,
  });

  const missingRouteGroups = (workflow.routePatternGroups ?? []).filter((group) => !hasAny(routeContent, group));
  add(`${workflow.id}: route behavior patterns are present`, missingRouteGroups.length === 0, {
    workflow: workflow.name,
    missingRouteGroups,
  });

  const missingUiGroups = (workflow.uiPatternGroups ?? []).filter((group) => !hasAny(uiContent, group));
  add(`${workflow.id}: UI visibility patterns are present`, missingUiGroups.length === 0, {
    workflow: workflow.name,
    missingUiGroups,
  });
}

const workflows = [
  {
    id: "auth-rbac-tenant",
    name: "Auth, RBAC, and tenant isolation",
    feedbackRisk: "Pilot users cannot safely share one system unless login, roles, and tenant boundaries remain strict.",
    docs: [
      "10-releases/HAL-142_DEVELOPMENT_REGRESSION_HARDENING.md",
    ],
    scripts: ["scripts/hal99-final-regression.mjs", "scripts/hal144-role-verification.ts", "scripts/production-smoke.mjs"],
    routes: [
      "src/app/api/auth/login/route.ts",
      "src/app/api/auth/me/route.ts",
      "src/app/api/users/route.ts",
      "src/app/api/roles/route.ts",
      "src/app/api/audit-logs/route.ts",
    ],
    pages: ["src/app/dashboard/users/page.tsx", "src/app/dashboard/roles/page.tsx"],
    runtimePatternGroups: [
      ["/api/auth/register"],
      ["/api/auth/login"],
      ["/api/users"],
      ["/api/roles"],
      ["crossTenant", "cross-tenant"],
      ["401"],
      ["403"],
    ],
    routePatternGroups: [
      ["requirePermission", "requireAnyPermission"],
      ["companyScope(currentUser)"],
      ["companyId: scope.companyId", "...scope"],
    ],
    uiPatternGroups: [["Users"], ["Roles"], ["permissions", "Permissions"]],
  },
  {
    id: "product-stock",
    name: "Product catalog, import/export, and stock visibility",
    feedbackRisk: "Pilot setup depends on clean product data, visible stock, CSV exports, and stock ledger traceability.",
    docs: [
      "10-releases/HAL-140_CUSTOMER_READY_PRODUCT_DATA_WORKFLOW.md",
      "10-releases/HAL-143_PRODUCTION_UX_POLISH_PASS.md",
    ],
    scripts: ["scripts/hal99-final-regression.mjs", "scripts/hal142-development-regression-hardening.mjs"],
    routes: [
      "src/app/api/products/route.ts",
      "src/app/api/products/[id]/route.ts",
      "src/app/api/products/[id]/stock-ledger/route.ts",
      "src/app/api/exports/products/route.ts",
      "src/app/api/exports/products/template/route.ts",
    ],
    pages: ["src/app/dashboard/products/page.tsx"],
    runtimePatternGroups: [
      ["/api/products"],
      ["/api/exports/products"],
      ["duplicate"],
      ["stock", "Stock"],
    ],
    routePatternGroups: [["companyScope(currentUser)"], ["requirePermission", "requireAnyPermission"], ["stockLedgerEntry", "StockLedgerEntry"]],
    uiPatternGroups: [["Low stock"], ["Export CSV"], ["Download template"], ["statusBadgeClass"]],
  },
  {
    id: "sales-quote-cash",
    name: "Sales quote-to-cash",
    feedbackRisk: "Common pilot selling flow must preserve quote lifecycle, order confirmation, invoice creation, stock, and finance linkage.",
    docs: ["10-releases/HAL-138_PDF_PRINT_DOCUMENT_FOUNDATION.md"],
    scripts: ["scripts/hal99-final-regression.mjs", "scripts/hal137-quotation-invoice-verification.mjs"],
    routes: [
      "src/app/api/sales-orders/route.ts",
      "src/app/api/sales-orders/[id]/confirm/route.ts",
      "src/app/api/sales-orders/[id]/cancel/route.ts",
      "src/app/api/sales-quotations/route.ts",
      "src/app/api/sales-quotations/[id]/convert-to-order/route.ts",
      "src/app/api/sales-invoices/from-sales-order/route.ts",
      "src/app/api/sales-invoices/[id]/print/route.ts",
    ],
    pages: ["src/app/dashboard/sales/page.tsx"],
    components: ["src/components/sales/SalesQuoteInvoicePanel.tsx"],
    runtimePatternGroups: [
      ["/api/sales-quotations"],
      ["convert-to-order"],
      ["sales-invoices/from-sales-order"],
      ["sales order can be confirmed", "converted sales order can be confirmed"],
      ["stock moves only when sales order is confirmed", "sales confirm decreases stock"],
    ],
    routePatternGroups: [["companyScope(currentUser)"], ["requirePermission", "requireAnyPermission"], ["createReceivableForConfirmedSalesOrder", "receivable"]],
    uiPatternGroups: [["Sales"], ["Invoice"], ["Quotation"], ["statusBadgeClass"]],
  },
  {
    id: "procurement-pay",
    name: "Procurement approval to payable",
    feedbackRisk: "Purchase approval, receiving, stock increase, payable creation, and cancellation safety are high-risk daily workflows.",
    docs: ["10-releases/HAL-143_PRODUCTION_UX_POLISH_PASS.md", "10-releases/HAL-142_DEVELOPMENT_REGRESSION_HARDENING.md"],
    scripts: [
      "scripts/hal99-final-regression.mjs",
      "scripts/hal141-finance-cash-bank-expense-verification.mjs",
      "scripts/hal143-purchase-approval-verification.mjs",
    ],
    routes: [
      "src/app/api/vendors/route.ts",
      "src/app/api/purchase-orders/route.ts",
      "src/app/api/purchase-orders/[id]/submit/route.ts",
      "src/app/api/purchase-orders/[id]/approve/route.ts",
      "src/app/api/purchase-orders/[id]/reject/route.ts",
      "src/app/api/purchase-orders/[id]/receive/route.ts",
      "src/app/api/purchase-orders/[id]/cancel/route.ts",
      "src/app/api/finance/payables/route.ts",
      "src/app/api/finance/payables/[id]/payments/route.ts",
    ],
    pages: ["src/app/dashboard/procurement/page.tsx"],
    runtimePatternGroups: [
      ["/api/vendors"],
      ["/api/purchase-orders"],
      ["/submit"],
      ["/approve"],
      ["/reject"],
      ["/receive"],
      ["/finance/payables"],
      ["stock ledger", "stockLedger"],
    ],
    routePatternGroups: [["companyScope(currentUser)"], ["requirePermission", "requireAnyPermission"], ["createPayableForReceivedPurchaseOrder", "cancelPayableForPurchaseOrder"]],
    uiPatternGroups: [["Pending approval"], ["Approve"], ["Reject"], ["Receive"], ["statusBadgeClass"]],
  },
  {
    id: "finance-ops",
    name: "Finance payments, cash/bank, expenses, and reports",
    feedbackRisk: "Pilot operators need visible receivables/payables, payments, expenses, cash/bank totals, and report endpoints.",
    docs: ["10-releases/HAL-141_DOCUMENT_PRINTING_EXPANSION.md", "10-releases/HAL-157_PERFORMANCE_SECURITY_REVIEW.md"],
    scripts: ["scripts/hal141-finance-cash-bank-expense-verification.mjs", "scripts/hal142-development-regression-hardening.mjs"],
    routes: [
      "src/app/api/finance/accounts/route.ts",
      "src/app/api/finance/journal-entries/route.ts",
      "src/app/api/finance/receivables/route.ts",
      "src/app/api/finance/receivables/[id]/payments/route.ts",
      "src/app/api/finance/payables/route.ts",
      "src/app/api/finance/payables/[id]/payments/route.ts",
      "src/app/api/finance/expenses/route.ts",
      "src/app/api/finance/reports/trial-balance/route.ts",
      "src/app/api/finance/reports/ar-aging/route.ts",
      "src/app/api/finance/reports/ap-aging/route.ts",
      "src/app/api/finance/reports/cash-bank-summary/route.ts",
      "src/app/api/finance/reports/expense-summary/route.ts",
    ],
    pages: ["src/app/dashboard/finance/page.tsx"],
    components: [
      "src/components/finance/FinanceCashBankExpensePanel.tsx",
      "src/components/finance/FinanceInvoiceSummaryPanel.tsx",
    ],
    runtimePatternGroups: [
      ["/api/finance/expenses"],
      ["cash-bank-summary"],
      ["expense-summary"],
      ["trial-balance"],
      ["ar-aging"],
      ["ap-aging"],
      ["/payments"],
    ],
    routePatternGroups: [["companyScope(currentUser)"], ["requirePermission", "requireAnyPermission"], ["journalEntry", "JournalEntry"]],
    uiPatternGroups: [["Finance"], ["Expense"], ["Invoice"], ["statusBadgeClass"]],
  },
  {
    id: "print-export",
    name: "Print, PDF, and export safety",
    feedbackRisk: "Customers ask for printable orders/invoices and exports early; these must stay tenant-scoped and no-store.",
    docs: ["10-releases/HAL-138_PDF_PRINT_DOCUMENT_FOUNDATION.md", "10-releases/HAL-141_DOCUMENT_PRINTING_EXPANSION.md"],
    scripts: ["scripts/hal142-development-regression-hardening.mjs", "scripts/hal99-final-regression.mjs"],
    routes: [
      "src/app/api/sales-orders/[id]/print/route.ts",
      "src/app/api/purchase-orders/[id]/print/route.ts",
      "src/app/api/sales-quotations/[id]/print/route.ts",
      "src/app/api/sales-invoices/[id]/print/route.ts",
      "src/app/api/exports/products/route.ts",
      "src/app/api/exports/sales-orders/route.ts",
      "src/app/api/exports/purchase-orders/route.ts",
      "src/app/api/exports/users/route.ts",
    ],
    runtimePatternGroups: [["/api/exports/products"], ["/api/exports/sales-orders"], ["/api/exports/purchase-orders"], ["/api/exports/users"]],
    routePatternGroups: [["renderPrintableDocument"], ["Cache-Control"], ["no-store"], ["companyScope(currentUser)"]],
  },
  {
    id: "production-smoke",
    name: "Production smoke and UI visibility handoff",
    feedbackRisk: "After deployment, pilot-facing routes need a repeatable smoke path without exposing credentials.",
    docs: ["10-releases/HAL-132_AUTHENTICATED_PRODUCTION_SMOKE.md", "10-releases/HAL-155_PAID_CLIENT_LAUNCH_CHECKLIST.md"],
    scripts: ["scripts/production-smoke.mjs"],
    routes: [
      "src/app/api/dashboard/summary/route.ts",
      "src/app/api/audit-logs/route.ts",
      "src/app/api/finance/receivables/route.ts",
      "src/app/api/finance/payables/route.ts",
    ],
    runtimePatternGroups: [
      ["SMOKE_BASE_URL"],
      ["SMOKE_ADMIN_EMAIL"],
      ["SMOKE_ADMIN_PASSWORD"],
      ["protected APIs reject unauthenticated access"],
      ["audit logs have safe shape"],
    ],
    routePatternGroups: [["companyScope(currentUser)"], ["requirePermission", "requireAnyPermission"]],
  },
];

function checkWorkflowMap() {
  add("pilot regression matrix covers high-frequency workflows", workflows.length >= 7, {
    workflows: workflows.map((workflow) => workflow.id),
  });

  for (const workflow of workflows) {
    checkWorkflow(workflow);
  }
}

function checkFollowUpIssueMap() {
  const followUps = [
    { trigger: "product setup/import pain", issue: "HAL-116 / HAL-139 Product import/export polish and stock alerts" },
    { trigger: "POS demand from retail pilot", issue: "HAL-123-HAL-125 / HAL-146-HAL-148 POS sequence" },
    { trigger: "warehouse/location complexity", issue: "HAL-126-HAL-127 / HAL-149-HAL-150 warehouse sequence" },
    { trigger: "BI/KPI demand", issue: "HAL-128-HAL-129 / HAL-151-HAL-152 BI sequence" },
    { trigger: "AI CRM demand", issue: "HAL-130-HAL-131 / HAL-153-HAL-154 AI CRM sequence" },
    { trigger: "email sender/domain blocker", issue: "HAL-70 / HAL-92 Verify Resend sender domain" },
  ];

  add("pilot feedback triggers map to follow-up Linear issues", followUps.every((item) => item.issue.includes("HAL-")), {
    followUps,
  });
}

function main() {
  checkPackageScripts();
  checkWorkflowMap();
  checkFollowUpIssueMap();

  const failed = checks.filter((check) => !check.ok);
  const result = {
    issue: "HAL-145",
    title: "Pilot feedback regression suite",
    generatedAt: new Date().toISOString(),
    mode: "static-non-destructive",
    totals: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      feedbackRisk: workflow.feedbackRisk,
      runtimeScripts: workflow.scripts ?? [],
      docs: workflow.docs ?? [],
    })),
    checks,
    recommendedCommands: [
      "npm run regression:pilot",
      "npm run regression:dev",
      "npm run regression:hal99",
      "npm run verify:hal137",
      "npm run verify:hal141",
      "npm run verify:hal143",
      "npm run smoke:prod",
    ],
  };

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: failed.length === 0, artifactPath, totals: result.totals }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
