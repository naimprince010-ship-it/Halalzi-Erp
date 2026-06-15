const required = ["DATABASE_URL", "SESSION_SECRET"];
const errors = [];
const warnings = [];

function value(name) {
  return process.env[name]?.trim() ?? "";
}

for (const name of required) {
  if (!value(name)) {
    errors.push(`${name} is required.`);
  }
}

const databaseUrl = value("DATABASE_URL");
if (databaseUrl) {
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    errors.push("DATABASE_URL must be a PostgreSQL connection string.");
  }

  if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
    warnings.push("DATABASE_URL points to a local database. Use managed PostgreSQL for production.");
  }

  if (!databaseUrl.includes("sslmode=require") && !databaseUrl.includes("ssl=true")) {
    warnings.push("DATABASE_URL does not appear to require SSL. Managed production DBs should use SSL.");
  }
}

const sessionSecret = value("SESSION_SECRET");
if (sessionSecret) {
  if (sessionSecret.length < 32) {
    errors.push("SESSION_SECRET must be at least 32 characters.");
  }

  if (
    sessionSecret === "local-dev-replace-before-production" ||
    sessionSecret.includes("replace-with") ||
    sessionSecret.includes("production-secret")
  ) {
    errors.push("SESSION_SECRET is still a placeholder.");
  }
}

const nodeEnv = value("NODE_ENV");
if (nodeEnv && nodeEnv !== "production") {
  warnings.push(`NODE_ENV is ${nodeEnv}; production deployments should set NODE_ENV=production.`);
}

const result = {
  ok: errors.length === 0,
  errors,
  warnings,
  checked: {
    DATABASE_URL: Boolean(databaseUrl),
    SESSION_SECRET: Boolean(sessionSecret),
    NODE_ENV: nodeEnv || null,
  },
};

console.log(JSON.stringify(result, null, 2));

if (errors.length > 0) {
  process.exit(1);
}
