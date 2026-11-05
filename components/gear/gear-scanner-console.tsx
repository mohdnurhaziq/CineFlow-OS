"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  Scan,
  Search,
  X,
  Camera,
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { conditionLabel, disciplineLabel } from "@/lib/labels";
import { quarantineGearItem, releaseGearFromMaintenance } from "@/lib/actions/gear";
import { toast } from "sonner";
import type { InventoryItemRow } from "./gear-item-dialog";
import type { ReservationWithDetails } from "./inspection-dialog";

interface GearScannerConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  items: InventoryItemRow[];
  reservations: ReservationWithDetails[];
  onOpenCheckOut: (res: ReservationWithDetails) => void;
  onOpenCheckIn: (res: ReservationWithDetails) => void;
  onItemUpdated?: () => void;
}

export function GearScannerConsole({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  items,
  reservations,
  onOpenCheckOut,
  onOpenCheckIn,
  onItemUpdated,
}: GearScannerConsoleProps) {
  const dialog = useDialog(isOpen, onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanCode, setScanCode] = useState("");
  const [matchedItem, setMatchedItem] = useState<InventoryItemRow | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setScanCode("");
      setMatchedItem(null);
    }
  }, [isOpen]);

  // Find item by barcode / SKU / serial
  const handleSearch = (term: string) => {
    const cleaned = term.trim().toLowerCase();
    if (!cleaned) {
      setMatchedItem(null);
      return;
    }

    const found = items.find(
      (i) =>
        i.sku.toLowerCase() === cleaned ||
        i.name.toLowerCase().includes(cleaned) ||
        (i.serialNumber && i.serialNumber.toLowerCase() === cleaned)
    );

    setMatchedItem(found || null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch(scanCode);
    }
  };

  if (!isOpen) return null;

  // Find relevant active reservation for this matched item
  const activeRes = matchedItem
    ? reservations.find(
        (r) =>
          r.itemId === matchedItem.id &&
          (r.status === "CHECKED_OUT" || r.status === "RESERVED")
      )
    : null;

  const handleQuarantine = (condition: "MAINTENANCE_NEEDED" | "DAMAGED") => {
    if (!matchedItem) return;
    startTransition(async () => {
      try {
        const res = await quarantineGearItem({
          itemId: matchedItem.id,
          tenantId,
          tenantSlug,
          condition,
        });
        if (!res.success) {
          toast.error(res.message || "Failed to quarantine item.");
          return;
        }
        toast.warning(res.message);
        setMatchedItem((prev) => (prev ? { ...prev, status: "MAINTENANCE", condition } : null));
        onItemUpdated?.();
      } catch (err: any) {
        toast.error(err.message || "Quarantine error.");
      }
    });
  };

  const handleReturnToFleet = () => {
    if (!matchedItem) return;
    startTransition(async () => {
      try {
        const res = await releaseGearFromMaintenance({
          itemId: matchedItem.id,
          tenantId,
          tenantSlug,
          condition: "EXCELLENT",
        });
        if (!res.success) {
          toast.error(res.message || "Failed to release item.");
          return;
        }
        toast.success(res.message);
        setMatchedItem((prev) => (prev ? { ...prev, status: "AVAILABLE", condition: "EXCELLENT" } : null));
        onItemUpdated?.();
      } catch (err: any) {
        toast.error(err.message || "Release error.");
      }
    });
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        {...dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl my-8 rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-2xl text-zinc-100 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Scan className="size-4" />
            </div>
            <div>
              <h3 id="scanner-dialog-title" className="text-base font-bold text-white tracking-tight">
                Scan Asset / SKU Quick Console
              </h3>
              <p className="text-xs text-zinc-400">
                Type or scan hardware barcode for instant check-out, return, or maintenance quarantine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Barcode Input */}
        <div className="space-y-2">
          <div className="relative">
            <Scan className="size-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={scanCode}
              onChange={(e) => {
                setScanCode(e.target.value);
                handleSearch(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Scan barcode or type SKU (e.g. CAM-001)..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono tracking-wider shadow-inner"
            />
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Compatible with handheld USB/Bluetooth laser barcode scanners and keyboard entry.
          </p>
        </div>

        {/* Scan Results / Matched Card */}
        {matchedItem ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    {matchedItem.sku}
                  </span>
                  <span className="text-xs font-medium text-zinc-400">
                    {matchedItem.category} • {disciplineLabel(matchedItem.discipline)}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white mt-1.5">{matchedItem.name}</h4>
                {matchedItem.serialNumber && (
                  <p className="text-xs font-mono text-zinc-400 mt-0.5">
                    S/N: {matchedItem.serialNumber} • Location: {matchedItem.location || "Vault"}
                  </p>
                )}
              </div>

              {/* Status Badge */}
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                    matchedItem.status === "AVAILABLE"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : matchedItem.status === "ON_SHOOT"
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                      : matchedItem.status === "RESERVED"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                      : "bg-red-500/10 text-red-400 border-red-500/30"
                  }`}
                >
                  {matchedItem.status === "AVAILABLE" && <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  {matchedItem.status === "ON_SHOOT" && <Camera className="size-3" />}
                  {matchedItem.status === "RESERVED" && <Clock className="size-3" />}
                  {matchedItem.status === "MAINTENANCE" && <Wrench className="size-3" />}
                  <span>{matchedItem.status}</span>
                </span>
                <div className="text-[10px] font-mono text-zinc-500 mt-1">
                  Condition: {conditionLabel(matchedItem.condition)}
                </div>
              </div>
            </div>

            {/* Reservation Context if linked */}
            {activeRes ? (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Active Production:</span>
                  <span className="font-mono text-amber-400 font-bold">{activeRes.project.projectNumber}</span>
                </div>
                <div className="text-xs font-semibold text-white">{activeRes.project.title}</div>
                <div className="text-[11px] font-mono text-zinc-400">
                  Status: <span className="font-bold text-zinc-200">{activeRes.status}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">No shoot reservation currently active for this asset.</p>
            )}

            {/* Quick Actions */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-end gap-2">
              {/* Check Out button if active reservation is RESERVED */}
              {activeRes && activeRes.status === "RESERVED" && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCheckOut(activeRes);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <PackageCheck className="size-4" />
                  <span>Log Pre-Shoot Check-Out</span>
                </button>
              )}

              {/* Check In button if active reservation is CHECKED_OUT */}
              {activeRes && activeRes.status === "CHECKED_OUT" && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCheckIn(activeRes);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <CheckCircle2 className="size-4" />
                  <span>Log Return Check-In</span>
                </button>
              )}

              {/* Maintenance Quarantine Actions */}
              {matchedItem.status === "MAINTENANCE" ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleReturnToFleet}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-black border border-emerald-500/40 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  <span>Return to Fleet (Cleared)</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuarantine("MAINTENANCE_NEEDED")}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-zinc-300 hover:text-amber-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Flag Needs Service
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuarantine("DAMAGED")}
                    className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Flag Damaged
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : scanCode.trim() ? (
          <div className="py-8 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
            No equipment matching &quot;{scanCode}&quot; in studio fleet.
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
            Ready for input. Scan a barcode or type a SKU above.
          </div>
        )}
      </div>
    </div>
  );
}
