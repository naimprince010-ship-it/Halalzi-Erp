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

const schema = await read("prisma/schema.prisma");
const migration = await read("prisma/migrations/20260702071000_add_pos_sessions/migration.sql");
const roles = await read("src/lib/rbac/default-roles.ts");
const sessionsRoute = await read("src/app/api/pos/sessions/route.ts");
const closeRoute = await read("src/app/api/pos/sessions/[id]/close/route.ts");
const salesRoute = await read("src/app/api/pos/sales/route.ts");
const summaryRoute = await read("src/app/api/pos/summary/route.ts");
const posDashboard = await read("src/app/dashboard/pos/page.tsx");
const css = await read("src/app/globals.css");
const packageJson = await read("package.json");
const cashierRole = roleBlock(roles, "cashier");

check(
  "schema_has_pos_session_model",
  includesAll(schema, [
    "enum PosSessionStatus",
    "model PosSession",
    "posSessionId",
    "openingFloat",
    "closingCash",
    "expectedCash",
    "variance",
    "cashierPosSessions",
  ]),
  "Schema should persist POS sessions, cash closeout values, and sale linkage.",
);

check(
  "migration_creates_pos_sessions",
  includesAll(migration, [
    'CREATE TYPE "PosSessionStatus"',
    'CREATE TABLE "PosSession"',
    'ALTER TABLE "PosSale" ADD COLUMN "posSessionId"',
    'PosSession_companyId_cashierUserId_status_idx',
    'PosSale_posSessionId_fkey',
  ]),
  "Migration should add POS session table, indexes, and sale relation.",
);

check(
  "cashier_role_is_minimum_but_session_ready",
  includesAll(cashierRole, [
    '"products.read"',
    '"pos.read"',
    '"pos.create"',
    '"pos.receipts.print"',
    '"pos.sessions.read"',
    '"pos.sessions.manage"',
  ]) && excludesAll(cashierRole, ['"products.create"', '"products.update"', '"users.', '"roles.', '"finance.', '"inventory.adjust"', '"pos.cancel"']),
  "Cashier should be able to sell, print, and manage own POS sessions without broader admin/finance/inventory powers.",
);

check(
  "session_open_route_is_guarded_and_audited",
  includesAll(sessionsRoute, [
    'requirePermission("pos.sessions.manage")',
    "existingOpenSession",
    "Close the current POS session before opening a new one.",
    "pos.session.open",
    "recordAuditLog",
  ]),
  "Opening a session should require session permission, block duplicate open sessions, and audit the action.",
);

check(
  "session_close_route_calculates_cash_variance",
  includesAll(closeRoute, [
    'requirePermission("pos.sessions.manage")',
    "cashierUserId: currentUser.user.id",
    "saleSummary",
    "expectedCash",
    "variance",
    "pos.session.close",
  ]),
  "Closing a session should be own-session scoped and calculate expected cash and variance.",
);

check(
  "pos_sales_attach_to_open_session",
  includesAll(salesRoute, [
    "activeSession",
    "tx.posSession.findFirst",
    'status: "open"',
    "posSessionId: activeSession?.id ?? null",
    "posSessionId: sale.posSessionId",
  ]),
  "POS sales should link to the cashier's open session when one exists.",
);

check(
  "summary_includes_active_session_and_daily_cash",
  includesAll(summaryRoute, [
    "activeSession",
    "todaySessionSummary",
    "openingFloat",
    "closingCash",
    "expectedCash",
    "variance",
  ]),
  "POS summary should expose current session and daily cash closeout values.",
);

check(
  "dashboard_exposes_session_controls",
  includesAll(posDashboard, [
    "canManageSessions",
    "loadPosSummary",
    "openPosSession",
    "closePosSession",
    "/api/pos/sessions",
    "/api/pos/sessions/${activeSession.id}/close",
    "Closing cash",
    "Opening float",
  ]),
  "Dashboard should show session status and open/close controls for permitted cashiers.",
);

check(
  "session_styles_present",
  includesAll(css, [".pos-session-panel", ".pos-session-actions"]),
  "Session panel should have stable dashboard styling.",
);

check(
  "package_exposes_hal146_verifier",
  includesAll(packageJson, ['"verify:hal146:pos-session"', "hal146-pos-cashier-session-verification.mjs"]),
  "HAL-146 verification must be runnable from npm scripts.",
);

const failed = checks.filter((item) => !item.passed);
const artifact = {
  issue: "HAL-146",
  title: "POS cashier role and session hardening",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
};

const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(path.join(root, "outputs", "HAL-146_pos_cashier_session_verification.json"), artifactJson);
await writeFile(path.join(root, "..", "outputs", "HAL-146_pos_cashier_session_verification.json"), artifactJson);

if (failed.length > 0) {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}

console.log(`HAL-146 POS cashier/session verification passed (${checks.length}/${checks.length}).`);
