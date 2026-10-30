"use client";

import Link from "next/link";
import { Check, Calendar, Clock, Sparkles } from "lucide-react";

export interface ServicePackageItem {
  id: string;
  category: string;
  name: string;
  discipline: string;
  price: number;
  depositPrice: number;
  description: string;
  deliverables: string;
  turnaround: string;
  isFeatured: boolean;
}

interface PackageGridProps {
  packages: ServicePackageItem[];
  tenantSlug: string;
  currency: string;
  brandColor?: string | null;
}

export function PackageGrid({
  packages,
  tenantSlug,
  currency,
  brandColor,
}: PackageGridProps) {
  if (packages.length === 0) {
    return null;
  }

  const currencySymbol = currency === "MYR" ? "RM " : "$";

  return (
    <div className="space-y-8 pt-12 border-t border-zinc-800">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-400">
          <Sparkles className="size-3.5 text-amber-400" />
          <span>SESSION PACKAGES &amp; MILESTONE INVESTMENT</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Transparent Creative Production Packages
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400">
          50% deposit locks your cinema calendar slot; 50% balance unlocks high-res masters in your private delivery vault.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => {
          const deliverablePoints = pkg.deliverables
            .split(/[,;.\n]/)
            .map((s) => s.trim())
            .filter(Boolean);

          return (
            <div
              key={pkg.id}
              className={`p-6 sm:p-7 rounded-2xl border flex flex-col justify-between transition-all relative ${
                pkg.isFeatured
                  ? "bg-[#15151a] border-amber-500/50 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/30"
                  : "bg-[#121215] border-zinc-800 hover:border-zinc-700"
              }`}
            >
              {pkg.isFeatured && (
                <div className="absolute -top-3 left-6 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold tracking-tight shadow-md">
                  FEATURED SESSION
                </div>
              )}

              <div className="space-y-6">
                {/* Header */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    {pkg.discipline} // {pkg.category}
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-tight">{pkg.name}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>
                </div>

                {/* Price and Deposit Callout */}
                <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#16161b] space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-400">Total Investment</span>
                    <span className="font-mono text-2xl font-black text-white tabular-nums">
                      {currencySymbol}
                      {pkg.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-800/80">
                    <span className="text-amber-400">50% Retainer Deposit:</span>
                    <span className="text-amber-400 font-bold tabular-nums">
                      {currencySymbol}
                      {pkg.depositPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Turnaround Badge */}
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                  <Clock className="size-3.5 text-zinc-500" />
                  <span>Turnaround Delivery: {pkg.turnaround}</span>
                </div>

                {/* Deliverables Checklist */}
                <div className="space-y-2 border-t border-zinc-800/80 pt-4">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    Included Deliverables:
                  </span>
                  <ul className="space-y-2">
                    {deliverablePoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                        <Check className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Book CTA */}
              <div className="pt-6">
                <Link
                  href={`/${tenantSlug}/book?category=${pkg.category}&packageId=${pkg.id}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold text-black transition-all active:scale-[0.98] shadow-md"
                  style={{
                    backgroundColor: brandColor || "#f59e0b",
                    boxShadow: `0 4px 14px ${brandColor || "#f59e0b"}25`,
                  }}
                >
                  <Calendar className="size-4" />
                  Book This Session
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
