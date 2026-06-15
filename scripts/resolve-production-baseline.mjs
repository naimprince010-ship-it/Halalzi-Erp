import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BASELINE_MIGRATION = "20260615140500_initial_core_erp";
const args = new Set(process.argv.slice(2));

function getArgValue(prefix) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
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

if (!args.has("--apply")) {
  console.error(
    [
      "Refusing to modify migration history without --apply.",
      "",
      "This command marks the existing production database as already having the baseline migration.",
      `Baseline migration: ${BASELINE_MIGRATION}`,
      "",
      "Run:",
      `npm run prisma:baseline:production -- --apply`,
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

console.log(`Resolving production baseline migration: ${BASELINE_MIGRATION}`);
run("npx", ["prisma", "migrate", "resolve", "--applied", BASELINE_MIGRATION]);

console.log("Checking migration status after baseline resolve.");
run("npx", ["prisma", "migrate", "status"]);
