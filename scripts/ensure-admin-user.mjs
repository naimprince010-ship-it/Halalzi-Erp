import { readFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const SALT_ROUNDS = 12;
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

loadEnvFile(getArgValue("--env-file="));

const apply = args.has("--apply");
const email = process.env.TARGET_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.TARGET_ADMIN_PASSWORD?.trim();
const name = process.env.TARGET_ADMIN_NAME?.trim() || "Naim Admin";
const companySlug = process.env.TARGET_COMPANY_SLUG?.trim() || "halalzi-erp";
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim();

if (!apply) {
  console.error("Refusing to run without --apply.");
  console.error("Example:");
  console.error(
    "TARGET_ADMIN_EMAIL=<email> TARGET_ADMIN_PASSWORD=<password> npm run admin:ensure -- --apply --env-file=.env.production.local",
  );
  process.exit(1);
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!email) {
  console.error("TARGET_ADMIN_EMAIL is required.");
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("TARGET_ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const permissions = [
  { key: "dashboard.read", module: "dashboard", action: "read", description: "View dashboard" },
  { key: "profile.read", module: "profile", action: "read", description: "View own profile" },
  { key: "profile.update", module: "profile", action: "update", description: "Update own profile" },
  { key: "company.read", module: "company", action: "read", description: "View company details" },
  { key: "users.read", module: "users", action: "read", description: "View users" },
  { key: "users.create", module: "users", action: "create", description: "Create users" },
  { key: "users.update", module: "users", action: "update", description: "Update users" },
  { key: "users.disable", module: "users", action: "disable", description: "Disable users" },
  { key: "roles.read", module: "roles", action: "read", description: "View roles" },
  { key: "roles.assign", module: "roles", action: "assign", description: "Assign roles" },
  { key: "roles.update", module: "roles", action: "update", description: "Update role permissions" },
  { key: "products.read", module: "products", action: "read", description: "View products" },
  { key: "products.create", module: "products", action: "create", description: "Create products" },
  { key: "products.update", module: "products", action: "update", description: "Update products" },
  { key: "products.delete", module: "products", action: "delete", description: "Archive products" },
  { key: "inventory.adjust", module: "inventory", action: "adjust", description: "Adjust stock quantity" },
  { key: "sales.read", module: "sales", action: "read", description: "View sales orders" },
  { key: "sales.create", module: "sales", action: "create", description: "Create sales orders" },
  { key: "sales.update", module: "sales", action: "update", description: "Update sales orders" },
  { key: "sales.confirm", module: "sales", action: "confirm", description: "Confirm sales orders" },
  { key: "sales.cancel", module: "sales", action: "cancel", description: "Cancel sales orders" },
  { key: "vendors.read", module: "vendors", action: "read", description: "View vendors" },
  { key: "vendors.create", module: "vendors", action: "create", description: "Create vendors" },
  { key: "vendors.update", module: "vendors", action: "update", description: "Update vendors" },
  { key: "purchases.read", module: "purchases", action: "read", description: "View purchase orders" },
  { key: "purchases.create", module: "purchases", action: "create", description: "Create purchase orders" },
  { key: "purchases.update", module: "purchases", action: "update", description: "Update purchase orders" },
  { key: "purchases.receive", module: "purchases", action: "receive", description: "Receive purchase orders" },
  { key: "purchases.cancel", module: "purchases", action: "cancel", description: "Cancel purchase orders" },
  { key: "finance.read", module: "finance", action: "read", description: "View finance records" },
  { key: "finance.accounts.create", module: "finance", action: "accounts.create", description: "Create finance accounts" },
  { key: "finance.accounts.update", module: "finance", action: "accounts.update", description: "Update finance accounts" },
  { key: "finance.journals.create", module: "finance", action: "journals.create", description: "Create journal entries" },
  { key: "finance.journals.update", module: "finance", action: "journals.update", description: "Update draft journal entries" },
  { key: "finance.journals.post", module: "finance", action: "journals.post", description: "Post journal entries" },
  { key: "finance.journals.cancel", module: "finance", action: "journals.cancel", description: "Cancel draft journal entries" },
  { key: "finance.receivables.update", module: "finance", action: "receivables.update", description: "Update receivables" },
  { key: "finance.payables.update", module: "finance", action: "payables.update", description: "Update payables" },
  { key: "crm.read", module: "crm", action: "read", description: "View CRM leads and customers" },
  { key: "crm.create", module: "crm", action: "create", description: "Create CRM leads and customers" },
  { key: "crm.update", module: "crm", action: "update", description: "Update CRM leads and customers" },
  { key: "crm.convert", module: "crm", action: "convert", description: "Convert leads to customers" },
  { key: "crm.archive", module: "crm", action: "archive", description: "Archive CRM leads and customers" },
  { key: "audit.read", module: "audit", action: "read", description: "View audit logs" },
];

function cuidLike() {
  return `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const companyResult = await client.query('SELECT "id", "name" FROM "Company" WHERE "slug" = $1 LIMIT 1', [
    companySlug,
  ]);

  const company = companyResult.rows[0];
  if (!company) {
    throw new Error(`Company with slug ${companySlug} was not found.`);
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
    [cuidLike(), company.id],
  );
  const adminRoleId = roleResult.rows[0].id;

  await client.query(
    `INSERT INTO "RolePermission" ("roleId", "permissionId")
     SELECT $1, "id" FROM "Permission"
     ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
    [adminRoleId],
  );

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userResult = await client.query(
    `INSERT INTO "User" ("id", "companyId", "name", "email", "emailVerifiedAt", "passwordHash", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), $5, 'active', NOW(), NOW())
     ON CONFLICT ("email") DO UPDATE
     SET "companyId" = EXCLUDED."companyId",
         "name" = EXCLUDED."name",
         "emailVerifiedAt" = NOW(),
         "passwordHash" = EXCLUDED."passwordHash",
         "status" = 'active',
         "updatedAt" = NOW()
     RETURNING "id", "email", "name"`,
    [cuidLike(), company.id, name, email, passwordHash],
  );
  const user = userResult.rows[0];

  await client.query(
    `INSERT INTO "UserRole" ("userId", "roleId")
     VALUES ($1, $2)
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [user.id, adminRoleId],
  );

  await client.query('DELETE FROM "Session" WHERE "userId" = $1', [user.id]);

  const permissionCountResult = await client.query(
    `SELECT COUNT(*)::int AS "count"
     FROM "RolePermission"
     WHERE "roleId" = $1`,
    [adminRoleId],
  );

  await client.query("COMMIT");

  console.log(
    JSON.stringify(
      {
        ok: true,
        company: company.name,
        companySlug,
        userEmail: user.email,
        userName: user.name,
        role: "admin",
        permissionCount: permissionCountResult.rows[0].count,
        sessionsRevoked: true,
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
