import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.HAL137_BASE_URL ?? "http://127.0.0.1:3000";
const requestTimeoutMs = Number(process.env.HAL137_REQUEST_TIMEOUT_MS ?? 30000);
const artifactPath = resolve(process.cwd(), "..", "outputs", "HAL-137_sales_quotation_invoice_verification.json");

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

function hasUnsafeKeys(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, "passwordHash")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "tokenHash")) return true;
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
      response: new Response(
        JSON.stringify({ error: { code: "REQUEST_FAILED", message } }),
        { status: 599, headers: { "content-type": "application/json" } },
      ),
      body: { error: { code: "REQUEST_FAILED", message } },
      requestError: message,
      contentType: "application/json",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function statusOf(result) {
  return result.response.status;
}

async function registerCompanyAdmin(label) {
  const suffix = randomSuffix();
  const email = `hal137.${label}.${suffix}@example.com`;
  const password = `Hal137!${suffix}Aa`;

  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `HAL137 ${label}`,
      email,
      password,
      confirmPassword: password,
      companyName: `HAL137 ${label} ${suffix}`,
      termsAccepted: true,
    }),
  });

  const cookie = cookieFrom(register.response);
  return { email, password, register, cookie };
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

async function login(email, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { ...result, cookie: cookieFrom(result.response) };
}

async function getProduct(headers, productId) {
  return request(`/api/products/${productId}`, { headers });
}

async function main() {
  const root = await request("/");
  add("local app reachable", statusOf(root) === 200, { status: statusOf(root) });

  const unauthRoutes = [
    "/api/sales-quotations",
    "/api/sales-invoices",
    "/api/sales-orders",
  ];
  const unauthResults = await Promise.all(unauthRoutes.map((path) => request(path)));
  add(
    "unauthenticated quote and invoice routes return 401",
    unauthResults.every((result) => statusOf(result) === 401),
    {
      statuses: unauthResults.map((result, index) => `${unauthRoutes[index]}=${statusOf(result)}`),
    },
  );

  const adminA = await registerCompanyAdmin("admina");
  const adminB = await registerCompanyAdmin("adminb");
  add("admin tenant registrations succeed", statusOf(adminA.register) === 200 && statusOf(adminB.register) === 200, {
    adminAStatus: statusOf(adminA.register),
    adminBStatus: statusOf(adminB.register),
  });

  const adminAVerification = await verifyEmail(adminA.cookie);
  const adminBVerification = await verifyEmail(adminB.cookie);
  add(
    "admin email verification succeeds",
    statusOf(adminAVerification.verificationRequest) === 200 &&
      statusOf(adminAVerification.verificationConfirm) === 200 &&
      statusOf(adminBVerification.verificationRequest) === 200 &&
      statusOf(adminBVerification.verificationConfirm) === 200,
    {
      adminARequest: statusOf(adminAVerification.verificationRequest),
      adminAConfirm: statusOf(adminAVerification.verificationConfirm),
      adminBRequest: statusOf(adminBVerification.verificationRequest),
      adminBConfirm: statusOf(adminBVerification.verificationConfirm),
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

  const createProduct = await request("/api/products", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL137 Product",
      sku: `HAL137-SKU-${randomSuffix()}`,
      category: "Verification",
      salePrice: 150,
      costPrice: 100,
      stockQuantity: 25,
      status: "active",
    }),
  });
  const productId = createProduct.body?.product?.id;
  add("admin can create product for quote flow", statusOf(createProduct) === 201 && typeof productId === "string", {
    status: statusOf(createProduct),
  });

  const productBeforeQuote = productId ? await getProduct(adminAHeaders, productId) : null;
  const stockBefore = Number(productBeforeQuote?.body?.product?.stockQuantity ?? NaN);

  const staffEmail = `hal137.staff.${randomSuffix()}@example.com`;
  const staffTemporaryPassword = `Hal137Staff!${Math.floor(Math.random() * 1_000_000)}Aa`;
  const createStaffUser = await request("/api/users", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL137 Staff",
      email: staffEmail,
      temporaryPassword: staffTemporaryPassword,
    }),
  });
  add("admin can create staff user", statusOf(createStaffUser) === 201, {
    status: statusOf(createStaffUser),
  });

  const staffLogin = await login(staffEmail, staffTemporaryPassword);
  add("staff login succeeds", Boolean(staffLogin.cookie), {
    status: statusOf(staffLogin),
  });

  const staffHeaders = { cookie: staffLogin.cookie };
  const staffReadQuotations = await request("/api/sales-quotations", { headers: staffHeaders });
  const staffReadInvoices = await request("/api/sales-invoices", { headers: staffHeaders });
  add(
    "staff can read quotations and invoices",
    statusOf(staffReadQuotations) === 200 && statusOf(staffReadInvoices) === 200,
    {
      quotationsStatus: statusOf(staffReadQuotations),
      invoicesStatus: statusOf(staffReadInvoices),
    },
  );

  const staffCreateQuotation = await request("/api/sales-quotations", {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({
      customerName: "HAL137 Staff Attempt",
      discountAmount: 0,
      items: [{ productId, quantity: 1 }],
    }),
  });
  add("staff cannot create quotation without elevated permission", statusOf(staffCreateQuotation) === 403, {
    status: statusOf(staffCreateQuotation),
  });

  const quotePayload = {
    customerName: "HAL137 Customer",
    customerPhone: "0123456789",
    customerEmail: `customer.${randomSuffix()}@example.com`,
    customerAddress: "HAL137 Address",
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    discountAmount: 5,
    notes: "Verification quote",
    items: [{ productId, quantity: 2 }],
  };

  const createQuotation = await request("/api/sales-quotations", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify(quotePayload),
  });
  const quotationId = createQuotation.body?.data?.id;
  add("admin can create quotation", statusOf(createQuotation) === 201 && typeof quotationId === "string", {
    status: statusOf(createQuotation),
  });

  const updateQuotation = quotationId
    ? await request(`/api/sales-quotations/${quotationId}`, {
        method: "PATCH",
        headers: adminAHeaders,
        body: JSON.stringify({ notes: "Updated verification quote", discountAmount: 3 }),
      })
    : null;
  add("admin can update draft quotation", !!updateQuotation && statusOf(updateQuotation) === 200, {
    status: updateQuotation ? statusOf(updateQuotation) : null,
  });

  const sendQuotation = quotationId
    ? await request(`/api/sales-quotations/${quotationId}/send`, { method: "POST", headers: adminAHeaders })
    : null;
  add("admin can send quotation", !!sendQuotation && statusOf(sendQuotation) === 200, {
    status: sendQuotation ? statusOf(sendQuotation) : null,
  });

  const acceptQuotation = quotationId
    ? await request(`/api/sales-quotations/${quotationId}/accept`, { method: "POST", headers: adminAHeaders })
    : null;
  add("admin can accept quotation", !!acceptQuotation && statusOf(acceptQuotation) === 200, {
    status: acceptQuotation ? statusOf(acceptQuotation) : null,
  });

  const productAfterAccept = productId ? await getProduct(adminAHeaders, productId) : null;
  const stockAfterAccept = Number(productAfterAccept?.body?.product?.stockQuantity ?? NaN);
  add("quote acceptance does not change stock", Number.isFinite(stockBefore) && stockBefore === stockAfterAccept, {
    before: stockBefore,
    afterAccept: stockAfterAccept,
  });

  const rejectQuotationSeed = await request("/api/sales-quotations", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      ...quotePayload,
      customerName: "HAL137 Reject Customer",
    }),
  });
  const rejectQuotationId = rejectQuotationSeed.body?.data?.id;
  const rejectQuotation = rejectQuotationId
    ? await request(`/api/sales-quotations/${rejectQuotationId}/reject`, { method: "POST", headers: adminAHeaders })
    : null;
  add("admin can reject quotation", !!rejectQuotation && statusOf(rejectQuotation) === 200, {
    status: rejectQuotation ? statusOf(rejectQuotation) : null,
  });

  const expireQuotationSeed = await request("/api/sales-quotations", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      ...quotePayload,
      customerName: "HAL137 Expire Customer",
    }),
  });
  const expireQuotationId = expireQuotationSeed.body?.data?.id;
  const expireQuotation = expireQuotationId
    ? await request(`/api/sales-quotations/${expireQuotationId}/expire`, { method: "POST", headers: adminAHeaders })
    : null;
  add("admin can expire quotation", !!expireQuotation && statusOf(expireQuotation) === 200, {
    status: expireQuotation ? statusOf(expireQuotation) : null,
  });

  const convertQuotation = quotationId
    ? await request(`/api/sales-quotations/${quotationId}/convert-to-order`, { method: "POST", headers: adminAHeaders })
    : null;
  const salesOrderId = convertQuotation?.body?.data?.salesOrderId;
  add("accepted quotation converts to sales order once", !!convertQuotation && statusOf(convertQuotation) === 200 && typeof salesOrderId === "string", {
    status: convertQuotation ? statusOf(convertQuotation) : null,
  });

  const duplicateConvert = quotationId
    ? await request(`/api/sales-quotations/${quotationId}/convert-to-order`, { method: "POST", headers: adminAHeaders })
    : null;
  add("duplicate quotation conversion is blocked", !!duplicateConvert && statusOf(duplicateConvert) === 400, {
    status: duplicateConvert ? statusOf(duplicateConvert) : null,
  });

  const confirmOrder = salesOrderId
    ? await request(`/api/sales-orders/${salesOrderId}/confirm`, { method: "POST", headers: adminAHeaders })
    : null;
  add("converted sales order can be confirmed", !!confirmOrder && statusOf(confirmOrder) === 200, {
    status: confirmOrder ? statusOf(confirmOrder) : null,
  });

  const productAfterConfirm = productId ? await getProduct(adminAHeaders, productId) : null;
  const stockAfterConfirm = Number(productAfterConfirm?.body?.product?.stockQuantity ?? NaN);
  add(
    "stock moves only when sales order is confirmed",
    Number.isFinite(stockBefore) && Number.isFinite(stockAfterConfirm) && stockAfterConfirm === stockBefore - 2,
    {
      before: stockBefore,
      afterConfirm: stockAfterConfirm,
    },
  );

  const createInvoice = salesOrderId
    ? await request("/api/sales-invoices/from-sales-order", {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ salesOrderId, quotationId }),
      })
    : null;
  const invoiceId = createInvoice?.body?.data?.id;
  const receivableId = createInvoice?.body?.data?.receivableId;
  add("confirmed sales order can generate invoice", !!createInvoice && statusOf(createInvoice) === 201 && typeof invoiceId === "string", {
    status: createInvoice ? statusOf(createInvoice) : null,
  });
  add("invoice links or creates receivable once", !!createInvoice && typeof receivableId === "string", {
    receivableId: typeof receivableId === "string",
  });

  const duplicateInvoice = salesOrderId
    ? await request("/api/sales-invoices/from-sales-order", {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ salesOrderId }),
      })
    : null;
  add("duplicate invoice generation is blocked", !!duplicateInvoice && statusOf(duplicateInvoice) === 400, {
    status: duplicateInvoice ? statusOf(duplicateInvoice) : null,
  });

  const invoiceRead = invoiceId ? await request(`/api/sales-invoices/${invoiceId}`, { headers: adminAHeaders }) : null;
  add("invoice read exposes no unsafe fields", !!invoiceRead && statusOf(invoiceRead) === 200 && !hasUnsafeKeys(invoiceRead.body), {
    status: invoiceRead ? statusOf(invoiceRead) : null,
    unsafe: invoiceRead ? hasUnsafeKeys(invoiceRead.body) : true,
  });

  const foreignQuotationRead = quotationId ? await request(`/api/sales-quotations/${quotationId}`, { headers: adminBHeaders }) : null;
  const foreignInvoiceRead = invoiceId ? await request(`/api/sales-invoices/${invoiceId}`, { headers: adminBHeaders }) : null;
  add("tenant isolation blocks cross-company quotation and invoice reads", !!foreignQuotationRead && !!foreignInvoiceRead && statusOf(foreignQuotationRead) === 403 && statusOf(foreignInvoiceRead) === 403, {
    quotationStatus: foreignQuotationRead ? statusOf(foreignQuotationRead) : null,
    invoiceStatus: foreignInvoiceRead ? statusOf(foreignInvoiceRead) : null,
  });

  const quotationList = await request("/api/sales-quotations", { headers: adminAHeaders });
  const invoiceList = await request("/api/sales-invoices", { headers: adminAHeaders });
  add("quote and invoice list payloads are safe", statusOf(quotationList) === 200 && statusOf(invoiceList) === 200 && !hasUnsafeKeys(quotationList.body) && !hasUnsafeKeys(invoiceList.body), {
    quotationStatus: statusOf(quotationList),
    invoiceStatus: statusOf(invoiceList),
    quotationUnsafe: hasUnsafeKeys(quotationList.body),
    invoiceUnsafe: hasUnsafeKeys(invoiceList.body),
  });

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
