const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

async function page(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  return { path, status: response.status, location: response.headers.get("location") };
}

function hasUnsafeKeys(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "tokenHash")) return true;
  return Object.values(value).some((child) =>
    Array.isArray(child) ? child.some(hasUnsafeKeys) : hasUnsafeKeys(child),
  );
}

function isNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNumberObject(value, keys) {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function hasSafeSummaryShape(body) {
  const summary = body?.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;

  return (
    isNullableNumber(summary.users) &&
    isNumberObject(summary.products, ["active", "lowStock"]) &&
    isNumberObject(summary.sales, ["draft", "confirmed"]) &&
    isNumberObject(summary.procurement, ["draft", "ordered"]) &&
    isNumberObject(summary.finance, ["activeAccounts", "openReceivables", "openPayables"])
  );
}

async function main() {
  const publicPages = await Promise.all(["/", "/login", "/register"].map(page));
  add("public pages render", publicPages.every((item) => item.status === 200), { publicPages });

  const protectedApiPaths = [
    "/api/auth/me",
    "/api/dashboard/summary",
    "/api/users",
    "/api/roles",
    "/api/products",
    "/api/vendors",
    "/api/purchase-orders",
    "/api/sales-orders",
    "/api/finance/accounts",
    "/api/finance/journal-entries",
    "/api/finance/receivables",
    "/api/finance/payables",
  ];

  const unauthApis = await Promise.all(protectedApiPaths.map((path) => request(path)));
  add("protected APIs reject unauthenticated access", unauthApis.every((item) => item.response.status === 401), {
    statuses: unauthApis.map((item, index) => `${protectedApiPaths[index]}=${item.response.status}`),
  });

  if (adminEmail && adminPassword) {
    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const cookie = cookieFrom(login.response);
    add("admin login succeeds", login.response.status === 200 && Boolean(cookie), {
      status: login.response.status,
      hasCookie: Boolean(cookie),
    });

    if (cookie) {
      const authHeaders = { cookie };
      const me = await request("/api/auth/me", { headers: authHeaders });
      add("auth/me returns safe user context", me.response.status === 200 && !hasUnsafeKeys(me.body), {
        status: me.response.status,
        unsafe: hasUnsafeKeys(me.body),
      });

      const dashboardSummary = await request("/api/dashboard/summary", { headers: authHeaders });
      add(
        "dashboard summary has safe operational shape",
        dashboardSummary.response.status === 200 &&
          hasSafeSummaryShape(dashboardSummary.body) &&
          !hasUnsafeKeys(dashboardSummary.body),
        {
          status: dashboardSummary.response.status,
          unsafe: hasUnsafeKeys(dashboardSummary.body),
          keys: dashboardSummary.body?.summary ? Object.keys(dashboardSummary.body.summary) : [],
        },
      );

      const moduleApis = await Promise.all(
        protectedApiPaths
          .filter((path) => path !== "/api/auth/me")
          .map((path) => request(path, { headers: authHeaders })),
      );
      add("admin can read core module APIs", moduleApis.every((item) => item.response.status === 200), {
        statuses: moduleApis.map((item) => item.response.status),
      });
      add("module API responses expose no password/session hashes", moduleApis.every((item) => !hasUnsafeKeys(item.body)), {
        unsafe: moduleApis.some((item) => hasUnsafeKeys(item.body)),
      });
    }
  } else {
    add("admin credential checks skipped", true, {
      reason: "Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to verify authenticated module reads.",
    });
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ baseUrl, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
