/**
 * Minimal CSV writer for exports opened in Excel / Google Sheets. Client-safe.
 *
 * Cells are quoted when needed (RFC 4180). Text a spreadsheet would run as a formula
 * (starting with =, +, -, @, tab or CR) is prefixed with an apostrophe, so a client named
 * "=HYPERLINK(...)" cannot inject a formula into the studio's spreadsheet. Phone numbers such
 * as "+60 12-345 6789" are left alone since they cannot form a formula.
 */

const PHONE_LIKE = /^[+-][\d\s().-]*$/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !PHONE_LIKE.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
