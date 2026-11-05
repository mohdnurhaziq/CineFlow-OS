"use client";

import { Check } from "lucide-react";
import { sameCategory } from "@/lib/bookings/pricing-shared";

export interface BookingPackageOption {
  id: string;
  name: string;
  category: string;
  price: number;
  depositPrice: number;
  description?: string | null;
  deliverables?: string | null;
}

/** Packages offered for a slot's category, cheapest first. */
export function packagesFor(packages: BookingPackageOption[], category: string): BookingPackageOption[] {
  return packages.filter((p) => sameCategory(p.category, category)).sort((a, b) => a.price - b.price);
}

/** "$1,900.00" / "RM 1,900.00". */
export function formatMoney(currency: string, amount: number): string {
  const symbol = currency === "MYR" ? "RM " : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PackagePickerProps {
  packages: BookingPackageOption[];
  value: string | null;
  onChange: (packageId: string | null) => void;
  currency: string;
  /** Staff may book without a package (priced by the slot instead). */
  allowNone?: boolean;
  label?: string;
}

export function PackagePicker({ packages, value, onChange, currency, allowNone = false, label = "Choose your package" }: PackagePickerProps) {
  if (packages.length === 0) return null;

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
        {label}
        {!allowNone && <span className="text-amber-400"> *</span>}
      </legend>
      <div className="space-y-2">
        {packages.map((p) => {
          const selected = value === p.id;
          const balance = Math.max(0, Math.round((p.price - p.depositPrice) * 100) / 100);
          return (
            <label
              key={p.id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selected ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-[#16161b] hover:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="booking-package"
                value={p.id}
                checked={selected}
                onChange={() => onChange(p.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`mt-0.5 size-4 shrink-0 rounded-full border flex items-center justify-center ${
                  selected ? "border-amber-500 bg-amber-500 text-black" : "border-zinc-600"
                }`}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-white">{p.name}</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-white">{formatMoney(currency, p.price)}</span>
                </span>
                {p.description && <span className="block text-[11px] text-zinc-400">{p.description}</span>}
                {p.deliverables && <span className="block text-[11px] text-zinc-500">{p.deliverables}</span>}
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                  <span className="text-amber-400">Deposit now {formatMoney(currency, p.depositPrice)}</span>
                  {balance > 0 && <span className="text-zinc-400">Balance after shoot {formatMoney(currency, balance)}</span>}
                </span>
              </span>
            </label>
          );
        })}
        {allowNone && (
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              value === null ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-[#16161b] hover:border-zinc-700"
            }`}
          >
            <input type="radio" name="booking-package" checked={value === null} onChange={() => onChange(null)} className="sr-only" />
            <span
              aria-hidden
              className={`size-4 shrink-0 rounded-full border flex items-center justify-center ${
                value === null ? "border-amber-500 bg-amber-500 text-black" : "border-zinc-600"
              }`}
            >
              {value === null && <Check className="size-3" />}
            </span>
            <span className="text-xs text-zinc-300">No package (use the slot&apos;s deposit; no balance invoice)</span>
          </label>
        )}
      </div>
    </fieldset>
  );
}
