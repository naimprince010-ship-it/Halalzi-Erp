import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
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
}

loadEnvFile(resolve(process.cwd(), ".env"));

const baseUrl = process.env.HAL143_BASE_URL ?? "http://127.0.0.1:3000";
const requestTimeoutMs = Number(process.env.HAL143_REQUEST_TIMEOUT_MS ?? 120000);
const artifactPath = resolve(process.cwd(), "..", "outputs", "HAL-143_purchase_approval_workflow_verification.json");
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim();

const checks = [];

function add(name, ok, details = {}) {
  checks.push({ name, ok, details });
}

function randomSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function statusOf(result) {
  return result.response.status;
}

function hasUnsafeKeys(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "tokenHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "sessionSecret")) return true;
  return Object.values(value).some((child) =>
    Array.isArray(child) ? child.some(hasUnsafeKeys) : hasUnsafeKeys(child),
  );
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
    return {
      response: new Response(JSON.stringify({ error: { code: "REQUEST_FAILED", message } }), {
        status: 599,
        headers: { "content-type": "application/json" },
      }),
      body: { error: { code: "REQUEST_FAILED", message } },
      requestError: message,
      contentType: "application/json",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function retryableRequest(path, options = {}, attempts = 3) {
  let result = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await request(path, options);

    if (![404, 599].includes(statusOf(result))) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }

  return result;
}

async function registerCompanyAdmin(label) {
  const suffix = randomSuffix();
  const email = `hal143.${label}.${suffix}@example.com`;
  const password = `Hal143!${suffix}Aa`;

  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `HAL143 ${label}`,
      email,
      password,
      confirmPassword: password,
      companyName: `HAL143 ${label} ${suffix}`,
      termsAccepted: true,
    }),
  });

  return { email, password, register, cookie: cookieFrom(register.response) };
}

async function verifyEmail(cookie) {
  const verificationRequest = await request("/api/auth/email-verification/request", {
    method: "POST",
    headers: { cookie },
  });
  const token = verificationRequest.body?.devVerificationToken;

  if (!token) {
    return { verificationRequest, verificationConfirm: null };
  }

  const verificationConfirm = await request("/api/auth/email-verification/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

  return { verificationRequest, verificationConfirm };
}

async function markGeneratedUserVerified(email) {
  if (!databaseUrl || !email.endsWith("@example.com") || !email.startsWith("hal143.")) {
    return null;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const result = await pool.query(
      'UPDATE "User" SET "emailVerifiedAt" = NOW(), "updatedAt" = NOW() WHERE "email" = $1 RETURNING "id"',
      [email],
    );
    return result.rowCount === 1;
  } finally {
    await pool.end();
  }
}

async function verifyGeneratedAdmin(email, cookie) {
  const verification = await verifyEmail(cookie);

  if (verification.verificationConfirm && statusOf(verification.verificationConfirm) === 200) {
    return { ...verification, dbVerified: false };
  }

  const dbVerified = await markGeneratedUserVerified(email);
  return { ...verification, dbVerified };
}

async function login(email, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return { ...result, cookie: cookieFrom(result.response) };
}

async function createProduct(headers, label, stockQuantity = 20) {
  return request("/api/products", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `HAL143 Product ${label}`,
      sku: `HAL143-SKU-${label}-${randomSuffix()}`,
      category: "Verification",
      salePrice: 120,
      costPrice: 80,
      stockQuantity,
      status: "active",
    }),
  });
}

async function readProduct(headers, productId) {
  const products = await request("/api/products", { headers });
  const product = products.body?.products?.find((item) => item.id === productId) ?? null;
  return { products, product };
}

async function createVendor(headers, label) {
  return request("/api/vendors", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `HAL143 Vendor ${label} ${randomSuffix()}`,
      code: `HAL143-VND-${label}-${randomSuffix()}`,
      status: "active",
    }),
  });
}

async function createPurchaseOrder(headers, vendorId, productId, label, quantity = 2) {
  return request("/api/purchase-orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      vendorId,
      discountAmount: 0,
      notes: `HAL143 ${label}`,
      items: [{ productId, quantity, unitCost: 50 }],
    }),
  });
}

async function submit(headers, purchaseOrderId) {
  return request(`/api/purchase-orders/${purchaseOrderId}/submit`, { method: "POST", headers });
}

async function approve(headers, purchaseOrderId, note = "HAL143 approval") {
  return request(`/api/purchase-orders/${purchaseOrderId}/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ note }),
  });
}

async function reject(headers, purchaseOrderId, reason = "HAL143 rejection reason") {
  return request(`/api/purchase-orders/${purchaseOrderId}/reject`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason }),
  });
}

async function markOrdered(headers, purchaseOrderId) {
  return request(`/api/purchase-orders/${purchaseOrderId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "ordered" }),
  });
}

async function receive(headers, purchaseOrderId) {
  return request(`/api/purchase-orders/${purchaseOrderId}/receive`, { method: "POST", headers });
}

async function cancel(headers, purchaseOrderId) {
  return request(`/api/purchase-orders/${purchaseOrderId}/cancel`, { method: "POST", headers });
}

async function createApprovedOrder(headers, vendorId, productId, label, quantity = 2) {
  const created = await createPurchaseOrder(headers, vendorId, productId, label, quantity);
  const purchaseOrderId = created.body?.purchaseOrder?.id;
  const submitted = purchaseOrderId ? await submit(headers, purchaseOrderId) : null;
  const approved = purchaseOrderId ? await approve(headers, purchaseOrderId) : null;
  return { created, submitted, approved, purchaseOrderId };
}

async function findPayable(headers, purchaseOrderId) {
  const payables = await request("/api/finance/payables", { headers });
  const payable = payables.body?.payables?.find((item) => item.purchaseOrderId === purchaseOrderId) ?? null;
  return { payables, payable };
}

async function main() {
  const root = await request("/");
  add("local app reachable", statusOf(root) === 200, { status: statusOf(root) });

  const unauthSubmit = await request("/api/purchase-orders/not-real/submit", { method: "POST" });
  const unauthApprove = await request("/api/purchase-orders/not-real/approve", { method: "POST", body: "{}" });
  const unauthReject = await request("/api/purchase-orders/not-real/reject", {
    method: "POST",
    body: JSON.stringify({ reason: "no auth" }),
  });
  add(
    "unauthenticated approval lifecycle routes return 401",
    statusOf(unauthSubmit) === 401 && statusOf(unauthApprove) === 401 && statusOf(unauthReject) === 401,
    { submit: statusOf(unauthSubmit), approve: statusOf(unauthApprove), reject: statusOf(unauthReject) },
  );

  const adminA = await registerCompanyAdmin("admina");
  const adminB = await registerCompanyAdmin("adminb");
  add("admin tenant registrations succeed", statusOf(adminA.register) === 200 && statusOf(adminB.register) === 200, {
    adminAStatus: statusOf(adminA.register),
    adminBStatus: statusOf(adminB.register),
  });

  const adminAVerification = await verifyGeneratedAdmin(adminA.email, adminA.cookie);
  const adminBVerification = await verifyGeneratedAdmin(adminB.email, adminB.cookie);
  add(
    "admin email verification succeeds",
    statusOf(adminAVerification.verificationRequest) === 200 &&
      ((!!adminAVerification.verificationConfirm && statusOf(adminAVerification.verificationConfirm) === 200) ||
        adminAVerification.dbVerified === true) &&
      statusOf(adminBVerification.verificationRequest) === 200 &&
      ((!!adminBVerification.verificationConfirm && statusOf(adminBVerification.verificationConfirm) === 200) ||
        adminBVerification.dbVerified === true),
    {
      adminARequest: statusOf(adminAVerification.verificationRequest),
      adminAConfirm: adminAVerification.verificationConfirm ? statusOf(adminAVerification.verificationConfirm) : null,
      adminADbVerified: adminAVerification.dbVerified ?? false,
      adminBRequest: statusOf(adminBVerification.verificationRequest),
      adminBConfirm: adminBVerification.verificationConfirm ? statusOf(adminBVerification.verificationConfirm) : null,
      adminBDbVerified: adminBVerification.dbVerified ?? false,
    },
  );

  const adminALogin = await login(adminA.email, adminA.password);
  const adminBLogin = await login(adminB.email, adminB.password);
  add("verified admin logins succeed", Boolean(adminALogin.cookie) && Boolean(adminBLogin.cookie), {
    adminAStatus: statusOf(adminALogin),
    adminBStatus: statusOf(adminBLogin),
  });

  const adminAHeaders = { cookie: adminALogin.cookie };
  const adminBHeaders = { cookie: adminBLogin.cookie };

  const staffEmail = `hal143.staff.${randomSuffix()}@example.com`;
  const staffTemporaryPassword = `Hal143Staff!${Math.floor(Math.random() * 1_000_000)}Aa`;
  const createStaffUser = await request("/api/users", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL143 Staff",
      email: staffEmail,
      temporaryPassword: staffTemporaryPassword,
    }),
  });
  const staffLogin = await login(staffEmail, staffTemporaryPassword);
  const staffHeaders = { cookie: staffLogin.cookie };

  const staffReadPurchases = await request("/api/purchase-orders", { headers: staffHeaders });
  const staffSubmit = await submit(staffHeaders, "not-real");
  const staffApprove = await approve(staffHeaders, "not-real");
  const staffReject = await reject(staffHeaders, "not-real");
  add(
    "staff can read purchases but cannot submit approve or reject",
    statusOf(createStaffUser) === 201 &&
      Boolean(staffLogin.cookie) &&
      statusOf(staffReadPurchases) === 200 &&
      statusOf(staffSubmit) === 403 &&
      statusOf(staffApprove) === 403 &&
      statusOf(staffReject) === 403,
    {
      createStaffStatus: statusOf(createStaffUser),
      staffLoginStatus: statusOf(staffLogin),
      readStatus: statusOf(staffReadPurchases),
      submitStatus: statusOf(staffSubmit),
      approveStatus: statusOf(staffApprove),
      rejectStatus: statusOf(staffReject),
    },
  );

  const product = await createProduct(adminAHeaders, "main", 30);
  const vendor = await createVendor(adminAHeaders, "main");
  const productId = product.body?.product?.id;
  const vendorId = vendor.body?.vendor?.id;
  add("admin can create procurement fixtures", statusOf(product) === 201 && statusOf(vendor) === 201, {
    productStatus: statusOf(product),
    vendorStatus: statusOf(vendor),
  });

  const draft = await createPurchaseOrder(adminAHeaders, vendorId, productId, "draft-update", 2);
  const draftId = draft.body?.purchaseOrder?.id;
  const draftUpdate = draftId
    ? await request(`/api/purchase-orders/${draftId}`, {
        method: "PATCH",
        headers: adminAHeaders,
        body: JSON.stringify({ notes: "HAL143 draft update passed" }),
      })
    : null;
  add(
    "admin can create and update draft purchase order",
    statusOf(draft) === 201 &&
      draft.body?.purchaseOrder?.status === "draft" &&
      !!draftUpdate &&
      statusOf(draftUpdate) === 200,
    {
      createStatus: statusOf(draft),
      initialStatus: draft.body?.purchaseOrder?.status ?? null,
      updateStatus: draftUpdate ? statusOf(draftUpdate) : null,
    },
  );

  const pending = await createPurchaseOrder(adminAHeaders, vendorId, productId, "pending-rules", 1);
  const pendingId = pending.body?.purchaseOrder?.id;
  const pendingSubmit = pendingId ? await submit(adminAHeaders, pendingId) : null;
  const pendingUpdate = pendingId
    ? await request(`/api/purchase-orders/${pendingId}`, {
        method: "PATCH",
        headers: adminAHeaders,
        body: JSON.stringify({ notes: "should fail" }),
      })
    : null;
  const pendingMarkOrdered = pendingId ? await markOrdered(adminAHeaders, pendingId) : null;
  const pendingReceive = pendingId ? await receive(adminAHeaders, pendingId) : null;
  add(
    "pending approval order blocks edit mark ordered and receive",
    !!pendingSubmit &&
      statusOf(pendingSubmit) === 200 &&
      pendingSubmit.body?.purchaseOrder?.status === "pending_approval" &&
      !!pendingUpdate &&
      statusOf(pendingUpdate) === 400 &&
      !!pendingMarkOrdered &&
      statusOf(pendingMarkOrdered) === 400 &&
      !!pendingReceive &&
      statusOf(pendingReceive) === 400,
    {
      submitStatus: pendingSubmit ? statusOf(pendingSubmit) : null,
      pendingStatus: pendingSubmit?.body?.purchaseOrder?.status ?? null,
      updateStatus: pendingUpdate ? statusOf(pendingUpdate) : null,
      markOrderedStatus: pendingMarkOrdered ? statusOf(pendingMarkOrdered) : null,
      receiveStatus: pendingReceive ? statusOf(pendingReceive) : null,
    },
  );

  const pendingApprove = pendingId ? await approve(adminAHeaders, pendingId, "HAL143 approved") : null;
  add(
    "pending purchase order can be approved with approver metadata",
    !!pendingApprove &&
      statusOf(pendingApprove) === 200 &&
      pendingApprove.body?.purchaseOrder?.status === "approved" &&
      typeof pendingApprove.body?.purchaseOrder?.approvedAt === "string" &&
      typeof pendingApprove.body?.purchaseOrder?.approvedBy?.id === "string",
    {
      approveStatus: pendingApprove ? statusOf(pendingApprove) : null,
      status: pendingApprove?.body?.purchaseOrder?.status ?? null,
      approvedAt: pendingApprove?.body?.purchaseOrder?.approvedAt ?? null,
      approvedById: pendingApprove?.body?.purchaseOrder?.approvedBy?.id ?? null,
    },
  );

  const approvedMarkOrdered = pendingId ? await markOrdered(adminAHeaders, pendingId) : null;
  const orderedReceive = pendingId ? await receive(adminAHeaders, pendingId) : null;
  const payableForReceived = pendingId ? await findPayable(adminAHeaders, pendingId) : null;
  const stockLedger = productId ? await request(`/api/products/${productId}/stock-ledger`, { headers: adminAHeaders }) : null;
  add(
    "approved order can be marked ordered and received with payable and stock ledger",
    !!approvedMarkOrdered &&
      statusOf(approvedMarkOrdered) === 200 &&
      approvedMarkOrdered.body?.purchaseOrder?.status === "ordered" &&
      !!orderedReceive &&
      statusOf(orderedReceive) === 200 &&
      orderedReceive.body?.purchaseOrder?.status === "received" &&
      !!payableForReceived &&
      statusOf(payableForReceived.payables) === 200 &&
      payableForReceived.payable?.purchaseOrderId === pendingId &&
      !!stockLedger &&
      statusOf(stockLedger) === 200 &&
      stockLedger.body?.entries?.some((entry) => entry.sourceId === pendingId && entry.type === "purchase_order_receive"),
    {
      markOrderedStatus: approvedMarkOrdered ? statusOf(approvedMarkOrdered) : null,
      receiveStatus: orderedReceive ? statusOf(orderedReceive) : null,
      payableId: payableForReceived?.payable?.id ?? null,
      stockLedgerStatus: stockLedger ? statusOf(stockLedger) : null,
    },
  );

  const rejectCandidate = await createPurchaseOrder(adminAHeaders, vendorId, productId, "reject", 1);
  const rejectCandidateId = rejectCandidate.body?.purchaseOrder?.id;
  const rejectSubmit = rejectCandidateId ? await submit(adminAHeaders, rejectCandidateId) : null;
  const rejected = rejectCandidateId ? await reject(adminAHeaders, rejectCandidateId, "HAL143 rejection check") : null;
  const rejectedMarkOrdered = rejectCandidateId ? await markOrdered(adminAHeaders, rejectCandidateId) : null;
  const rejectedReceive = rejectCandidateId ? await receive(adminAHeaders, rejectCandidateId) : null;
  add(
    "pending purchase order can be rejected and cannot be ordered or received",
    !!rejectSubmit &&
      statusOf(rejectSubmit) === 200 &&
      !!rejected &&
      statusOf(rejected) === 200 &&
      rejected.body?.purchaseOrder?.status === "rejected" &&
      rejected.body?.purchaseOrder?.rejectionReason === "HAL143 rejection check" &&
      !!rejectedMarkOrdered &&
      statusOf(rejectedMarkOrdered) === 400 &&
      !!rejectedReceive &&
      statusOf(rejectedReceive) === 400,
    {
      rejectStatus: rejected ? statusOf(rejected) : null,
      status: rejected?.body?.purchaseOrder?.status ?? null,
      reason: rejected?.body?.purchaseOrder?.rejectionReason ?? null,
      markOrderedStatus: rejectedMarkOrdered ? statusOf(rejectedMarkOrdered) : null,
      receiveStatus: rejectedReceive ? statusOf(rejectedReceive) : null,
    },
  );

  const cancelPending = await createPurchaseOrder(adminAHeaders, vendorId, productId, "cancel-pending", 1);
  const cancelPendingId = cancelPending.body?.purchaseOrder?.id;
  const cancelPendingSubmit = cancelPendingId ? await submit(adminAHeaders, cancelPendingId) : null;
  const cancelledPending = cancelPendingId ? await cancel(adminAHeaders, cancelPendingId) : null;
  const pendingPayable = cancelPendingId ? await findPayable(adminAHeaders, cancelPendingId) : null;
  add(
    "pending purchase order cancellation has no payable side effect",
    !!cancelPendingSubmit &&
      statusOf(cancelPendingSubmit) === 200 &&
      !!cancelledPending &&
      statusOf(cancelledPending) === 200 &&
      cancelledPending.body?.purchaseOrder?.status === "cancelled" &&
      !!pendingPayable &&
      !pendingPayable.payable,
    {
      cancelStatus: cancelledPending ? statusOf(cancelledPending) : null,
      payableFound: Boolean(pendingPayable?.payable),
    },
  );

  const cancelApprovedFlow = await createApprovedOrder(adminAHeaders, vendorId, productId, "cancel-approved", 1);
  const cancelledApproved = cancelApprovedFlow.purchaseOrderId
    ? await cancel(adminAHeaders, cancelApprovedFlow.purchaseOrderId)
    : null;
  const approvedPayable = cancelApprovedFlow.purchaseOrderId
    ? await findPayable(adminAHeaders, cancelApprovedFlow.purchaseOrderId)
    : null;
  add(
    "approved purchase order cancellation has no payable side effect",
    statusOf(cancelApprovedFlow.created) === 201 &&
      !!cancelApprovedFlow.approved &&
      statusOf(cancelApprovedFlow.approved) === 200 &&
      !!cancelledApproved &&
      statusOf(cancelledApproved) === 200 &&
      cancelledApproved.body?.purchaseOrder?.status === "cancelled" &&
      !!approvedPayable &&
      !approvedPayable.payable,
    {
      cancelStatus: cancelledApproved ? statusOf(cancelledApproved) : null,
      payableFound: Boolean(approvedPayable?.payable),
    },
  );

  const cancelOrderedFlow = await createApprovedOrder(adminAHeaders, vendorId, productId, "cancel-ordered", 1);
  const orderedForCancel = cancelOrderedFlow.purchaseOrderId
    ? await markOrdered(adminAHeaders, cancelOrderedFlow.purchaseOrderId)
    : null;
  const cancelledOrdered = cancelOrderedFlow.purchaseOrderId
    ? await cancel(adminAHeaders, cancelOrderedFlow.purchaseOrderId)
    : null;
  const orderedPayable = cancelOrderedFlow.purchaseOrderId
    ? await findPayable(adminAHeaders, cancelOrderedFlow.purchaseOrderId)
    : null;
  add(
    "ordered purchase order cancellation has no payable side effect",
    !!orderedForCancel &&
      statusOf(orderedForCancel) === 200 &&
      !!cancelledOrdered &&
      statusOf(cancelledOrdered) === 200 &&
      cancelledOrdered.body?.purchaseOrder?.status === "cancelled" &&
      !!orderedPayable &&
      !orderedPayable.payable,
    {
      orderedStatus: orderedForCancel ? statusOf(orderedForCancel) : null,
      cancelStatus: cancelledOrdered ? statusOf(cancelledOrdered) : null,
      payableFound: Boolean(orderedPayable?.payable),
    },
  );

  const receivedCancelProduct = await createProduct(adminAHeaders, "received-cancel", 10);
  const receivedCancelProductId = receivedCancelProduct.body?.product?.id;
  const receivedCancelFlow = await createApprovedOrder(adminAHeaders, vendorId, receivedCancelProductId, "received-cancel", 4);
  const receivedCancelOrdered = receivedCancelFlow.purchaseOrderId
    ? await markOrdered(adminAHeaders, receivedCancelFlow.purchaseOrderId)
    : null;
  const receivedCancelReceive = receivedCancelFlow.purchaseOrderId
    ? await receive(adminAHeaders, receivedCancelFlow.purchaseOrderId)
    : null;
  const stockAfterReceive = receivedCancelProductId ? await readProduct(adminAHeaders, receivedCancelProductId) : null;
  const receivedCancel = receivedCancelFlow.purchaseOrderId ? await cancel(adminAHeaders, receivedCancelFlow.purchaseOrderId) : null;
  const stockAfterCancel = receivedCancelProductId ? await readProduct(adminAHeaders, receivedCancelProductId) : null;
  const receivedCancelledPayable = receivedCancelFlow.purchaseOrderId
    ? await findPayable(adminAHeaders, receivedCancelFlow.purchaseOrderId)
    : null;
  add(
    "received unpaid purchase order cancellation restores stock and cancels payable",
    !!receivedCancelOrdered &&
      statusOf(receivedCancelOrdered) === 200 &&
      !!receivedCancelReceive &&
      statusOf(receivedCancelReceive) === 200 &&
      !!stockAfterReceive &&
      Number(stockAfterReceive.product?.stockQuantity) === 14 &&
      !!receivedCancel &&
      statusOf(receivedCancel) === 200 &&
      !!stockAfterCancel &&
      Number(stockAfterCancel.product?.stockQuantity) === 10 &&
      receivedCancelledPayable?.payable?.status === "cancelled",
    {
      receiveStatus: receivedCancelReceive ? statusOf(receivedCancelReceive) : null,
      stockAfterReceive: stockAfterReceive?.product?.stockQuantity ?? null,
      cancelStatus: receivedCancel ? statusOf(receivedCancel) : null,
      stockAfterCancel: stockAfterCancel?.product?.stockQuantity ?? null,
      payableStatus: receivedCancelledPayable?.payable?.status ?? null,
    },
  );

  const paidCancelProduct = await createProduct(adminAHeaders, "paid-cancel", 5);
  const paidCancelProductId = paidCancelProduct.body?.product?.id;
  const paidCancelFlow = await createApprovedOrder(adminAHeaders, vendorId, paidCancelProductId, "paid-cancel", 1);
  const paidCancelOrdered = paidCancelFlow.purchaseOrderId ? await markOrdered(adminAHeaders, paidCancelFlow.purchaseOrderId) : null;
  const paidCancelReceived = paidCancelFlow.purchaseOrderId ? await receive(adminAHeaders, paidCancelFlow.purchaseOrderId) : null;
  const paidPayable = paidCancelFlow.purchaseOrderId ? await findPayable(adminAHeaders, paidCancelFlow.purchaseOrderId) : null;
  const payablePayment = paidPayable?.payable?.id
    ? await retryableRequest(`/api/finance/payables/${paidPayable.payable.id}/payments`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ amount: 1, method: "cash" }),
      })
    : null;
  const paidCancelBlocked = paidCancelFlow.purchaseOrderId ? await cancel(adminAHeaders, paidCancelFlow.purchaseOrderId) : null;
  add(
    "received purchase order cancellation is blocked after payable payment",
    !!paidCancelOrdered &&
      statusOf(paidCancelOrdered) === 200 &&
      !!paidCancelReceived &&
      statusOf(paidCancelReceived) === 200 &&
      !!payablePayment &&
      statusOf(payablePayment) === 201 &&
      !!paidCancelBlocked &&
      statusOf(paidCancelBlocked) === 400,
    {
      receiveStatus: paidCancelReceived ? statusOf(paidCancelReceived) : null,
      payablePaymentStatus: payablePayment ? statusOf(payablePayment) : null,
      cancelStatus: paidCancelBlocked ? statusOf(paidCancelBlocked) : null,
    },
  );

  const crossTenantCandidate = await createPurchaseOrder(adminAHeaders, vendorId, productId, "cross-tenant", 1);
  const crossTenantId = crossTenantCandidate.body?.purchaseOrder?.id;
  const crossSubmit = crossTenantId ? await submit(adminBHeaders, crossTenantId) : null;
  const crossApprove = crossTenantId ? await approve(adminBHeaders, crossTenantId) : null;
  const crossReject = crossTenantId ? await reject(adminBHeaders, crossTenantId) : null;
  add(
    "cross-tenant submit approve and reject are blocked",
    !!crossSubmit &&
      statusOf(crossSubmit) === 403 &&
      !!crossApprove &&
      statusOf(crossApprove) === 403 &&
      !!crossReject &&
      statusOf(crossReject) === 403,
    {
      submitStatus: crossSubmit ? statusOf(crossSubmit) : null,
      approveStatus: crossApprove ? statusOf(crossApprove) : null,
      rejectStatus: crossReject ? statusOf(crossReject) : null,
    },
  );

  const auditLogs = await request("/api/audit-logs", { headers: adminAHeaders });
  const auditActions = auditLogs.body?.auditLogs?.map((entry) => entry.action) ?? [];
  const requiredAuditActions = [
    "purchase_order.submit",
    "purchase_order.approve",
    "purchase_order.reject",
    "purchase_order.mark_ordered",
    "purchase_order.receive",
    "purchase_order.cancel",
  ];
  add(
    "audit events record approval and downstream lifecycle actions",
    statusOf(auditLogs) === 200 && requiredAuditActions.every((action) => auditActions.includes(action)),
    {
      auditStatus: statusOf(auditLogs),
      missingActions: requiredAuditActions.filter((action) => !auditActions.includes(action)),
    },
  );

  const safePayloads = [
    pendingSubmit,
    pendingApprove,
    approvedMarkOrdered,
    orderedReceive,
    rejected,
    cancelledPending,
    cancelledApproved,
    cancelledOrdered,
    receivedCancel,
  ].filter(Boolean);
  add(
    "safe responses expose no password token or session fields",
    safePayloads.every((payload) => !hasUnsafeKeys(payload.body)),
    { unsafeDetected: safePayloads.some((payload) => hasUnsafeKeys(payload.body)) },
  );

  const result = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    totals: {
      total: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: checks.filter((check) => !check.ok).length,
    },
    checks,
  };

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: result.totals.failed === 0, artifactPath, totals: result.totals }, null, 2));

  if (result.totals.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  mkdirSync(dirname(artifactPath), { recursive: true });
  const result = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    totals: {
      total: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: checks.filter((check) => !check.ok).length + 1,
    },
    checks: [
      ...checks,
      {
        name: "script execution",
        ok: false,
        details: {
          message: error instanceof Error ? error.message : "unknown error",
        },
      },
    ],
  };

  writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
