"use client";

import { Shield, Sparkles, Clock, Lock } from "lucide-react";

interface PricingBreakdownProps {
  basePrice: number;
  addOnsTotal: number;
  currency: string;
  depositPercentage?: number;
}

export function PricingBreakdown({
  basePrice,
  addOnsTotal,
  currency,
  depositPercentage = 50.0,
}: PricingBreakdownProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";
  const subtotal = Math.round((basePrice + addOnsTotal) * 100) / 100;
  const depositAmount = Math.round(((subtotal * depositPercentage) / 100) * 100) / 100;
  const finalBalance = Math.round((subtotal - depositAmount) * 100) / 100;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#121215] p-6 space-y-6 shadow-xl">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="space-y-0.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            REAL-TIME FINANCIAL RECALCULATION
          </span>
          <h4 className="text-base font-bold text-white tracking-tight">
            Production Investment &amp; Milestone Schedule
          </h4>
        </div>

        <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          50 / 50 Split
        </span>
      </div>

      {/* Itemized Calculation */}
      <div className="space-y-3 text-xs font-mono">
        <div className="flex justify-between items-center text-zinc-300">
          <span className="font-sans">Base Production Package:</span>
          <span className="tabular-nums font-bold text-white">
            {currencySymbol}
            {basePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between items-center text-zinc-300">
          <span className="font-sans">Selected Production Add-Ons:</span>
          <span className="tabular-nums font-bold text-amber-400">
            +{currencySymbol}
            {addOnsTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="pt-3 border-t border-zinc-800/80 flex justify-between items-center text-sm">
          <span className="font-sans font-bold text-white">Gross Production Subtotal:</span>
          <span className="tabular-nums font-black text-white text-base">
            {currencySymbol}
            {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* 2-Tier Milestone Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Milestone 1: 50% Deposit Due Now */}
        <div className="p-4 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/20 via-[#16161c] to-[#121215] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-[10px] uppercase font-bold text-amber-400">
              Milestone 1 // Signing
            </span>
            <Clock className="size-3.5 text-amber-400" />
          </div>

          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {currencySymbol}
            {depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>

          <p className="text-[11px] text-zinc-400 leading-tight font-sans">
            50% Retainer Milestone due upon contract execution to reserve production crew and shoot dates.
          </p>
        </div>

        {/* Milestone 2: 50% Balance on Delivery */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#16161b] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-[10px] uppercase font-bold text-zinc-400">
              Milestone 2 // Wrap
            </span>
            <Lock className="size-3.5 text-zinc-500" />
          </div>

          <div className="text-2xl font-bold font-mono tabular-nums text-zinc-300">
            {currencySymbol}
            {finalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>

          <p className="text-[11px] text-zinc-400 leading-tight font-sans">
            50% Final Balance due prior to master 4K ProRes &amp; high-res ZIP unlock in client delivery vault.
          </p>
        </div>
      </div>
    </div>
  );
}
