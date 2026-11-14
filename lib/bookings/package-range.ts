import { sameCategory } from "@/lib/bookings/pricing-shared";

/**
 * Price range of the service packages offered for a slot category. When a category has packages,
 * the client picks one at booking and it sets the price and deposit (see resolveBookingPricing),
 * so the slot dialogs show this range instead of asking for a slot fee. Client-safe.
 */
export interface PackageRange {
  count: number;
  minPrice: number;
  maxPrice: number;
  /** Lowest deposit among the packages: what a slot priced by packages stores as its deposit. */
  minDeposit: number;
}

export function packageRangeFor(
  packages: { category: string; price: number; depositPrice: number }[],
  category: string,
): PackageRange | null {
  const matching = packages.filter((p) => sameCategory(p.category, category));
  if (matching.length === 0) return null;
  const prices = matching.map((p) => p.price);
  return {
    count: matching.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minDeposit: Math.min(...matching.map((p) => p.depositPrice)),
  };
}
