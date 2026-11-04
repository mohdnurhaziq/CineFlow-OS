"use client";

import { Lock, Loader2, ShieldCheck, FlaskConical } from "lucide-react";

interface OnlinePaymentFormProps {
  amount: number;
  currency: string;
  isSubmitting: boolean;
  /** GATEWAY redirects to the studio's Toyyibpay page; SIMULATED is a dev/test stand-in. */
  mode: "GATEWAY" | "SIMULATED";
  onPay: () => void;
}

/**
 * No card details are ever typed into (or sent through) this app. Payment happens
 * on the gateway's own hosted page, where the client picks FPX online banking or a card.
 */
export function OnlinePaymentForm({ amount, currency, isSubmitting, mode, onPay }: OnlinePaymentFormProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="size-4 text-emerald-400" />
          {mode === "GATEWAY" ? "Pay securely with FPX or card" : "Simulated payment (development only)"}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {mode === "GATEWAY"
            ? "You'll be taken to Toyyibpay to complete your payment with online banking (FPX) or a credit/debit card. Your card details never touch this site. You'll return here automatically once it's done."
            : "This studio has no payment gateway connected. This button marks the payment as successful without charging anything."}
        </p>
        {mode === "SIMULATED" && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400">
            <FlaskConical className="size-3" /> Not a real charge
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onPay}
        disabled={isSubmitting}
        className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {mode === "GATEWAY" ? "Redirecting to payment..." : "Processing..."}
          </>
        ) : (
          <>
            <Lock className="size-4" />
            Pay {currencySymbol}
            {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} {mode === "GATEWAY" ? "securely" : "(simulated)"}
          </>
        )}
      </button>
    </div>
  );
}
