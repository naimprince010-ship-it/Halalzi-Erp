/**
 * Minimal, dependency-free CSV helpers for export endpoints.
 *
 * Security notes:
 * - Fields are escaped per RFC 4180: any value containing a comma, double
 *   quote, or newline is wrapped in double quotes and internal quotes are
 *   doubled.
 * - CSV/formula injection is neutralized: values whose first character could be
 *   interpreted as a formula by spreadsheet software (=, +, -, @, tab, CR) are
 *   prefixed with a single quote so they render as plain text.
 */

export type CsvColumn<TRow> = {
  /** Header label written to the first CSV row. */
  header: string;
  /** Extracts the raw cell value for a given row. */
  value: (row: TRow) => unknown;
};

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Converts an arbitrary cell value into a plain string for CSV output. */
function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  // Numbers, bigint, Prisma.Decimal, and other objects with a sane toString.
  return String(value);
}

/** Neutralizes spreadsheet formula injection for a single field. */
function neutralizeInjection(field: string): string {
  if (field.length === 0) {
    return field;
  }

  return FORMULA_TRIGGERS.has(field[0]) ? `'${field}` : field;
}

/** Escapes a single field per RFC 4180 after injection neutralization. */
export function escapeCsvField(value: unknown): string {
  const raw = neutralizeInjection(stringifyCell(value));

  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
}

/** Builds a full CSV document from column definitions and rows. */
export function toCsv<TRow>(columns: CsvColumn<TRow>[], rows: TRow[]): string {
  const headerLine = columns.map((column) => escapeCsvField(column.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((column) => escapeCsvField(column.value(row))).join(","),
  );

  // CRLF line endings are the RFC 4180 standard and the most compatible.
  return [headerLine, ...dataLines].join("\r\n");
}

/** Builds an ISO date suffix (YYYY-MM-DD) for export filenames. */
export function exportDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Wraps CSV text in a downloadable Response with safe headers.
 * A UTF-8 BOM is prepended so Excel renders non-ASCII characters correctly.
 */
export function csvResponse(csv: string, moduleName: string): Response {
  const filename = `${moduleName}-export-${exportDateStamp()}.csv`;
  const body = `\uFEFF${csv}`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
