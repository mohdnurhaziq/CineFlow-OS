"use client";

import { useState } from "react";
import { Banknote, Clock, MapPin, Loader2, AlertCircle } from "lucide-react";

interface CashPaymentFormProps {
  amount: number;
  currency: string;
  isSubmitting: boolean;
  onSubmit: (data: { cashNotes: string }) => void;
}

export function CashPaymentForm({
  amount,
  currency,
  isSubmitting,
  onSubmit,
}: CashPaymentFormProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";
  const [cashNotes, setCashNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      cashNotes: cashNotes.trim() || "CASH_COUNTER_WALKIN",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Walk-in Notice Banner */}
      <div className="p-5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 via-[#15151a] to-[#15151a] space-y-3">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
          <Banknote className="size-5" />
          <span>Studio Front Desk Cash Counter Settlement</span>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
          You may settle your booking deposit in cash directly at the studio reception counter prior to the commencement of your scheduled production shoot.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-amber-400" />
            <span>Counter open 30 mins before shoot</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 text-amber-400" />
            <span>Exact cash &amp; local currency accepted</span>
          </div>
        </div>
      </div>

      {/* Arrival Memo Input */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Arrival Notes / Counter Memo (Optional)
        </label>
        <textarea
          rows={3}
          placeholder="e.g. Arriving 9:15 AM with exact cash; representative name if different from booking..."
          value={cashNotes}
          onChange={(e) => setCashNotes(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 resize-none font-sans"
        />
      </div>

      {/* Amount Summary */}
      <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex justify-between items-center text-xs">
        <span className="text-zinc-400">Cash Deposit Amount Due at Counter:</span>
        <span className="text-base font-bold font-mono tabular-nums text-amber-400">
          {currencySymbol}
          {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Submit CTA */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Issuing Cash Invoice...
            </>
          ) : (
            <>
              <Banknote className="size-4" />
              Generate Cash Booking Invoice
            </>
          )}
        </button>
        <p className="text-[10px] text-zinc-500 text-center mt-2 font-mono">
          An official cash invoice will be issued. Front desk staff will confirm your slot upon cash receipt.
        </p>
      </div>
    </form>
  );
}
