"use client";

import Link from "next/link";
import { Lock, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";

interface PaywallBannerProps {
  tenantSlug: string;
  projectId: string;
  invoiceId?: string | null;
  balanceAmount: number;
  currency: string;
}

export function PaywallBanner({
  tenantSlug,
  projectId,
  invoiceId,
  balanceAmount,
  currency,
}: PaywallBannerProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";
  const checkoutUrl = `/${tenantSlug}/checkout?projectId=${projectId}&type=FINAL_BALANCE${
    invoiceId ? `&invoiceId=${invoiceId}` : ""
  }`;

  return (
    <div className="relative rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-[#15151a] to-[#121215] p-6 sm:p-7 shadow-2xl overflow-hidden animate-fadeIn">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left Information */}
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <Lock className="size-3" />
              50% Final Balance Milestone Due
            </span>
            <span className="text-zinc-500 text-xs font-mono">• Gated Masters</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Settle Balance to Unlock Master Deliverables
          </h2>

          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
            Uncompressed high-resolution photo ZIP bundles and 4K ProRes master video downloads are locked until your final milestone invoice is verified. You can review watermarked proofs and streaming proxy cuts below.
          </p>
        </div>

        {/* Right CTA & Price Box */}
        <div className="shrink-0 flex flex-col sm:items-end justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-400 block text-left sm:text-right">
              Balance Due Upon Delivery
            </span>
            <div className="text-3xl font-bold font-mono tabular-nums text-amber-400 tracking-tight text-left sm:text-right">
              {currencySymbol}
              {balanceAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>

          <Link
            href={checkoutUrl}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            <Sparkles className="size-4" />
            <span>Settle Balance &amp; Unlock</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
