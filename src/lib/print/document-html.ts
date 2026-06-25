type DocumentLine = {
  sku: string;
  name: string;
  quantity: number;
  unitAmount: number | string;
  lineTotal: number | string;
};

type DocumentMeta = {
  label: string;
  value: string | null | undefined;
};

type PrintableDocument = {
  title: string;
  documentNumber: string;
  companyName: string;
  partyLabel: string;
  partyName: string;
  partyContact?: string | null;
  partyEmail?: string | null;
  partyAddress?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  notes?: string | null;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  unitAmountLabel: string;
  lines: DocumentLine[];
  meta?: DocumentMeta[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return escapeHtml(String(value));
}

function money(value: number | string | null | undefined) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "-";
  }

  return escapeHtml(
    amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
}

function date(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return escapeHtml(
    parsed.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
}

function renderMeta(meta: DocumentMeta[] | undefined) {
  const visibleMeta = (meta ?? []).filter((item) => item.value);

  if (visibleMeta.length === 0) {
    return "";
  }

  return `
    <section class="meta-grid">
      ${visibleMeta.map((item) => `<div><span>${text(item.label)}</span><strong>${text(item.value)}</strong></div>`).join("")}
    </section>
  `;
}

export function renderPrintableDocument(document: PrintableDocument) {
  const rows = document.lines
    .map(
      (line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${text(line.name)}</strong>
            <span>${text(line.sku)}</span>
          </td>
          <td class="number">${line.quantity}</td>
          <td class="number">${money(line.unitAmount)}</td>
          <td class="number">${money(line.lineTotal)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${text(document.title)} ${text(document.documentNumber)}</title>
  <style>
    :root {
      color: #172033;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    }

    body {
      background: #f6f8fb;
      margin: 0;
      padding: 32px;
    }

    .sheet {
      background: #fff;
      border: 1px solid #d8e0ea;
      border-radius: 8px;
      margin: 0 auto;
      max-width: 920px;
      padding: 40px;
    }

    header {
      align-items: flex-start;
      border-bottom: 2px solid #172033;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 24px;
    }

    h1 {
      font-size: 28px;
      margin: 0 0 6px;
    }

    h2 {
      font-size: 16px;
      margin: 28px 0 10px;
    }

    p {
      margin: 4px 0;
    }

    .muted,
    span {
      color: #5c677a;
    }

    .document-number {
      font-size: 18px;
      text-align: right;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
    }

    .meta-grid div,
    .party-box,
    .notes-box {
      border: 1px solid #d8e0ea;
      border-radius: 6px;
      padding: 12px;
    }

    .meta-grid span,
    .party-box span {
      display: block;
      font-size: 12px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    table {
      border-collapse: collapse;
      margin-top: 12px;
      width: 100%;
    }

    th,
    td {
      border-bottom: 1px solid #d8e0ea;
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f1f4f8;
      font-size: 12px;
      text-transform: uppercase;
    }

    td span {
      display: block;
      font-size: 12px;
      margin-top: 3px;
    }

    .number {
      text-align: right;
      white-space: nowrap;
    }

    .totals {
      margin-left: auto;
      margin-top: 20px;
      max-width: 320px;
    }

    .totals div {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
    }

    .totals .grand-total {
      border-top: 2px solid #172033;
      font-size: 18px;
      font-weight: 700;
      margin-top: 6px;
      padding-top: 12px;
    }

    .print-actions {
      margin: 0 auto 16px;
      max-width: 920px;
      text-align: right;
    }

    button {
      background: #145f9f;
      border: 0;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-weight: 700;
      min-height: 40px;
      padding: 0 16px;
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }

      .sheet {
        border: 0;
        border-radius: 0;
        max-width: none;
        padding: 0;
      }

      .print-actions {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <main class="sheet">
    <header>
      <div>
        <h1>${text(document.title)}</h1>
        <p class="muted">${text(document.companyName)}</p>
      </div>
      <div class="document-number">
        <span>Document number</span>
        <strong>${text(document.documentNumber)}</strong>
      </div>
    </header>

    <section class="meta-grid">
      <div><span>Status</span><strong>${text(document.status)}</strong></div>
      <div><span>Created</span><strong>${date(document.createdAt)}</strong></div>
      <div><span>Updated</span><strong>${date(document.updatedAt)}</strong></div>
      <div><span>Total</span><strong>${money(document.totalAmount)}</strong></div>
    </section>

    ${renderMeta(document.meta)}

    <h2>${text(document.partyLabel)}</h2>
    <section class="party-box">
      <span>Name</span>
      <strong>${text(document.partyName)}</strong>
      <p>${text(document.partyContact)}</p>
      <p>${text(document.partyEmail)}</p>
      <p>${text(document.partyAddress)}</p>
    </section>

    <h2>Line Items</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th class="number">Qty</th>
          <th class="number">${text(document.unitAmountLabel)}</th>
          <th class="number">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="totals" aria-label="Document totals">
      <div><span>Subtotal</span><strong>${money(document.subtotal)}</strong></div>
      <div><span>Discount</span><strong>${money(document.discountAmount)}</strong></div>
      <div class="grand-total"><span>Total</span><strong>${money(document.totalAmount)}</strong></div>
    </section>

    <h2>Notes</h2>
    <section class="notes-box">${text(document.notes)}</section>
  </main>
</body>
</html>`;
}
