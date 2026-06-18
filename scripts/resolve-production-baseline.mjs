import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "prisma/migrations";
const args = new Set(process.argv.slice(2));

function getArgValue(prefix) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function discoverMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => {
      const fullPath = join(MIGRATIONS_DIR, entry);
      return (
        statSync(fullPath).isDirectory() &&
        existsSync(join(fullPath, "migration.sql"))
      );
    })
    // Directory names are timestamp-prefixed, so a lexical sort is chronological.
    .sort();
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
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveMigration(name) {
  // Capture output so the baseline stays idempotent: a migration that is
  // already recorded as applied should be skipped instead of failing the run.
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--applied", name],
    {
      encoding: "utf8",
      shell: true,
      env: process.env,
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status === 0) {
    return;
  }

  if (/already recorded as applied/i.test(output)) {
    console.log(`Skipping ${name}: already recorded as applied.`);
    return;
  }

  process.exit(result.status ?? 1);
}

const migrations = discoverMigrations();

if (migrations.length === 0) {
  console.error(`No migrations found in ${MIGRATIONS_DIR}. Nothing to baseline.`);
  process.exit(1);
}

if (!args.has("--apply")) {
  console.error(
    [
      "Refusing to modify migration history without --apply.",
      "",
      "This command marks the existing production database as already having",
      "every committed migration, so it can switch from `prisma db push` to",
      "`prisma migrate deploy` without recreating existing tables.",
      "",
      "Migrations that will be marked as applied:",
      ...migrations.map((name) => `  - ${name}`),
      "",
      "Run:",
      "npm run prisma:baseline:production -- --apply",
    ].join("\n"),
  );
  process.exit(1);
}

const explicitEnvFile = getArgValue("--env-file=");
const loadedEnvFile =
  loadEnvFile(explicitEnvFile) ||
  loadEnvFile(".env.production.local") ||
  loadEnvFile(".env");

if (!process.env.DATABASE_URL) {
  console.error(
    [
      "DATABASE_URL is missing. Pull or provide the production database URL before running this command.",
      "",
      "Supported options:",
      "1. Set DATABASE_URL in the current shell.",
      "2. Create .env.production.local with DATABASE_URL.",
      "3. Pass --env-file=path/to/envfile.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!loadedEnvFile && !explicitEnvFile) {
  console.log("Using DATABASE_URL from the current shell environment.");
}

console.log("Resolving production baseline for all committed migrations:");
for (const name of migrations) {
  console.log(`  - ${name}`);
}

for (const name of migrations) {
  console.log(`\nResolving baseline migration: ${name}`);
  resolveMigration(name);
}

console.log("\nChecking migration status after baseline resolve.");
run("npx", ["prisma", "migrate", "status"]);
