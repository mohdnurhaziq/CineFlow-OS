/**
 * Customer-facing money: "RM 1,900.00" for MYR, "$1,900.00" for USD, "EUR 1,900.00" otherwise.
 * Client-safe (no server imports). Matches how prices are written across the studio pages.
 */
export function formatMoney(currency: string, amount: number): string {
  const symbol = currency === "MYR" ? "RM " : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
