"use client";

import { useEffect, useState } from "react";
import { Clock, Calendar, ShieldCheck, AlertCircle, FileText, Sparkles } from "lucide-react";

interface OrderSummaryCardProps {
  tenantName: string;
  currency: string;
  slot?: {
    id: string;
    startTime: string;
    endTime: string;
    date: Date | string;
    price: number;
    depositRequired: number;
    category: string;
    campaignTitle?: string | null;
    heldUntil?: Date | string | null;
  } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    milestoneType: string;
    amount: number;
    dueDate: Date | string;
    project?: {
      title: string;
      projectNumber: string;
    } | null;
  } | null;
  onHoldExpired?: () => void;
}

export function OrderSummaryCard({
  tenantName,
  currency,
  slot,
  invoice,
  onHoldExpired,
}: OrderSummaryCardProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  // Countdown timer for held slot
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (!slot?.heldUntil) return null;
    const diff = Math.floor((new Date(slot.heldUntil).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (!slot?.heldUntil) return;

    const interval = setInterval(() => {
      const diff = Math.floor((new Date(slot.heldUntil!).getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        setSecondsLeft(0);
        clearInterval(interval);
        if (onHoldExpired) onHoldExpired();
      } else {
        setSecondsLeft(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [slot?.heldUntil, onHoldExpired]);

  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : null;
  const isUrgent = secondsLeft !== null && secondsLeft < 120; // under 2 mins

  const slotDateStr = slot?.date
    ? new Date(slot.date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-xl sticky top-6">
      {/* Top Banner */}
      <div className="p-5 border-b border-zinc-800 bg-[#15151a] flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block mb-0.5">
            ORDER SUMMARY
          </span>
          <h3 className="text-base font-bold text-white tracking-tight">{tenantName}</h3>
        </div>

        {secondsLeft !== null && secondsLeft > 0 && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border transition-colors ${
              isUrgent
                ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}
          >
            <Clock className="size-3.5" />
            <span>
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Slot Booking Details */}
        {slot && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] uppercase text-zinc-400">
                  {slot.category} {slot.campaignTitle ? `// ${slot.campaignTitle}` : ""}
                </span>
                <span className="text-emerald-400 text-[10px] font-mono uppercase flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Reserved Slot
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Calendar className="size-4 text-amber-400 shrink-0" />
                <span>{slotDateStr}</span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                <Clock className="size-3.5 text-zinc-500 shrink-0" />
                <span>
                  {slot.startTime} – {slot.endTime} (Production Session)
                </span>
              </div>
            </div>

            {/* Hold Warning if under 2 mins */}
            {isUrgent && secondsLeft !== null && secondsLeft > 0 && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/20 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  Your 10-minute hold will expire in under 2 minutes. Complete payment to secure your time slot.
                </p>
              </div>
            )}

            {secondsLeft === 0 && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/30 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  Your hold has expired. The slot may have been released to other clients.
                </p>
              </div>
            )}

            {/* Financial Schedule */}
            <div className="pt-2 border-t border-zinc-800 space-y-2.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Total Production Shoot Value:</span>
                <span className="font-mono tabular-nums text-white">
                  {currencySymbol}
                  {slot.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-zinc-400">
                <span>Final Balance Due on Delivery:</span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {currencySymbol}
                  {(slot.price - slot.depositRequired).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-white block">50% Deposit Due Now</span>
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    Locks studio crew &amp; equipment calendar
                  </span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-400">
                  {currencySymbol}
                  {slot.depositRequired.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Milestone Invoice Details */}
        {invoice && !slot && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] uppercase text-amber-400">
                  {invoice.milestoneType.replace(/_/g, " ")}
                </span>
                <span className="text-zinc-400 font-mono text-[10px]">
                  {invoice.invoiceNumber}
                </span>
              </div>

              {invoice.project && (
                <div className="text-sm font-semibold text-white">
                  {invoice.project.title}
                  <span className="block text-xs font-mono text-zinc-400 font-normal">
                    Project Ref: #{invoice.project.projectNumber}
                  </span>
                </div>
              )}

              <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
                Due Date:{" "}
                {new Date(invoice.dueDate).toLocaleDateString("en-US", {
                  dateStyle: "medium",
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-between items-baseline">
              <div>
                <span className="text-sm font-bold text-white block">Total Settlement Due</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {invoice.milestoneType === "FINAL_BALANCE_50"
                    ? "Immediately unlocks 4K masters & ZIP"
                    : "Locks production milestone"}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                {currencySymbol}
                {invoice.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {/* CineFlow Assurance Badge */}
        <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center gap-3">
          <ShieldCheck className="size-5 text-amber-400 shrink-0" />
          <div className="text-[11px] text-zinc-400 leading-snug">
            <span className="font-bold text-white">CineFlow Escrow Guarantee:</span> Official studio invoice and cryptographic booking receipt issued instantly.
          </div>
        </div>
      </div>
    </div>
  );
}
