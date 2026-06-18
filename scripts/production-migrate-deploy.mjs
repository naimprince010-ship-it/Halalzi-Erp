import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

const explicitEnvFile = getArgValue("--env-file=");
// On Vercel, DATABASE_URL is provided by the platform environment. Locally we
// fall back to committed-but-untracked env files for manual runs.
const loadedEnvFile =
  loadEnvFile(explicitEnvFile) ||
  loadEnvFile(".env.production.local") ||
  loadEnvFile(".env");
void loadedEnvFile;

if (!process.env.DATABASE_URL) {
  console.error(
    [
      "DATABASE_URL is missing. prisma migrate deploy cannot run.",
      "",
      "On Vercel this is set as a project environment variable.",
      "Locally, set it in the shell or provide --env-file=path/to/envfile.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Running prisma migrate deploy against the configured database.");

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  encoding: "utf8",
  shell: true,
  env: process.env,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;

if (result.status === 0) {
  process.exit(0);
}

// P3005: the target database already has tables but no migration history.
// This happens when the database was created with `prisma db push` and has not
// been baselined yet. Point the operator to the HAL-93 baseline step instead of
// failing with a cryptic error.
if (/P3005/.test(combinedOutput) || /database schema is not empty/i.test(combinedOutput)) {
  console.error(
    [
      "",
      "prisma migrate deploy failed because the database has tables but no",
      "migration history (Prisma error P3005).",
      "",
      "This database was created with `prisma db push` and must be baselined",
      "before it can use `prisma migrate deploy`.",
      "",
      "Apply the production baseline first (HAL-93), from a trusted shell with",
      "the production DATABASE_URL:",
      "",
      "  npm run prisma:baseline:production -- --apply",
      "",
      "Then re-run the migration deploy / build:migrate.",
    ].join("\n"),
  );
  process.exit(result.status ?? 1);
}

// P3009: a previously failed migration is recorded and blocks new deploys.
if (/P3009/.test(combinedOutput)) {
  console.error(
    [
      "",
      "prisma migrate deploy failed because a previous migration is marked as",
      "failed (Prisma error P3009).",
      "",
      "Investigate with `npx prisma migrate status` and resolve the failed",
      "migration before deploying again. Do not run `prisma migrate reset`",
      "against production.",
    ].join("\n"),
  );
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 1);
