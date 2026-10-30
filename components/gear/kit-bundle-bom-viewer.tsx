"use client";

import { X, CheckCircle2, AlertTriangle, Package, Check, Clock } from "lucide-react";
import type { KitBundleRow } from "./kit-bundle-dialog";

interface KitBundleBomViewerProps {
  bundle: KitBundleRow | null;
  currency: string;
  onClose: () => void;
}

export function KitBundleBomViewer({
  bundle,
  currency,
  onClose,
}: KitBundleBomViewerProps) {
  if (!bundle) return null;

  // Determine readiness
  const totalItems = bundle.items.length;
  const availableItems = bundle.items.filter((bi) => bi.item.status === "AVAILABLE").length;
  const isReady = availableItems === totalItems && totalItems > 0;

  const aggregateValuation = bundle.items.reduce(
    (sum, bi) => sum + (bi.item.dailyRate || 0) * bi.quantity,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0d0d10] p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {bundle.discipline}
              </span>
              {isReady ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="size-3" />
                  <span>100% READY TO DISPATCH</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  <span>PARTIAL / CONFLICT DETECTED</span>
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Package className="size-5 text-amber-400" />
              <span>{bundle.name}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">{bundle.description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Pricing Summary */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block">Package Daily Rate:</span>
            <span className="text-sm font-bold text-emerald-400">
              {currency} {bundle.dailyRate || aggregateValuation} / day
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Readiness Ratio:</span>
            <span className="text-sm font-bold text-white">
              {availableItems} / {totalItems} constituent items available
            </span>
          </div>
        </div>

        {/* Constituent BOM Items Table */}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
            Bill of Materials (BOM) Line Items
          </div>

          <div className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
            {bundle.items.map((bItem) => {
              const item = bItem.item;
              const isItemAvail = item.status === "AVAILABLE";

              return (
                <div
                  key={bItem.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>{item.name}</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        x{bItem.quantity}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      SKU: {item.sku} • {item.category} • Condition: {item.condition}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                        isItemAvail
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                      }`}
                    >
                      {isItemAvail ? (
                        <>
                          <Check className="size-3" />
                          <span>AVAILABLE</span>
                        </>
                      ) : (
                        <>
                          <Clock className="size-3" />
                          <span>{item.status}</span>
                        </>
                      )}
                    </span>
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {currency} {(item.dailyRate || 0) * bItem.quantity} / day
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono transition-colors"
          >
            Close BOM Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
