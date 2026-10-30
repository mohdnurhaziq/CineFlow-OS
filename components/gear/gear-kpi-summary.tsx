"use client";

import { Layers, DollarSign, Camera, Wrench } from "lucide-react";

interface GearKpiSummaryProps {
  totalItems: number;
  totalDailyValue: number;
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Total Fleet Assets */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Fleet Registry</span>
          <Layers className="size-4 text-amber-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
          {totalItems}
        </div>
        <div className="text-[11px] text-zinc-500 mt-1">Serialized equipment assets</div>
      </div>

      {/* Daily Fleet Valuation */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-2">
          <span>Daily Rental Valuation</span>
          <DollarSign className="size-4 text-emerald-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
          {currency} {totalDailyValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className="text-[11px] text-zinc-500 mt-1">Aggregate daily rate pool</div>
      </div>

      {/* On Shoot Active */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/10 p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between text-indigo-300 text-xs font-mono mb-2">
          <span>Dispatched On Shoot</span>
          <Camera className="size-4 text-indigo-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono tracking-tight">
          {onShootCount}
        </div>
        <div className="text-[11px] text-indigo-300/70 mt-1">Active on-location checkouts</div>
      </div>

      {/* Maintenance Needed */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-xl ${
        maintenanceCount > 0
          ? "border-amber-500/30 bg-amber-950/10"
          : "border-zinc-800 bg-[#0d0d10]"
      }`}>
        <div className="flex items-center justify-between text-xs font-mono mb-2 text-zinc-400">
          <span className={maintenanceCount > 0 ? "text-amber-300" : ""}>In Maintenance</span>
          <Wrench className={`size-4 ${maintenanceCount > 0 ? "text-amber-400" : "text-zinc-500"}`} />
        </div>
        <div className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
          maintenanceCount > 0 ? "text-amber-400" : "text-white"
        }`}>
          {maintenanceCount}
        </div>
        <div className="text-[11px] text-zinc-500 mt-1">Flagged / Bench servicing</div>
      </div>
    </div>
  );
}
