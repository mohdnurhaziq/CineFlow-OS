"use client";

import { useState } from "react";
import { CheckSquare, Square, Sparkles } from "lucide-react";

export function InteractiveTeasers() {
  // --- Demo: Proposal Recalculator State ---
  const basePackagePrice = 2500;
  const [addOns, setAddOns] = useState([
    { id: "drone", name: "4K Drone Aerial Coverage", price: 450, selected: true },
    { id: "ssd", name: "RAW Footage 2TB NVMe SSD", price: 300, selected: false },
    { id: "shooter", name: "2nd Cinematographer / Camera B", price: 600, selected: true },
  ]);

  const toggleAddOn = (id: string) => {
    setAddOns((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const addOnTotal = addOns.filter((a) => a.selected).reduce((sum, a) => sum + a.price, 0);
  const subtotal = basePackagePrice + addOnTotal;
  const deposit50 = subtotal * 0.5;
  const balance50 = subtotal * 0.5;

  return (
    <section id="demo" className="py-20 border-t border-zinc-800/60 bg-[#0c0c0f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-400">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>HANDS-ON MICRO-INTERACTIONS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Experience CineFlow OS in Action
          </h2>
          <p className="text-zinc-400 text-base">
            Try the live proposal calculator below: toggle add-ons and watch the totals update.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Interactive Widget: Dynamic Proposal Recalculator */}
          <div className="p-6 sm:p-8 rounded-2xl border border-zinc-800 bg-[#121215] flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  LIVE DEMO // PROPOSALS &amp; BILLING
                </span>
                <span className="text-xs font-mono text-zinc-400">Proposal #PR-2026</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Real-Time Proposal &amp; 50% Deposit</h3>
              <p className="text-xs text-zinc-400">
                Toggle production add-ons. Subtotals and 50% milestone deposits update immediately with zero page reload.
              </p>
            </div>

            {/* Add-ons List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
                <span className="text-zinc-300 font-medium">Base Package: Cinematic Brand Story</span>
                <span className="font-mono font-bold text-white tabular-nums">${basePackagePrice.toLocaleString()}</span>
              </div>

              {addOns.map((addOn) => (
                <button
                  key={addOn.id}
                  onClick={() => toggleAddOn(addOn.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all active:scale-[0.99] text-left ${
                    addOn.selected
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-[#16161b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {addOn.selected ? (
                      <CheckSquare className="size-4 text-amber-400" />
                    ) : (
                      <Square className="size-4 text-zinc-500" />
                    )}
                    <span>{addOn.name}</span>
                  </div>
                  <span className="font-mono font-bold tabular-nums">+${addOn.price}</span>
                </button>
              ))}
            </div>

            {/* Recalculated Summary Card */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-[#09090b] grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400">Subtotal</span>
                <div className="font-mono text-base sm:text-lg font-bold text-white tabular-nums">
                  ${subtotal.toLocaleString()}
                </div>
              </div>

              <div className="border-x border-zinc-800 px-2">
                <span className="text-[10px] font-mono uppercase text-amber-400">50% Retainer</span>
                <div className="font-mono text-base sm:text-lg font-bold text-amber-400 tabular-nums">
                  ${deposit50.toLocaleString()}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400">50% Paywall</span>
                <div className="font-mono text-base sm:text-lg font-bold text-zinc-300 tabular-nums">
                  ${balance50.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
