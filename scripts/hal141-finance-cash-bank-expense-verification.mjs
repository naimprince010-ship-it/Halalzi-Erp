import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.HAL141_BASE_URL ?? "http://127.0.0.1:3000";
const requestTimeoutMs = Number(process.env.HAL141_REQUEST_TIMEOUT_MS ?? 120000);
const artifactPath = resolve(process.cwd(), "..", "outputs", "HAL-141_finance_cash_bank_expense_verification.json");

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

function statusOf(result) {
  return result.response.status;
}

async function registerCompanyAdmin(label) {
  const suffix = randomSuffix();
  const email = `hal141.${label}.${suffix}@example.com`;
  const password = `Hal141!${suffix}Aa`;

  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `HAL141 ${label}`,
      email,
      password,
      confirmPassword: password,
      companyName: `HAL141 ${label} ${suffix}`,
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

async function login(email, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return { ...result, cookie: cookieFrom(result.response) };
}

async function createProduct(headers, label) {
  return request("/api/products", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `HAL141 Product ${label}`,
      sku: `HAL141-SKU-${label}-${randomSuffix()}`,
      category: "Verification",
      salePrice: 120,
      costPrice: 80,
      stockQuantity: 30,
      status: "active",
    }),
  });
}

async function createSalesOrder(headers, productId, quantity = 2) {
  return request("/api/sales-orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      customerName: `HAL141 Customer ${randomSuffix()}`,
      customerPhone: "0123456789",
      customerEmail: `customer.${randomSuffix()}@example.com`,
      customerAddress: "HAL141 Street",
      discountAmount: 0,
      items: [{ productId, quantity }],
    }),
  });
}

async function createVendor(headers) {
  return request("/api/vendors", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `HAL141 Vendor ${randomSuffix()}`,
      code: `HAL141-VND-${randomSuffix()}`,
      status: "active",
    }),
  });
}

async function createPurchaseOrder(headers, vendorId, productId, quantity = 2) {
  return request("/api/purchase-orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      vendorId,
      discountAmount: 0,
      items: [{ productId, quantity, unitCost: 50 }],
    }),
  });
}

async function main() {
  const root = await request("/");
  add("local app reachable", statusOf(root) === 200, { status: statusOf(root) });

  const unauthRoutes = ["/api/finance/expenses", "/api/finance/reports/cash-bank-summary"];
  const unauthResults = [];
  for (const path of unauthRoutes) {
    unauthResults.push(await request(path));
  }
  add(
    "unauthenticated expense and cash/bank routes return 401",
    unauthResults.every((result) => statusOf(result) === 401),
    { statuses: unauthResults.map((result, index) => `${unauthRoutes[index]}=${statusOf(result)}`) },
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
      !!adminAVerification.verificationConfirm &&
      statusOf(adminAVerification.verificationConfirm) === 200 &&
      statusOf(adminBVerification.verificationRequest) === 200 &&
      !!adminBVerification.verificationConfirm &&
      statusOf(adminBVerification.verificationConfirm) === 200,
    {
      adminARequest: statusOf(adminAVerification.verificationRequest),
      adminAConfirm: adminAVerification.verificationConfirm ? statusOf(adminAVerification.verificationConfirm) : null,
      adminBRequest: statusOf(adminBVerification.verificationRequest),
      adminBConfirm: adminBVerification.verificationConfirm ? statusOf(adminBVerification.verificationConfirm) : null,
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

  const staffEmail = `hal141.staff.${randomSuffix()}@example.com`;
  const staffTemporaryPassword = `Hal141Staff!${Math.floor(Math.random() * 1_000_000)}Aa`;
  const createStaffUser = await request("/api/users", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL141 Staff",
      email: staffEmail,
      temporaryPassword: staffTemporaryPassword,
    }),
  });
  add("admin can create staff user", statusOf(createStaffUser) === 201, { status: statusOf(createStaffUser) });

  const staffLogin = await login(staffEmail, staffTemporaryPassword);
  add("staff login succeeds", Boolean(staffLogin.cookie), { status: statusOf(staffLogin) });
  const staffHeaders = { cookie: staffLogin.cookie };

  const staffExpenseSummary = await request("/api/finance/reports/expense-summary", { headers: staffHeaders });
  const staffCashBankSummary = await request("/api/finance/reports/cash-bank-summary", { headers: staffHeaders });
  const staffCreateExpense = await request("/api/finance/expenses", {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({ amount: 10, categoryAccountId: "x", paidFromAccountId: "y" }),
  });
  add(
    "staff can read finance summaries but cannot create expense",
    statusOf(staffExpenseSummary) === 200 && statusOf(staffCashBankSummary) === 200 && statusOf(staffCreateExpense) === 403,
    {
      expenseSummaryStatus: statusOf(staffExpenseSummary),
      cashBankSummaryStatus: statusOf(staffCashBankSummary),
      createExpenseStatus: statusOf(staffCreateExpense),
    },
  );

  const createExpenseCategory = await request("/api/finance/accounts", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL141 Expense Category",
      code: `HAL141-EXP-${randomSuffix()}`,
      type: "expense",
      kind: "general",
      openingBalance: 0,
    }),
  });
  const createCashAccount = await request("/api/finance/accounts", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL141 Cash Account",
      code: `HAL141-CASH-${randomSuffix()}`,
      type: "asset",
      kind: "cash",
      openingBalance: 1000,
    }),
  });
  const createBankAccount = await request("/api/finance/accounts", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      name: "HAL141 Bank Account",
      code: `HAL141-BANK-${randomSuffix()}`,
      type: "asset",
      kind: "bank",
      openingBalance: 500,
    }),
  });

  const expenseCategoryId = createExpenseCategory.body?.account?.id;
  const cashAccountId = createCashAccount.body?.account?.id;
  const bankAccountId = createBankAccount.body?.account?.id;

  add(
    "admin can create cash and bank accounts",
    statusOf(createExpenseCategory) === 201 &&
      statusOf(createCashAccount) === 201 &&
      statusOf(createBankAccount) === 201 &&
      typeof cashAccountId === "string" &&
      typeof bankAccountId === "string",
    {
      expenseCategoryStatus: statusOf(createExpenseCategory),
      cashStatus: statusOf(createCashAccount),
      bankStatus: statusOf(createBankAccount),
    },
  );

  const createdExpense = await request("/api/finance/expenses", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      amount: 125.5,
      categoryAccountId: expenseCategoryId,
      paidFromAccountId: cashAccountId,
      method: "cash",
      reference: "HAL141-EXP-001",
      note: "Verification expense",
    }),
  });

  const expenseId = createdExpense.body?.expense?.id;
  const expenseJournalEntryId = createdExpense.body?.expense?.journalEntryId;

  add("admin can create posted expense", statusOf(createdExpense) === 201 && typeof expenseId === "string", {
    status: statusOf(createdExpense),
  });

  const journalRead = expenseJournalEntryId
    ? await request(`/api/finance/journal-entries/${expenseJournalEntryId}`, { headers: adminAHeaders })
    : null;

  const journalLines = journalRead?.body?.journalEntry?.lines ?? [];
  const debitLine = journalLines.find((line) => Number(line.debit) > 0);
  const creditLine = journalLines.find((line) => Number(line.credit) > 0);

  add(
    "expense creation creates posted journal with debit expense and credit cash/bank",
    !!journalRead &&
      statusOf(journalRead) === 200 &&
      journalRead.body?.journalEntry?.status === "posted" &&
      Number(debitLine?.debit ?? 0) === 125.5 &&
      Number(creditLine?.credit ?? 0) === 125.5,
    {
      status: journalRead ? statusOf(journalRead) : null,
      journalStatus: journalRead?.body?.journalEntry?.status ?? null,
      debit: Number(debitLine?.debit ?? 0),
      credit: Number(creditLine?.credit ?? 0),
    },
  );

  const cashBankAfterExpense = await request("/api/finance/reports/cash-bank-summary", { headers: adminAHeaders });
  const cashRowAfterExpense = cashBankAfterExpense.body?.report?.rows?.find((row) => row.id === cashAccountId);
  add(
    "cash/bank balances update after expense posting",
    statusOf(cashBankAfterExpense) === 200 && Number(cashRowAfterExpense?.currentBalance ?? NaN) === 874.5,
    {
      status: statusOf(cashBankAfterExpense),
      cashBalance: cashRowAfterExpense?.currentBalance,
    },
  );

  const now = new Date();
  const closedPeriodDate = new Date(now.getTime() + 3 * 86400000);
  const todayKey = `${closedPeriodDate.getUTCFullYear()}-${String(closedPeriodDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodStart = new Date(
    Date.UTC(closedPeriodDate.getUTCFullYear(), closedPeriodDate.getUTCMonth(), closedPeriodDate.getUTCDate(), 0, 0, 0),
  ).toISOString();
  const periodEnd = new Date(
    Date.UTC(closedPeriodDate.getUTCFullYear(), closedPeriodDate.getUTCMonth(), closedPeriodDate.getUTCDate(), 23, 59, 59),
  ).toISOString();

  const createPeriod = await request("/api/finance/periods", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      periodKey: `HAL141-${todayKey}-${Math.floor(Math.random() * 10000)}`,
      startDate: periodStart,
      endDate: periodEnd,
    }),
  });
  const periodId = createPeriod.body?.period?.id;
  const closePeriod = periodId
    ? await retryableRequest(`/api/finance/periods/${periodId}/close`, { method: "POST", headers: adminAHeaders })
    : null;

  const blockedExpense = await request("/api/finance/expenses", {
    method: "POST",
    headers: adminAHeaders,
    body: JSON.stringify({
      expenseDate: periodStart,
      amount: 20,
      categoryAccountId: expenseCategoryId,
      paidFromAccountId: cashAccountId,
      method: "cash",
    }),
  });

  add(
    "expense inside closed period is blocked",
    statusOf(createPeriod) === 201 && !!closePeriod && statusOf(closePeriod) === 200 && statusOf(blockedExpense) === 400,
    {
      createPeriodStatus: statusOf(createPeriod),
      closePeriodStatus: closePeriod ? statusOf(closePeriod) : null,
      blockedExpenseStatus: statusOf(blockedExpense),
    },
  );

  const reverseExpense = expenseId
    ? await retryableRequest(`/api/finance/expenses/${expenseId}/reverse`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({
          reversalDate: new Date(now.getTime() + 4 * 86400000).toISOString(),
          reason: "HAL141 reversal check",
        }),
      })
    : null;

  add(
    "expense reversal creates reversing journal and marks expense reversed",
    !!reverseExpense &&
      statusOf(reverseExpense) === 201 &&
      reverseExpense.body?.expense?.status === "reversed" &&
      typeof reverseExpense.body?.expense?.reversalJournalEntryId === "string",
    {
      status: reverseExpense ? statusOf(reverseExpense) : null,
      expenseStatus: reverseExpense?.body?.expense?.status ?? null,
      reversalJournalEntryId: reverseExpense?.body?.expense?.reversalJournalEntryId ?? null,
    },
  );

  const crossTenantRead = expenseId ? await request(`/api/finance/expenses/${expenseId}`, { headers: adminBHeaders }) : null;
  add("cross-company expense read is blocked", !!crossTenantRead && statusOf(crossTenantRead) === 403, {
    status: crossTenantRead ? statusOf(crossTenantRead) : null,
  });

  const productForReceivable = await createProduct(adminAHeaders, "receivable");
  const productForReceivableId = productForReceivable.body?.product?.id;
  const salesOrder = productForReceivableId
    ? await createSalesOrder(adminAHeaders, productForReceivableId, 2)
    : null;
  const salesOrderId = salesOrder?.body?.data?.id;
  const confirmSalesOrder = salesOrderId
    ? await request(`/api/sales-orders/${salesOrderId}/confirm`, { method: "POST", headers: adminAHeaders })
    : null;

  const receivables = await request("/api/finance/receivables", { headers: adminAHeaders });
  const receivableId = receivables.body?.receivables?.find((receivable) => receivable.salesOrderId === salesOrderId)?.id;
  const receivablePayment = receivableId
    ? await retryableRequest(`/api/finance/receivables/${receivableId}/payments`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({
          amount: 20,
          accountId: bankAccountId,
          method: "bank_transfer",
        }),
      })
    : null;

  add(
    "receivable payment with account id records and links account safely",
    !!confirmSalesOrder &&
      statusOf(confirmSalesOrder) === 200 &&
      !!receivablePayment &&
      statusOf(receivablePayment) === 201 &&
      receivablePayment.body?.payment?.accountId === bankAccountId,
    {
      confirmOrderStatus: confirmSalesOrder ? statusOf(confirmSalesOrder) : null,
      paymentStatus: receivablePayment ? statusOf(receivablePayment) : null,
      paymentAccountId: receivablePayment?.body?.payment?.accountId ?? null,
    },
  );

  const productForPayable = await createProduct(adminAHeaders, "payable");
  const productForPayableId = productForPayable.body?.product?.id;
  const vendor = await createVendor(adminAHeaders);
  const vendorId = vendor.body?.vendor?.id;
  const purchaseOrder = vendorId && productForPayableId
    ? await createPurchaseOrder(adminAHeaders, vendorId, productForPayableId, 2)
    : null;
  const purchaseOrderId = purchaseOrder?.body?.purchaseOrder?.id;

  const submitPurchaseOrder = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/submit`, {
        method: "POST",
        headers: adminAHeaders,
      })
    : null;
  const approvePurchaseOrder = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/approve`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ note: "HAL141 payable verification approval" }),
      })
    : null;
  const markOrdered = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}`, {
        method: "PATCH",
        headers: adminAHeaders,
        body: JSON.stringify({ status: "ordered" }),
      })
    : null;
  const receiveOrder = purchaseOrderId
    ? await request(`/api/purchase-orders/${purchaseOrderId}/receive`, {
        method: "POST",
        headers: adminAHeaders,
      })
    : null;

  const payables = await request("/api/finance/payables", { headers: adminAHeaders });
  const payableId = payables.body?.payables?.find((payable) => payable.purchaseOrderId === purchaseOrderId)?.id;
  const payablePayment = payableId
    ? await retryableRequest(`/api/finance/payables/${payableId}/payments`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({
          amount: 30,
          accountId: cashAccountId,
          method: "cash",
        }),
      })
    : null;

  add(
    "payable payment with account id records and links account safely",
    !!submitPurchaseOrder &&
      statusOf(submitPurchaseOrder) === 200 &&
      !!approvePurchaseOrder &&
      statusOf(approvePurchaseOrder) === 200 &&
      !!markOrdered &&
      statusOf(markOrdered) === 200 &&
      !!receiveOrder &&
      statusOf(receiveOrder) === 200 &&
      !!payablePayment &&
      statusOf(payablePayment) === 201 &&
      payablePayment.body?.payment?.accountId === cashAccountId,
    {
      submitStatus: submitPurchaseOrder ? statusOf(submitPurchaseOrder) : null,
      approveStatus: approvePurchaseOrder ? statusOf(approvePurchaseOrder) : null,
      markOrderedStatus: markOrdered ? statusOf(markOrdered) : null,
      receiveStatus: receiveOrder ? statusOf(receiveOrder) : null,
      paymentStatus: payablePayment ? statusOf(payablePayment) : null,
      paymentAccountId: payablePayment?.body?.payment?.accountId ?? null,
    },
  );

  const excessiveReceivablePayment = receivableId
    ? await retryableRequest(`/api/finance/receivables/${receivableId}/payments`, {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ amount: 999999, accountId: bankAccountId, method: "bank_transfer" }),
      })
    : null;

  add("payment over outstanding balance is blocked", !!excessiveReceivablePayment && statusOf(excessiveReceivablePayment) === 400, {
    status: excessiveReceivablePayment ? statusOf(excessiveReceivablePayment) : null,
  });

  const createBExpenseCategory = await request("/api/finance/accounts", {
    method: "POST",
    headers: adminBHeaders,
    body: JSON.stringify({
      name: "HAL141 B Expense",
      code: `HAL141-B-EXP-${randomSuffix()}`,
      type: "expense",
      kind: "general",
      openingBalance: 0,
    }),
  });
  const createBCash = await request("/api/finance/accounts", {
    method: "POST",
    headers: adminBHeaders,
    body: JSON.stringify({
      name: "HAL141 B Cash",
      code: `HAL141-B-CASH-${randomSuffix()}`,
      type: "asset",
      kind: "cash",
      openingBalance: 400,
    }),
  });
  const bExpenseCategoryId = createBExpenseCategory.body?.account?.id;
  const bCashId = createBCash.body?.account?.id;

  const createBExpense = await request("/api/finance/expenses", {
    method: "POST",
    headers: adminBHeaders,
    body: JSON.stringify({
      amount: 40,
      categoryAccountId: bExpenseCategoryId,
      paidFromAccountId: bCashId,
      method: "cash",
      note: "Tenant B expense",
    }),
  });

  const cashBankSummaryA = await request("/api/finance/reports/cash-bank-summary", { headers: adminAHeaders });
  const expenseSummaryA = await request("/api/finance/reports/expense-summary", { headers: adminAHeaders });

  add(
    "cash/bank summary excludes other tenant accounts",
    statusOf(createBCash) === 201 &&
      statusOf(cashBankSummaryA) === 200 &&
      !cashBankSummaryA.body?.report?.rows?.some((row) => row.id === bCashId),
    {
      createTenantBCashStatus: statusOf(createBCash),
      summaryStatus: statusOf(cashBankSummaryA),
      leakedTenantBCash: Boolean(cashBankSummaryA.body?.report?.rows?.some((row) => row.id === bCashId)),
    },
  );

  add(
    "expense summary excludes other tenant expenses",
    statusOf(createBExpense) === 201 &&
      statusOf(expenseSummaryA) === 200 &&
      !expenseSummaryA.body?.report?.recentExpenses?.some((expense) => expense.id === createBExpense.body?.expense?.id),
    {
      createTenantBExpenseStatus: statusOf(createBExpense),
      summaryStatus: statusOf(expenseSummaryA),
      leakedTenantBExpense: Boolean(
        expenseSummaryA.body?.report?.recentExpenses?.some((expense) => expense.id === createBExpense.body?.expense?.id),
      ),
    },
  );

  const safePayloads = [
    createdExpense,
    reverseExpense,
    receivablePayment,
    payablePayment,
    cashBankSummaryA,
    expenseSummaryA,
  ].filter(Boolean);

  add(
    "safe responses expose no password, token, or session fields",
    safePayloads.every((payload) => !hasUnsafeKeys(payload.body)),
    {
      unsafeDetected: safePayloads.some((payload) => hasUnsafeKeys(payload.body)),
    },
  );

  const trialBalance = await request("/api/finance/reports/trial-balance", { headers: adminAHeaders });
  const arAging = await request("/api/finance/reports/ar-aging", { headers: adminAHeaders });
  const apAging = await request("/api/finance/reports/ap-aging", { headers: adminAHeaders });

  add(
    "AR aging, AP aging, and trial balance routes still work",
    statusOf(trialBalance) === 200 && statusOf(arAging) === 200 && statusOf(apAging) === 200,
    {
      trialBalanceStatus: statusOf(trialBalance),
      arAgingStatus: statusOf(arAging),
      apAgingStatus: statusOf(apAging),
    },
  );

  const productForInvoice = await createProduct(adminAHeaders, "invoice");
  const productForInvoiceId = productForInvoice.body?.product?.id;
  const orderForInvoice = productForInvoiceId ? await createSalesOrder(adminAHeaders, productForInvoiceId, 1) : null;
  const orderForInvoiceId = orderForInvoice?.body?.data?.id;
  const confirmForInvoice = orderForInvoiceId
    ? await request(`/api/sales-orders/${orderForInvoiceId}/confirm`, { method: "POST", headers: adminAHeaders })
    : null;
  const invoiceFromOrder = orderForInvoiceId
    ? await request("/api/sales-invoices/from-sales-order", {
        method: "POST",
        headers: adminAHeaders,
        body: JSON.stringify({ salesOrderId: orderForInvoiceId }),
      })
    : null;

  add(
    "sales invoice to receivable flow still works",
    !!confirmForInvoice &&
      statusOf(confirmForInvoice) === 200 &&
      !!invoiceFromOrder &&
      statusOf(invoiceFromOrder) === 201 &&
      typeof invoiceFromOrder.body?.data?.receivableId === "string",
    {
      confirmStatus: confirmForInvoice ? statusOf(confirmForInvoice) : null,
      invoiceStatus: invoiceFromOrder ? statusOf(invoiceFromOrder) : null,
      receivableId: invoiceFromOrder?.body?.data?.receivableId ?? null,
    },
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
