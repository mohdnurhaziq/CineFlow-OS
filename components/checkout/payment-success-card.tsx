"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Calendar, ArrowRight, FileText, Download } from "lucide-react";
import confetti from "canvas-confetti";

interface PaymentSuccessCardProps {
  tenantSlug: string;
  trackingCode?: string;
  invoiceNumber: string;
  status: "CONFIRMED" | "PAID" | "PENDING_VERIFICATION" | string;
  paymentMethod: string;
  amount: number;
  currency: string;
  unlockedDownloads?: boolean;
  projectId?: string;
}

export function PaymentSuccessCard({
  tenantSlug,
  trackingCode,
  invoiceNumber,
  status,
  paymentMethod,
  amount,
  currency,
  unlockedDownloads,
  projectId,
}: PaymentSuccessCardProps) {
  const isPaidOrConfirmed = status === "CONFIRMED" || status === "PAID";
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  useEffect(() => {
    if (isPaidOrConfirmed) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#f59e0b", "#10b981", "#ffffff"],
        });
      } catch {
        // Safe fallback if canvas not available
      }
    }
  }, [isPaidOrConfirmed]);

  return (
    <div className="max-w-xl mx-auto rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl animate-fadeIn">
      {/* Status Top Banner */}
      <div
        className={`p-8 text-center space-y-4 border-b ${
          isPaidOrConfirmed
            ? "border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 to-transparent"
            : "border-amber-500/20 bg-gradient-to-b from-amber-950/20 to-transparent"
        }`}
      >
        <div
          className={`size-16 rounded-full mx-auto flex items-center justify-center border ${
            isPaidOrConfirmed
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
              : "bg-amber-500/20 border-amber-500 text-amber-400"
          }`}
        >
          {isPaidOrConfirmed ? (
            <CheckCircle2 className="size-8" />
          ) : (
            <Clock className="size-8" />
          )}
        </div>

        <div className="space-y-1.5">
          <span
            className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
              isPaidOrConfirmed
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}
          >
            {isPaidOrConfirmed ? "OFFICIALLY CONFIRMED" : "AWAITING STUDIO VERIFICATION"}
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {isPaidOrConfirmed
              ? "Payment & Reservation Confirmed"
              : "Order Submitted for Verification"}
          </h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            {isPaidOrConfirmed
              ? "Your payment was authorized and your studio shoot slot is locked into our master production schedule."
              : "Your payment proof has been submitted to the studio manual verification queue. Your slot is held while staff reviews the transaction."}
          </p>
        </div>
      </div>

      {/* Details Box */}
      <div className="p-6 space-y-5">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 font-mono text-xs space-y-3">
          {trackingCode && (
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800/80">
              <span className="text-zinc-400 text-[11px]">Booking Tracking Code</span>
              <span className="font-bold text-amber-400 tracking-wider text-sm">
                {trackingCode}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-[11px]">Invoice Number</span>
            <span className="text-white font-semibold">{invoiceNumber}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-[11px]">Payment Method</span>
            <span className="text-zinc-300 font-semibold">{paymentMethod}</span>
          </div>

          <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800/80">
            <span className="text-zinc-400 text-[11px]">Settled Amount</span>
            <span className="text-base font-bold text-white tabular-nums">
              {currencySymbol}
              {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="space-y-3 pt-2">
          {unlockedDownloads && projectId && (
            <Link
              href={`/${tenantSlug}/vault/${projectId}`}
              className="w-full py-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <Download className="size-4" />
              Access Unlocked Delivery Vault
            </Link>
          )}

          <Link
            href={`/${tenantSlug}/book`}
            className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Calendar className="size-4" />
            Return to Production Calendar
          </Link>

          <Link
            href={`/${tenantSlug}`}
            className="w-full py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>Back to Studio Showcase</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
