/**
 * The one way money is written, on screens, in emails and in PDFs: "RM 1,900.00" for MYR,
 * "$1,900.00" for USD, "EUR 1,900.00" otherwise.
 * Client-safe (no server imports). Matches how prices are written across the studio pages.
 */
/** Short currency label for prices shown as "<symbol> 120.00": RM, $, or the ISO code (SGD, EUR…). */
export function currencySymbol(currency: string): string {
  return currency === "MYR" ? "RM" : currency === "USD" ? "$" : currency;
}

export function formatMoney(currency: string, amount: number): string {
  // Takes the code ("MYR") or the symbol some screens are handed ("RM").
  const prefix = currency === "MYR" || currency === "RM" ? "RM " : currency === "USD" || currency === "$" ? "$" : `${currency} `;
  const cents = Math.round(amount * 100) / 100;
  const digits = Math.abs(cents).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "-" : ""}${prefix}${digits}`;
}
