/**
 * Customer-facing money: "RM 1,900.00" for MYR, "$1,900.00" for USD, "EUR 1,900.00" otherwise.
 * Client-safe (no server imports). Matches how prices are written across the studio pages.
 */
/** Short currency label for prices shown as "<symbol> 120.00": RM, $, or the ISO code (SGD, EUR…). */
export function currencySymbol(currency: string): string {
  return currency === "MYR" ? "RM" : currency === "USD" ? "$" : currency;
}

export function formatMoney(currency: string, amount: number): string {
  const symbol = currency === "MYR" ? "RM " : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
