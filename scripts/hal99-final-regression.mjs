const baseUrl = process.env.HAL99_BASE_URL ?? "http://127.0.0.1:3000";
const requestTimeoutMs = Number(process.env.HAL99_REQUEST_TIMEOUT_MS ?? 30000);

const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function hasUnsafeKeys(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "tokenHash")) return true;
  return Object.values(value).some((child) =>
    Array.isArray(child) ? child.some(hasUnsafeKeys) : hasUnsafeKeys(child),
  );
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    let body = null;

    if (contentType.includes("application/json")) {
      body = await response.json().catch(() => null);
    } else {
      body = await response.text().catch(() => null);
    }

    return { response, body, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    const response = new Response(
      JSON.stringify({
        error: {
          code: "REQUEST_FAILED",
          message,
        },
      }),
      {
        status: 599,
        headers: { "content-type": "application/json" },
      },
    );

    return {
      response,
      body: { error: { code: "REQUEST_FAILED", message } },
      contentType: "application/json",
      requestError: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function randomSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerCompanyAdmin(label) {
  const suffix = randomSuffix();
  const email = `hal99.${label}.${suffix}@example.com`;
  const password = `Hal99!${suffix}Aa`;

  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `HAL99 ${label}`,
      email,
      password,
      confirmPassword: password,
      companyName: `HAL99 ${label} ${suffix}`,
      termsAccepted: true,
    }),
  });

  const cookie = cookieFrom(register.response);
  return { email, password, register, cookie };
}

async function verifyEmailWithSession(cookie) {
  const requestVerification = await request("/api/auth/email-verification/request", {
    method: "POST",
    headers: { cookie },
  });
  const token = requestVerification.body?.devVerificationToken;

  if (!token) {
    return { requestVerification, confirmVerification: null };
  }

  const confirmVerification = await request("/api/auth/email-verification/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

  return { requestVerification, confirmVerification };
}

function mustJsonObject(body) {
  return !!body && typeof body === "object" && !Array.isArray(body);
}

function statusOf(result) {
  return result.response.status;
}

async function main() {
  const root = await request("/");
  add("local app reachable", statusOf(root) === 200, { status: statusOf(root) });

  if (statusOf(root) !== 200) {
    const failed = checks.filter((check) => !check.ok);
    console.log(
      JSON.stringify(
        {
          baseUrl,
          total: checks.length,
          passed: checks.length - failed.length,
          failed: failed.length,
          checks,
          note: "Start the local app first (npm run dev or npm run start).",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const protectedApiPaths = [
    "/api/auth/me",
    "/api/dashboard/summary",
    "/api/users",
    "/api/roles",
    "/api/products",
    "/api/vendors",
    "/api/sales-orders",
    "/api/purchase-orders",
    "/api/exports/products",
    "/api/exports/sales-orders",
    "/api/exports/purchase-orders",
    "/api/exports/users",
  ];

  const unauthenticated = await Promise.all(protectedApiPaths.map((path) => request(path)));
  add(
    "unauthenticated protected routes return 401",
    unauthenticated.every((item) => statusOf(item) === 401),
    {
      statuses: unauthenticated.map((item, index) => `${protectedApiPaths[index]}=${statusOf(item)}`),
    },
  );

  const adminA = await registerCompanyAdmin("admina");
  add("register company admin A succeeds", statusOf(adminA.register) === 200 && Boolean(adminA.cookie), {
    status: statusOf(adminA.register),
    hasCookie: Boolean(adminA.cookie),
  });

  const adminB = await registerCompanyAdmin("adminb");
  add("register company admin B succeeds", statusOf(adminB.register) === 200 && Boolean(adminB.cookie), {
    status: statusOf(adminB.register),
    hasCookie: Boolean(adminB.cookie),
  });

  if (!adminA.cookie || !adminB.cookie) {
    add("admin bootstrap completed for runtime workflow checks", false, {
      reason: "Registration or session bootstrap failed. Check database connectivity and app env.",
      adminAStatus: statusOf(adminA.register),
      adminBStatus: statusOf(adminB.register),
    });

    const failed = checks.filter((check) => !check.ok);
    console.log(
      JSON.stringify(
        {
          baseUrl,
          total: checks.length,
          passed: checks.length - failed.length,
          failed: failed.length,
          checks,
          blockers: [
            "Admin bootstrap failed. Runtime workflow checks that require authenticated DB-backed state were not executed.",
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const adminHeaders = { cookie: adminA.cookie };

  const unverifiedAdminLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminA.email, password: adminA.password }),
  });
  add(
    "unverified email login is blocked",
    statusOf(unverifiedAdminLogin) === 403 &&
      unverifiedAdminLogin.body?.error?.code === "EMAIL_NOT_VERIFIED",
    {
      status: statusOf(unverifiedAdminLogin),
      code: unverifiedAdminLogin.body?.error?.code,
    },
  );

  const adminVerification = await verifyEmailWithSession(adminA.cookie);
  const adminVerificationRequestStatus = statusOf(adminVerification.requestVerification);
  const adminVerificationConfirmStatus = adminVerification.confirmVerification
    ? statusOf(adminVerification.confirmVerification)
    : null;
  add(
    "email verification confirm works",
    adminVerificationRequestStatus === 200 && adminVerificationConfirmStatus === 200,
    {
      requestStatus: adminVerificationRequestStatus,
      confirmStatus: adminVerificationConfirmStatus,
    },
  );

  const verifiedAdminLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminA.email, password: adminA.password }),
  });
  add("verified email login works", statusOf(verifiedAdminLogin) === 200, {
    status: statusOf(verifiedAdminLogin),
  });

  const adminMe = await request("/api/auth/me", { headers: adminHeaders });
  add("admin auth/me returns safe payload", statusOf(adminMe) === 200 && !hasUnsafeKeys(adminMe.body), {
    status: statusOf(adminMe),
    unsafe: hasUnsafeKeys(adminMe.body),
  });

  const productSku = `HAL99-SKU-${randomSuffix()}`;
  const createProduct = await request("/api/products", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Product",
      sku: productSku,
      category: "Regression",
      salePrice: 120,
      costPrice: 80,
      stockQuantity: 20,
      status: "active",
    }),
  });

  const productId = createProduct.body?.product?.id;
  add("product create works", statusOf(createProduct) === 201 && typeof productId === "string", {
    status: statusOf(createProduct),
  });

  const duplicateProduct = await request("/api/products", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Product Duplicate",
      sku: productSku,
      salePrice: 111,
      stockQuantity: 10,
    }),
  });
  add("duplicate product SKU returns 409", statusOf(duplicateProduct) === 409, {
    status: statusOf(duplicateProduct),
  });

  const patchProduct = productId
    ? await request(`/api/products/${productId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ name: "HAL99 Product Updated", salePrice: 130 }),
      })
    : null;
  add("product update works", !!patchProduct && statusOf(patchProduct) === 200, {
    status: patchProduct ? statusOf(patchProduct) : null,
  });

  const vendorCode = `HAL99-VEN-${randomSuffix()}`;
  const createVendor = await request("/api/vendors", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Vendor",
      code: vendorCode,
      email: `vendor.${randomSuffix()}@example.com`,
      phone: "0123456789",
      status: "active",
    }),
  });
  const vendorId = createVendor.body?.vendor?.id;

  add("vendor create works", statusOf(createVendor) === 201 && typeof vendorId === "string", {
    status: statusOf(createVendor),
  });

  const duplicateVendor = await request("/api/vendors", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Vendor Duplicate",
      code: vendorCode,
      email: `vendor2.${randomSuffix()}@example.com`,
      status: "active",
    }),
  });
  add("duplicate vendor code returns 409", statusOf(duplicateVendor) === 409, {
    status: statusOf(duplicateVendor),
  });

  const getVendor = vendorId ? await request(`/api/vendors/${vendorId}`, { headers: adminHeaders }) : null;
  add("vendor read works", !!getVendor && statusOf(getVendor) === 200, {
    status: getVendor ? statusOf(getVendor) : null,
  });

  const patchVendor = vendorId
    ? await request(`/api/vendors/${vendorId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ phone: "01999999999", notes: "Updated by HAL-99" }),
      })
    : null;
  add("vendor update works", !!patchVendor && statusOf(patchVendor) === 200, {
    status: patchVendor ? statusOf(patchVendor) : null,
  });

  const staffEmail = `hal99.staff.${randomSuffix()}@example.com`;
  const staffPassword = "Hal99Staff!123";
  const createStaff = await request("/api/users", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Staff",
      email: staffEmail,
      temporaryPassword: staffPassword,
    }),
  });
  const staffId = createStaff.body?.user?.id;
  add("staff user create works", statusOf(createStaff) === 201 && typeof staffId === "string", {
    status: statusOf(createStaff),
  });

  const duplicateStaff = await request("/api/users", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "HAL99 Staff Dup",
      email: staffEmail,
      temporaryPassword: staffPassword,
    }),
  });
  add("duplicate user email returns 409", statusOf(duplicateStaff) === 409, {
    status: statusOf(duplicateStaff),
  });

  const loginStaff = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: staffEmail, password: staffPassword }),
  });
  const staffCookie = cookieFrom(loginStaff.response);
  const staffHeaders = { cookie: staffCookie };

  add("staff login works", statusOf(loginStaff) === 200 && Boolean(staffCookie), {
    status: statusOf(loginStaff),
    hasCookie: Boolean(staffCookie),
  });

  if (!productId) {
    throw new Error("Product creation failed; cannot continue workflow checks.");
  }

  const crossTenantProductRead = await request(`/api/products/${productId}`, {
    headers: { cookie: adminB.cookie },
  });
  add("tenant isolation blocks cross-company product access (403)", statusOf(crossTenantProductRead) === 403, {
    status: statusOf(crossTenantProductRead),
  });

  const staffForbiddenUsers = await request("/api/users", { headers: staffHeaders });
  const staffForbiddenCreateProduct = await request("/api/products", {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({
      name: "Should Fail",
      sku: `HAL99-FAIL-${randomSuffix()}`,
      salePrice: 10,
      stockQuantity: 1,
    }),
  });
  const staffForbiddenExportUsers = await request("/api/exports/users", { headers: staffHeaders });

  add(
    "RBAC forbidden checks return 403",
    [staffForbiddenUsers, staffForbiddenCreateProduct, staffForbiddenExportUsers].every(
      (item) => statusOf(item) === 403,
    ),
    {
      statuses: [
        `/api/users=${statusOf(staffForbiddenUsers)}`,
        `/api/products POST=${statusOf(staffForbiddenCreateProduct)}`,
        `/api/exports/users=${statusOf(staffForbiddenExportUsers)}`,
      ],
    },
  );

  const staffReadableProducts = await request("/api/products", { headers: staffHeaders });
  add("staff allowed read route still works", statusOf(staffReadableProducts) === 200, {
    status: statusOf(staffReadableProducts),
  });

  const createPurchaseOrder = vendorId
    ? await request("/api/purchase-orders", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          vendorId,
          notes: "HAL99 purchase flow",
          discountAmount: 0,
          items: [{ productId, quantity: 5, unitCost: 80 }],
        }),
      })
    : null;
  const purchaseOrderId = createPurchaseOrder?.body?.purchaseOrder?.id;

  add(
    "purchase order create works",
    !!createPurchaseOrder && statusOf(createPurchaseOrder) === 201 && typeof purchaseOrderId === "string",
    { status: createPurchaseOrder ? statusOf(createPurchaseOrder) : null },
  );

  const submitPurchaseOrder = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/submit`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;
  const approvePurchaseOrder = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/approve`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ note: "HAL99 regression approval" }),
      })
    : null;
  const markOrdered = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ status: "ordered" }),
      })
    : null;
  add(
    "purchase order approval and ordered transition works",
    !!submitPurchaseOrder &&
      statusOf(submitPurchaseOrder) === 200 &&
      !!approvePurchaseOrder &&
      statusOf(approvePurchaseOrder) === 200 &&
      !!markOrdered &&
      statusOf(markOrdered) === 200,
    {
    submitStatus: submitPurchaseOrder ? statusOf(submitPurchaseOrder) : null,
    approveStatus: approvePurchaseOrder ? statusOf(approvePurchaseOrder) : null,
    status: markOrdered ? statusOf(markOrdered) : null,
  });

  const receivePo = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/receive`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;
  add("purchase order receive works", !!receivePo && statusOf(receivePo) === 200, {
    status: receivePo ? statusOf(receivePo) : null,
  });

  const cancelReceivedPo = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/cancel`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;
  add("received purchase order cancel blocked", !!cancelReceivedPo && statusOf(cancelReceivedPo) === 400, {
    status: cancelReceivedPo ? statusOf(cancelReceivedPo) : null,
  });

  const createPurchaseOrderToCancel = vendorId
    ? await request("/api/purchase-orders", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          vendorId,
          notes: "HAL99 purchase cancel flow",
          items: [{ productId, quantity: 2, unitCost: 70 }],
        }),
      })
    : null;
  const purchaseOrderCancelId = createPurchaseOrderToCancel?.body?.purchaseOrder?.id;

  const cancelDraftPo = purchaseOrderCancelId
    ? await request(`/api/purchase-orders/${purchaseOrderCancelId}/cancel`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;

  add("purchase order cancel works", !!cancelDraftPo && statusOf(cancelDraftPo) === 200, {
    status: cancelDraftPo ? statusOf(cancelDraftPo) : null,
  });

  const productAfterPurchase = await request(`/api/products/${productId}`, { headers: adminHeaders });
  const stockAfterPurchase = productAfterPurchase.body?.product?.stockQuantity;
  add("purchase receive increases stock (+5)", statusOf(productAfterPurchase) === 200 && stockAfterPurchase === 25, {
    status: statusOf(productAfterPurchase),
    stock: stockAfterPurchase,
  });

  const createSalesOrder = await request("/api/sales-orders", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      customerName: "HAL99 Customer",
      customerPhone: "01700000000",
      discountAmount: 0,
      items: [{ productId, quantity: 3 }],
    }),
  });
  const salesOrderId = createSalesOrder.body?.data?.id;
  add("sales order create works", statusOf(createSalesOrder) === 201 && typeof salesOrderId === "string", {
    status: statusOf(createSalesOrder),
  });

  const patchSalesOrder = salesOrderId
    ? await request(`/api/sales-orders/${salesOrderId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ customerName: "HAL99 Customer Updated" }),
      })
    : null;
  add("sales order update works", !!patchSalesOrder && statusOf(patchSalesOrder) === 200, {
    status: patchSalesOrder ? statusOf(patchSalesOrder) : null,
  });

  const confirmSalesOrder = salesOrderId
    ? await request(`/api/sales-orders/${salesOrderId}/confirm`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;
  add("sales order confirm works", !!confirmSalesOrder && statusOf(confirmSalesOrder) === 200, {
    status: confirmSalesOrder ? statusOf(confirmSalesOrder) : null,
  });

  const productAfterSalesConfirm = await request(`/api/products/${productId}`, { headers: adminHeaders });
  const stockAfterSalesConfirm = productAfterSalesConfirm.body?.product?.stockQuantity;
  add(
    "sales confirm decreases stock (-3)",
    statusOf(productAfterSalesConfirm) === 200 && stockAfterSalesConfirm === 22,
    { status: statusOf(productAfterSalesConfirm), stock: stockAfterSalesConfirm },
  );

  const cancelSalesOrder = salesOrderId
    ? await request(`/api/sales-orders/${salesOrderId}/cancel`, {
        method: "POST",
        headers: adminHeaders,
      })
    : null;
  add("sales order cancel works", !!cancelSalesOrder && statusOf(cancelSalesOrder) === 200, {
    status: cancelSalesOrder ? statusOf(cancelSalesOrder) : null,
  });

  const productAfterSalesCancel = await request(`/api/products/${productId}`, { headers: adminHeaders });
  const stockAfterSalesCancel = productAfterSalesCancel.body?.product?.stockQuantity;
  add("sales cancel restores stock", statusOf(productAfterSalesCancel) === 200 && stockAfterSalesCancel === 25, {
    status: statusOf(productAfterSalesCancel),
    stock: stockAfterSalesCancel,
  });

  const csvRoutes = [
    "/api/exports/products",
    "/api/exports/sales-orders",
    "/api/exports/purchase-orders",
    "/api/exports/users",
    "/api/exports/audit-logs",
  ];

  const csvResponses = await Promise.all(csvRoutes.map((path) => request(path, { headers: adminHeaders })));
  add(
    "CSV export routes return csv for admin",
    csvResponses.every(
      (item) => statusOf(item) === 200 && item.contentType.toLowerCase().includes("text/csv"),
    ),
    {
      statuses: csvResponses.map((item, index) => `${csvRoutes[index]}=${statusOf(item)}`),
      contentTypes: csvResponses.map((item) => item.contentType),
    },
  );

  const moduleSafetyTargets = [
    await request("/api/auth/me", { headers: adminHeaders }),
    await request("/api/dashboard/summary", { headers: adminHeaders }),
    await request("/api/users", { headers: adminHeaders }),
    await request("/api/roles", { headers: adminHeaders }),
    await request("/api/products", { headers: adminHeaders }),
    await request("/api/vendors", { headers: adminHeaders }),
    await request("/api/sales-orders", { headers: adminHeaders }),
    await request("/api/purchase-orders", { headers: adminHeaders }),
    await request("/api/audit-logs", { headers: adminHeaders }),
  ];

  add(
    "core authenticated JSON responses expose no passwordHash/tokenHash",
    moduleSafetyTargets.every((item) => mustJsonObject(item.body) && !hasUnsafeKeys(item.body)),
    { unsafe: moduleSafetyTargets.some((item) => hasUnsafeKeys(item.body)) },
  );

  const archiveProduct = await request(`/api/products/${productId}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  add(
    "product archive works",
    statusOf(archiveProduct) === 200 && archiveProduct.body?.product?.status === "inactive",
    { status: statusOf(archiveProduct), productStatus: archiveProduct.body?.product?.status ?? null },
  );

  const failed = checks.filter((check) => !check.ok);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        total: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length,
        checks,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
