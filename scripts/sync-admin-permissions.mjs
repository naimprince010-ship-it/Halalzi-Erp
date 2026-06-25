import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
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
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }

  return true;
}

function cuidLike() {
  return `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
}

function loadDefaultPermissions() {
  const filePath = path.join(process.cwd(), "src", "lib", "rbac", "default-permissions.ts");
  const contents = readFileSync(filePath, "utf8");
  const matches = [
    ...contents.matchAll(
      /\{\s*key:\s*"([^"]+)",\s*module:\s*"([^"]+)",\s*action:\s*"([^"]+)",\s*description:\s*"([^"]+)"\s*\}/g,
    ),
  ];

  return matches.map((match) => ({
    key: match[1],
    module: match[2],
    action: match[3],
    description: match[4],
  }));
}

loadEnvFile(getArgValue("--env-file="));
loadEnvFile(".env.production.local");

const apply = args.has("--apply");
const targetEmail = (getArgValue("--email=") ?? process.env.TARGET_ADMIN_EMAIL ?? "").trim().toLowerCase();
const targetCompanySlug = (getArgValue("--company-slug=") ?? process.env.TARGET_COMPANY_SLUG ?? "").trim();
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim();

if (!apply) {
  console.error("Refusing to run without --apply.");
  console.error("Example: TARGET_ADMIN_EMAIL=<email> node scripts/sync-admin-permissions.mjs --apply --env-file=.env.production.local");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!targetEmail) {
  console.error("TARGET_ADMIN_EMAIL or --email=<email> is required.");
  process.exit(1);
}

const permissions = loadDefaultPermissions();

if (permissions.length === 0) {
  console.error("No default permissions were parsed.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const userResult = await client.query(
    `SELECT "User"."id", "User"."email", "User"."name", "User"."companyId", "Company"."name" AS "companyName", "Company"."slug" AS "companySlug"
     FROM "User"
     JOIN "Company" ON "Company"."id" = "User"."companyId"
     WHERE LOWER("User"."email") = LOWER($1)
     LIMIT 1`,
    [targetEmail],
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error("Target admin user was not found.");
  }

  if (targetCompanySlug && user.companySlug !== targetCompanySlug) {
    throw new Error("Target admin user does not belong to the requested company slug.");
  }

  for (const permission of permissions) {
    await client.query(
      `INSERT INTO "Permission" ("id", "key", "module", "action", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("key") DO UPDATE
       SET "module" = EXCLUDED."module",
           "action" = EXCLUDED."action",
           "description" = EXCLUDED."description",
           "updatedAt" = NOW()`,
      [cuidLike(), permission.key, permission.module, permission.action, permission.description],
    );
  }

  const roleResult = await client.query(
    `INSERT INTO "Role" ("id", "companyId", "name", "key", "description", "isSystem", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Company Admin', 'admin', 'Full control inside the company workspace.', true, NOW(), NOW())
     ON CONFLICT ("companyId", "key") DO UPDATE
     SET "name" = 'Company Admin',
         "description" = 'Full control inside the company workspace.',
         "isSystem" = true,
         "updatedAt" = NOW()
     RETURNING "id"`,
    [cuidLike(), user.companyId],
  );
  const adminRoleId = roleResult.rows[0].id;

  await client.query(
    `INSERT INTO "RolePermission" ("roleId", "permissionId")
     SELECT $1, "id" FROM "Permission" WHERE "key" = ANY($2)
     ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
    [adminRoleId, permissions.map((permission) => permission.key)],
  );

  await client.query(
    `INSERT INTO "UserRole" ("userId", "roleId")
     VALUES ($1, $2)
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [user.id, adminRoleId],
  );

  const revoked = await client.query('DELETE FROM "Session" WHERE "userId" = $1', [user.id]);
  const countResult = await client.query(
    `SELECT COUNT(*)::int AS "count"
     FROM "RolePermission"
     WHERE "roleId" = $1`,
    [adminRoleId],
  );

  const posResult = await client.query(
    `SELECT "Permission"."key"
     FROM "RolePermission"
     JOIN "Permission" ON "Permission"."id" = "RolePermission"."permissionId"
     WHERE "RolePermission"."roleId" = $1
       AND "Permission"."key" LIKE 'pos.%'
     ORDER BY "Permission"."key"`,
    [adminRoleId],
  );

  await client.query("COMMIT");

  console.log(
    JSON.stringify(
      {
        ok: true,
        userEmail: user.email,
        userName: user.name,
        company: user.companyName,
        companySlug: user.companySlug,
        role: "admin",
        permissionCount: countResult.rows[0].count,
        posPermissions: posResult.rows.map((row) => row.key),
        sessionsRevoked: revoked.rowCount,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
