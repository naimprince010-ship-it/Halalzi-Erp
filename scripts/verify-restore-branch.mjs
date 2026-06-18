import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;

// Read-only restore-branch verification.
//
// This script ONLY runs SELECT count(*) queries against a RESTORED Neon branch
// to confirm the restore is healthy and the app schema is present. It never
// writes data, never touches production, and never prints connection strings.
//
// Safety design:
// - It reads RESTORE_DATABASE_URL, NOT DATABASE_URL, so it cannot accidentally
//   target the production branch from a normal shell.
// - It refuses to run if RESTORE_DATABASE_URL equals DATABASE_URL.

const args = process.argv.slice(2);

function getArgValue(prefix) {
  const arg = args.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return false;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const valueText = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = valueText;
    }
  }

  return true;
}

const explicitEnvFile = getArgValue("--env-file=");
loadEnvFile(explicitEnvFile);

const restoreUrl = process.env.RESTORE_DATABASE_URL?.trim();
const productionUrl = process.env.DATABASE_URL?.trim();

if (!restoreUrl) {
  console.error(
    [
      "RESTORE_DATABASE_URL is required and was not found.",
      "",
      "Set it to the connection string of a RESTORED Neon branch (not production).",
      "Options:",
      "  1. Set RESTORE_DATABASE_URL in the current shell.",
      "  2. Pass --env-file=path/to/envfile that defines RESTORE_DATABASE_URL.",
      "",
      "This script never writes data and never targets production.",
    ].join("\n"),
  );
  process.exit(1);
}

if (productionUrl && restoreUrl === productionUrl) {
  console.error(
    [
      "Refusing to run: RESTORE_DATABASE_URL matches DATABASE_URL.",
      "",
      "Restore verification must run against a SEPARATE restored branch/database,",
      "never against the production branch.",
    ].join("\n"),
  );
  process.exit(1);
}

// Tables to spot-check. These are read-only count probes only.
const TABLES = [
  "Company",
  "User",
  "Role",
  "Product",
  "SalesOrder",
  "PurchaseOrder",
  "FinanceAccount",
  "JournalEntry",
  "AuditLog",
];

async function main() {
  const client = new Client({ connectionString: restoreUrl });

  try {
    await client.connect();
  } catch {
    console.error(
      "Could not connect to the restore branch. Check the connection string and SSL settings.",
    );
    process.exit(1);
  }

  const results = [];
  let failed = 0;

  try {
    const versionResult = await client.query("SELECT version()");
    const version = versionResult.rows[0]?.version ?? "unknown";
    console.log(`Connected to restore branch. Server: ${version.split(",")[0]}`);

    for (const table of TABLES) {
      try {
        // Identifier is from a fixed allow-list above, not user input.
        const countResult = await client.query(
          `SELECT count(*)::int AS count FROM "${table}"`,
        );
        const count = countResult.rows[0]?.count ?? 0;
        results.push({ table, ok: true, count });
      } catch {
        failed += 1;
        results.push({ table, ok: false, count: null });
      }
    }
  } finally {
    await client.end();
  }

  console.log("\nRestore branch table check (read-only):");
  for (const row of results) {
    const status = row.ok ? "ok" : "MISSING";
    const count = row.ok ? `${row.count} rows` : "table not found";
    console.log(`  - ${row.table}: ${status} (${count})`);
  }

  const summary = {
    ok: failed === 0,
    tablesChecked: TABLES.length,
    failed,
  };

  console.log(`\n${JSON.stringify(summary, null, 2)}`);

  if (failed > 0) {
    console.error(
      "\nOne or more expected tables were missing. The restore may be incomplete or from a pre-migration point.",
    );
    process.exit(1);
  }

  console.log("\nRestore branch looks healthy (schema present, queries succeed).");
}

main().catch(() => {
  console.error("Restore verification failed unexpectedly.");
  process.exit(1);
});
