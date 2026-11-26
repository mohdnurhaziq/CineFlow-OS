"use client";

import { Layers, DollarSign, Camera, Wrench } from "lucide-react";
import { formatMoney } from "@/lib/money";

interface GearKpiSummaryProps {
  totalItems: number;
  /** All items at their day rate; null when this person can't see money (the card is left out). */
  totalDailyValue: number | null;
  onShootCount: number;
  maintenanceCount: number;
  currency: string;
}

export function GearKpiSummary({
  totalItems,
  totalDailyValue,
  onShootCount,
  maintenanceCount,
  currency,
}: GearKpiSummaryProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${totalDailyValue === null ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {/* Total Fleet Assets */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Items</span>
          <Layers className="size-4 text-amber-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
          {totalItems}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">Pieces of equipment</div>
      </div>

      {/* Daily Fleet Valuation */}
      {totalDailyValue !== null && (
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Daily rental value</span>
          <DollarSign className="size-4 text-emerald-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
          {formatMoney(currency, totalDailyValue)}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">All items at their day rate</div>
      </div>
      )}

      {/* On Shoot Active */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/10 p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-indigo-300 text-xs font-mono mb-2">
          <span>On a shoot</span>
          <Camera className="size-4 text-indigo-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono tracking-tight">
          {onShootCount}
        </div>
        <div className="text-[11px] text-indigo-300/70 mt-1">Checked out right now</div>
      </div>

      {/* Maintenance Needed */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-xl ${totalDailyValue === null ? "col-span-2 lg:col-span-1" : ""} ${
        maintenanceCount > 0
          ? "border-amber-500/30 bg-amber-950/10"
          : "border-zinc-800 bg-[#0d0d10]"
      }`}>
        <div className="flex items-center justify-between text-xs font-mono mb-2 text-zinc-400">
          <span className={maintenanceCount > 0 ? "text-amber-300" : ""}>In Maintenance</span>
          <Wrench className={`size-4 ${maintenanceCount > 0 ? "text-amber-400" : "text-zinc-400"}`} />
        </div>
        <div className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
          maintenanceCount > 0 ? "text-amber-400" : "text-white"
        }`}>
          {maintenanceCount}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">Flagged or being repaired</div>
      </div>
    </div>
  );
}
