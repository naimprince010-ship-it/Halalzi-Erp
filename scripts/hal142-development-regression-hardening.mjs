import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const rootDir = process.cwd();
const apiDir = resolve(rootDir, "src/app/api");
const artifactPath = resolve(rootDir, "outputs/HAL-142_development_regression_hardening.json");
const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function read(path) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

function fileExists(path) {
  return existsSync(resolve(rootDir, path));
}

function walk(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function contentIncludes(path, patterns) {
  if (!fileExists(path)) {
    return { ok: false, missing: patterns };
  }

  const content = read(path);
  const missing = patterns.filter((pattern) => !content.includes(pattern));
  return { ok: missing.length === 0, missing };
}

function requiredFilesCheck(name, paths) {
  const missing = paths.filter((path) => !fileExists(path));
  add(name, missing.length === 0, { missing });
}

function checkRouteGuardAny(routePath, requiredGroups) {
  if (!fileExists(routePath)) {
    add(`${routePath} has required guard patterns`, false, {
      missingGroups: requiredGroups,
    });
    return;
  }

  const content = read(routePath);
  const missingGroups = requiredGroups.filter((group) => !group.some((pattern) => content.includes(pattern)));

  add(`${routePath} has required guard patterns`, missingGroups.length === 0, {
    missingGroups,
  });
}

function packageScriptCheck() {
  const packageJson = JSON.parse(read("package.json"));
  const requiredScripts = [
    "lint",
    "build:ci",
    "check",
    "regression:hal99",
    "verify:hal137",
    "verify:hal141",
    "verify:hal143",
    "smoke:prod",
  ];
  const missing = requiredScripts.filter((script) => !packageJson.scripts?.[script]);

  add("package verification scripts are present", missing.length === 0, { missing });
}

function printRouteCheck() {
  const printRoutes = [
    {
      path: "src/app/api/sales-orders/[id]/print/route.ts",
      permissions: ["requirePermission(\"sales.read\")"],
    },
    {
      path: "src/app/api/purchase-orders/[id]/print/route.ts",
      permissions: ["requirePermission(\"purchases.read\")"],
    },
    {
      path: "src/app/api/sales-quotations/[id]/print/route.ts",
      permissions: ["requirePermission(\"sales.quotations.read\")"],
    },
    {
      path: "src/app/api/sales-invoices/[id]/print/route.ts",
      permissions: ["requireAnyPermission([\"sales.invoices.read\", \"finance.read\"])"],
    },
  ];

  const results = printRoutes.map((route) => {
    const patterns = [
      "companyScope(currentUser)",
      "companyId: scope.companyId",
      "renderPrintableDocument",
      "text/html; charset=utf-8",
      "Cache-Control",
      "no-store",
      ...route.permissions,
    ];
    const result = contentIncludes(route.path, patterns);
    return { route: route.path, ok: result.ok, missingPatterns: result.missing };
  });

  add("print routes are tenant-scoped, RBAC-protected, and no-store", results.every((result) => result.ok), {
    results,
  });
}

function financeReportsCheck() {
  const reportRoutes = [
    "src/app/api/finance/reports/trial-balance/route.ts",
    "src/app/api/finance/reports/ar-aging/route.ts",
    "src/app/api/finance/reports/ap-aging/route.ts",
    "src/app/api/finance/reports/cash-bank-summary/route.ts",
    "src/app/api/finance/reports/expense-summary/route.ts",
  ];
  const missing = reportRoutes.filter((path) => !fileExists(path));
  const invalidAggregateRoute = fileExists("src/app/api/finance/reports/route.ts");

  add("finance report routes use explicit supported endpoints only", missing.length === 0 && !invalidAggregateRoute, {
    missing,
    invalidAggregateRoute,
  });
}

function routeCoverageCheck() {
  requiredFilesCheck("core module routes exist", [
    "src/app/api/auth/me/route.ts",
    "src/app/api/dashboard/summary/route.ts",
    "src/app/api/users/route.ts",
    "src/app/api/roles/route.ts",
    "src/app/api/products/route.ts",
    "src/app/api/products/[id]/stock-ledger/route.ts",
    "src/app/api/vendors/route.ts",
    "src/app/api/sales-orders/route.ts",
    "src/app/api/sales-quotations/route.ts",
    "src/app/api/sales-invoices/route.ts",
    "src/app/api/purchase-orders/route.ts",
    "src/app/api/finance/accounts/route.ts",
    "src/app/api/finance/receivables/route.ts",
    "src/app/api/finance/payables/route.ts",
    "src/app/api/crm/leads/route.ts",
    "src/app/api/crm/deals/route.ts",
    "src/app/api/audit-logs/route.ts",
  ]);

  requiredFilesCheck("core dashboard pages exist", [
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/products/page.tsx",
    "src/app/dashboard/sales/page.tsx",
    "src/app/dashboard/procurement/page.tsx",
    "src/app/dashboard/finance/page.tsx",
    "src/app/dashboard/crm/page.tsx",
    "src/app/dashboard/audit/page.tsx",
    "src/app/dashboard/users/page.tsx",
    "src/app/dashboard/roles/page.tsx",
  ]);
}

function guardCoverageCheck() {
  const guardedRoutes = [
    "src/app/api/products/route.ts",
    "src/app/api/products/[id]/route.ts",
    "src/app/api/products/[id]/stock-ledger/route.ts",
    "src/app/api/sales-orders/route.ts",
    "src/app/api/sales-quotations/route.ts",
    "src/app/api/sales-invoices/route.ts",
    "src/app/api/purchase-orders/route.ts",
    "src/app/api/finance/accounts/route.ts",
    "src/app/api/finance/receivables/route.ts",
    "src/app/api/finance/payables/route.ts",
    "src/app/api/crm/leads/route.ts",
    "src/app/api/crm/deals/route.ts",
    "src/app/api/audit-logs/route.ts",
  ];

  for (const route of guardedRoutes) {
    checkRouteGuardAny(route, [
      ["requirePermission", "requireAnyPermission"],
      ["companyScope(currentUser)"],
      ["companyId: scope.companyId", "...scope"],
    ]);
  }
}

function sensitiveFieldCheck() {
  const routeFiles = walk(apiDir).filter((file) => extname(file) === ".ts");
  const unsafeSelections = [];
  const unsafeTerms = ["passwordHash: true", "tokenHash: true", "sessionSecret: true"];

  for (const file of routeFiles) {
    const relativePath = relative(rootDir, file);
    if (relativePath === "src\\app\\api\\auth\\login\\route.ts") {
      continue;
    }

    const content = readFileSync(file, "utf8");
    const matches = unsafeTerms.filter((term) => content.includes(term));
    if (matches.length > 0) {
      unsafeSelections.push({ file: relativePath, matches });
    }
  }

  add("API routes do not select sensitive hash/session fields", unsafeSelections.length === 0, {
    unsafeSelections,
  });
}

function runtimeScriptInventoryCheck() {
  const requiredScripts = [
    "scripts/hal99-final-regression.mjs",
    "scripts/hal137-quotation-invoice-verification.mjs",
    "scripts/hal141-finance-cash-bank-expense-verification.mjs",
    "scripts/hal143-purchase-approval-verification.mjs",
    "scripts/production-smoke.mjs",
  ];
  const missing = requiredScripts.filter((path) => !fileExists(path));

  add("runtime regression and smoke scripts remain available", missing.length === 0, { missing });
}

function forbiddenRouteReferenceCheck() {
  const files = walk(resolve(rootDir, "scripts"))
    .filter((file) => [".mjs", ".js", ".ts"].includes(extname(file)))
    .map((file) => ({ file, content: readFileSync(file, "utf8") }));
  const aggregateReportRequestPattern = /request\(\s*["']\/api\/finance\/reports["']/;
  const offenders = files
    .filter(({ content }) => aggregateReportRequestPattern.test(content))
    .map(({ file }) => relative(rootDir, file));

  add("verification scripts do not target nonexistent /api/finance/reports", offenders.length === 0, {
    offenders,
  });
}

function main() {
  packageScriptCheck();
  routeCoverageCheck();
  guardCoverageCheck();
  printRouteCheck();
  financeReportsCheck();
  runtimeScriptInventoryCheck();
  sensitiveFieldCheck();
  forbiddenRouteReferenceCheck();

  const failed = checks.filter((check) => !check.ok);
  const result = {
    issue: "HAL-142",
    generatedAt: new Date().toISOString(),
    mode: "static-non-destructive",
    totals: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
    recommendedRuntimeCommands: [
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
