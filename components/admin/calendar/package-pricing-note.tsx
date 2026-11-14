import { Package } from "lucide-react";
import type { PackageRange } from "@/lib/bookings/package-range";

/** Shown in the slot dialogs instead of fee/deposit fields when the category is priced by packages. */
export function PackagePricingNote({ range, currency }: { range: PackageRange; currency: string }) {
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const priceText =
    range.minPrice === range.maxPrice ? money(range.minPrice) : `${money(range.minPrice)} – ${money(range.maxPrice)}`;

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
      <Package className="size-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-xs leading-relaxed">
        <p className="text-zinc-200">
          Priced by your {range.count === 1 ? "package" : `${range.count} packages`}: {priceText}
        </p>
        <p className="text-zinc-500 mt-0.5">
          {range.count === 1 ? "Clients book this package" : "Clients pick a package when they book"}. Its price and
          deposit apply, so there&apos;s no slot fee to set. Change prices in Services.
        </p>
      </div>
    </div>
  );
}
