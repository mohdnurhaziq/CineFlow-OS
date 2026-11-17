import { levelAtLeast, type AccessMap } from "@/lib/auth/access";

/**
 * Gear day rates are money, so they follow the same rule as every other price: shown only to
 * people with Invoices View. Without it, Gear & Fleet shows the kit without any rates, and the
 * server never sends them.
 */
export function seesGearRates(access: AccessMap): boolean {
  return levelAtLeast(access.areas.invoices, "VIEW");
}

/** The row as this person may see it: its day rate blanked when they can't see money. */
export function withRate<T extends { dailyRate: number | null }>(row: T, sees: boolean): T {
  return sees ? row : { ...row, dailyRate: null };
}

/** A kit bundle and its items as this person may see them. */
export function bundleWithRates<T extends { dailyRate: number | null; items: Array<{ item: { dailyRate: number | null } }> }>(
  bundle: T,
  sees: boolean
): T {
  if (sees) return bundle;
  return { ...bundle, dailyRate: null, items: bundle.items.map((bi) => ({ ...bi, item: withRate(bi.item, false) })) };
}
