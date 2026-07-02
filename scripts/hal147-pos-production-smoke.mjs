import { writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.SMOKE_BASE_URL ?? "https://halalzi-erp.vercel.app";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
const mutate = process.env.POS_SMOKE_MUTATE === "true";

const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function request(routePath, options = {}) {
  const response = await fetch(`${baseUrl}${routePath}`, {
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

async function page(routePath) {
  const response = await fetch(`${baseUrl}${routePath}`, { redirect: "manual" });
  return { routePath, status: response.status, location: response.headers.get("location") };
}

function hasUnsafeKeys(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "tokenHash")) return true;
  return Object.values(value).some((child) =>
    Array.isArray(child) ? child.some(hasUnsafeKeys) : hasUnsafeKeys(child),
  );
}

function permissionList(body) {
  return Array.isArray(body?.permissions) ? body.permissions : [];
}

function hasAllPosPermissions(body) {
  const permissions = permissionList(body);
  return ["pos.read", "pos.create", "pos.receipts.print", "pos.sessions.read", "pos.sessions.manage"].every((key) =>
    permissions.includes(key),
  );
}

async function main() {
  const publicChecks = await Promise.all(["/", "/login", "/dashboard/pos"].map(page));
  add("production pages respond", publicChecks.every((item) => item.status === 200), { pages: publicChecks });

  const protectedPosApis = [
    "/api/pos/products",
    "/api/pos/sales",
    "/api/pos/summary",
    "/api/pos/sessions",
    "/api/pos/sales/not-a-real-sale/receipt",
  ];
  const unauthApis = await Promise.all(protectedPosApis.map((apiPath) => request(apiPath)));
  add("POS APIs reject unauthenticated access", unauthApis.every((item) => item.response.status === 401), {
    statuses: unauthApis.map((item, index) => `${protectedPosApis[index]}=${item.response.status}`),
  });

  if (!adminEmail || !adminPassword) {
    add("authenticated POS smoke skipped", true, {
      reason: "Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD locally to run authenticated POS checks.",
    });
  } else {
    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const cookie = cookieFrom(login.response);
    const authHeaders = { cookie };
    add("admin login succeeds", login.response.status === 200 && Boolean(cookie), {
      status: login.response.status,
      hasCookie: Boolean(cookie),
      code: login.body?.error?.code,
    });

    if (cookie) {
      const me = await request("/api/auth/me", { headers: authHeaders });
      add("auth/me has safe POS permissions", me.response.status === 200 && hasAllPosPermissions(me.body) && !hasUnsafeKeys(me.body), {
        status: me.response.status,
        hasPosPermissions: hasAllPosPermissions(me.body),
        unsafe: hasUnsafeKeys(me.body),
      });

      const summary = await request("/api/pos/summary", { headers: authHeaders });
      add("POS summary loads for authenticated user", summary.response.status === 200 && !hasUnsafeKeys(summary.body), {
        status: summary.response.status,
        unsafe: hasUnsafeKeys(summary.body),
        hasActiveSessionField: Object.prototype.hasOwnProperty.call(summary.body?.data ?? {}, "activeSession"),
      });

      const products = await request("/api/pos/products?limit=5", { headers: authHeaders });
      add("POS product search loads bounded page", products.response.status === 200 && Array.isArray(products.body?.data), {
        status: products.response.status,
        count: Array.isArray(products.body?.data) ? products.body.data.length : null,
        hasMore: products.body?.meta?.hasMore ?? null,
      });

      const sales = await request("/api/pos/sales?take=5", { headers: authHeaders });
      add("POS sales list loads for authenticated user", sales.response.status === 200 && Array.isArray(sales.body?.data), {
        status: sales.response.status,
        count: Array.isArray(sales.body?.data) ? sales.body.data.length : null,
      });

      const sessions = await request("/api/pos/sessions", { headers: authHeaders });
      add("POS sessions list loads for authenticated user", sessions.response.status === 200 && Array.isArray(sessions.body?.data), {
        status: sessions.response.status,
        count: Array.isArray(sessions.body?.data) ? sessions.body.data.length : null,
      });

      const fakeReceipt = await request("/api/pos/sales/not-a-real-sale/receipt", { headers: authHeaders });
      add("POS receipt route is tenant-scoped for missing sale", fakeReceipt.response.status === 403, {
        status: fakeReceipt.response.status,
      });

      if (mutate) {
        const openSession = await request("/api/pos/sessions", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ counterName: "Production smoke", openingFloat: 0 }),
        });
        const sessionId = openSession.body?.data?.id;
        add("optional smoke session can open", openSession.response.status === 201 && typeof sessionId === "string", {
          status: openSession.response.status,
          hasSessionId: typeof sessionId === "string",
        });

        if (sessionId) {
          const closeSession = await request(`/api/pos/sessions/${sessionId}/close`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ closingCash: 0 }),
          });
          add("optional smoke session can close", closeSession.response.status === 200, {
            status: closeSession.response.status,
          });
        }
      } else {
        add("mutating POS session smoke skipped", true, {
          reason: "Set POS_SMOKE_MUTATE=true only for a safe production test tenant.",
        });
      }
    }
  }

  const failed = checks.filter((check) => !check.ok);
  const authBlocked = !adminEmail || !adminPassword;
  const artifact = {
    issue: "HAL-147",
    title: "POS production smoke and release signoff",
    generatedAt: new Date().toISOString(),
    baseUrl,
    status: failed.length > 0 ? "FAIL" : authBlocked ? "BLOCKED_AUTH_ENV" : "PASS",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };

  const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(path.join(root, "outputs", "HAL-147_pos_production_smoke_signoff.json"), artifactJson);
  await writeFile(path.join(root, "..", "outputs", "HAL-147_pos_production_smoke_signoff.json"), artifactJson);

  console.log(JSON.stringify(artifact, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
