"use client";

import { Check, Plus, Sparkles } from "lucide-react";

export interface AddOnItem {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  quantity?: number;
  isSelected?: boolean;
}

interface AddonsSelectorProps {
  addOns: AddOnItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  currency: string;
  isReadOnly?: boolean;
}

export function AddonsSelector({
  addOns,
  selectedIds,
  onToggle,
  currency,
  isReadOnly = false,
}: AddonsSelectorProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
            CUSTOMIZE PRODUCTION SCOPE
          </span>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Optional Production Upgrades &amp; Line Items
          </h3>
        </div>
        <span className="text-xs font-mono text-zinc-400">
          {selectedIds.size} of {addOns.length} selected
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {addOns.map((addon) => {
          const isSelected = selectedIds.has(addon.id);

          return (
            <div
              key={addon.id}
              onClick={() => {
                if (!isReadOnly) onToggle(addon.id);
              }}
              className={`p-4 rounded-xl border text-left transition-all ${
                isReadOnly ? "cursor-default" : "cursor-pointer active:scale-[0.99]"
              } ${
                isSelected
                  ? "bg-gradient-to-r from-amber-950/20 via-[#15151a] to-[#15151a] border-amber-500/60 shadow-lg shadow-amber-500/5"
                  : "bg-[#121215] border-zinc-800 hover:border-zinc-700 hover:bg-[#15151a]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">{addon.name}</span>
                    {isSelected && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        Added
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    {addon.description}
                  </p>
                </div>

                {/* Checkbox indicator & Price */}
                <div className="shrink-0 text-right space-y-1.5">
                  <div className="font-mono text-sm font-bold text-white tabular-nums">
                    +{currencySymbol}
                    {addon.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>

                  <div className="flex justify-end">
                    <div
                      className={`size-6 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-amber-500 border-amber-500 text-black shadow-sm"
                          : "border-zinc-700 bg-zinc-900 text-transparent"
                      }`}
                    >
                      <Check className="size-3.5 stroke-[3]" />
                    </div>
                  </div>
                </div>
              </div>

              {addon.unit && addon.unit !== "fixed" && (
                <div className="mt-2 pt-2 border-t border-zinc-800/80 text-[10px] font-mono text-zinc-500">
                  Billing Unit: {addon.unit.replace(/_/g, " ").toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
