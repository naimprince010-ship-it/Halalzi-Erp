import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const writePlan = args.has("--write-plan");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeTarget(value) {
  return (value ?? "").trim().toLowerCase();
}

function isProductionTarget(target) {
  return target === "production" || target === "prod";
}

function buildChecklist(target) {
  return {
    helper: "HAL-127 non-destructive demo helper",
    timestamp: new Date().toISOString(),
    target,
    guardrails: [
      "Never run against production client data.",
      "Never print secrets.",
      "Never delete or mutate database records.",
      "Use dedicated demo/sandbox tenant for onboarding rehearsals.",
    ],
    onboardingChecklist: [
      "Register company and verify first admin account status.",
      "Assign least-privilege staff roles and validate 403 boundaries.",
      "Prepare demo-safe products, vendors, sales/purchase orders, finance records, and CRM records.",
      "Run production smoke checks after onboarding or role updates.",
      "Review runtime logs and confirm no unresolved high-severity errors.",
    ],
    demoDataTargets: {
      products: "15-30",
      vendors: "5-10",
      purchaseOrders: "6-12",
      salesOrders: "8-15",
      financeAccounts: "8-20",
      receivables: "5-12",
      payables: "5-12",
      crmLeadsDealsTasks: "10-25",
    },
  };
}

function printUsage() {
  console.log(
    [
      "HAL-127 Demo Helper (non-destructive)",
      "",
      "Usage:",
      "  DEMO_HELPER_ENABLED=true DEMO_TARGET=staging npm run demo:hal127:helper -- --apply",
      "  DEMO_HELPER_ENABLED=true DEMO_TARGET=staging npm run demo:hal127:helper -- --apply --write-plan",
      "",
      "Rules:",
      "  - Requires --apply.",
      "  - Requires DEMO_HELPER_ENABLED=true.",
      "  - Requires DEMO_TARGET and refuses prod/production.",
      "  - Never reads DATABASE_URL or other secrets.",
      "  - Never writes to any database.",
    ].join("\n"),
  );
}

function writeLocalPlanFile(plan) {
  const planPath = resolve(process.cwd(), "outputs", "hal127-demo-plan.json");
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`Wrote local plan artifact: ${planPath}`);
}

function main() {
  if (!apply) {
    printUsage();
    fail("Refusing to run without --apply.");
  }

  if (process.env.DEMO_HELPER_ENABLED !== "true") {
    fail("Refusing to run: set DEMO_HELPER_ENABLED=true.");
  }

  const target = normalizeTarget(process.env.DEMO_TARGET);
  if (!target) {
    fail("Refusing to run: DEMO_TARGET is required and must be non-production.");
  }

  if (isProductionTarget(target)) {
    fail("Refusing to run: DEMO_TARGET cannot be production/prod.");
  }

  const plan = buildChecklist(target);
  console.log(JSON.stringify({ ok: true, mode: "read-only", ...plan }, null, 2));

  if (writePlan) {
    writeLocalPlanFile(plan);
  }
}

main();