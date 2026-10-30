"use client";

import { useState } from "react";
import { CreditCard, Lock, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

interface CardPaymentFormProps {
  amount: number;
  currency: string;
  isSubmitting: boolean;
  onSubmit: (cardData: {
    cardNumber: string;
    cardExp: string;
    cardCvc: string;
    cardholderName: string;
  }) => void;
}

export function CardPaymentForm({
  amount,
  currency,
  isSubmitting,
  onSubmit,
}: CardPaymentFormProps) {
  const currencySymbol = currency === "MYR" ? "RM " : "$";

  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");

  const formatCardNumber = (val: string) => {
    const raw = val.replace(/\D/g, "").slice(0, 16);
    return raw.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  };

  const formatExp = (val: string) => {
    const raw = val.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      return `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    return raw;
  };

  const handleFillDemo = (num: string) => {
    setCardNumber(formatCardNumber(num));
    setCardExp("12/28");
    setCardCvc("888");
    if (!cardholderName) setCardholderName("Julian Sterling");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      cardNumber: cardNumber.replace(/\s/g, ""),
      cardExp,
      cardCvc,
      cardholderName,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Nocturne Cine Titanium Credit Card Mockup */}
      <div className="relative w-full aspect-[1.586/1] max-w-sm mx-auto rounded-2xl p-6 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border border-zinc-700/80 shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Ambient Sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />

        {/* Card Top: Chip & Contactless */}
        <div className="flex items-center justify-between relative z-10">
          <div className="size-9 rounded-md bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border border-amber-200/50 flex items-center justify-center shadow-inner">
            <div className="size-6 border border-black/20 rounded-sm grid grid-cols-2 gap-0.5 p-0.5">
              <div className="bg-amber-700/20 rounded-xs" />
              <div className="bg-amber-700/20 rounded-xs" />
              <div className="bg-amber-700/20 rounded-xs" />
              <div className="bg-amber-700/20 rounded-xs" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
              CineFlow Vault
            </span>
            <CreditCard className="size-5 text-amber-400" />
          </div>
        </div>

        {/* Card Middle: Card Number */}
        <div className="relative z-10">
          <div className="font-mono text-lg sm:text-xl tracking-widest text-white font-bold drop-shadow">
            {cardNumber || "•••• •••• •••• ••••"}
          </div>
        </div>

        {/* Card Bottom: Name & Exp */}
        <div className="flex justify-between items-end relative z-10 text-[11px] font-mono">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-400">Cardholder</div>
            <div className="font-bold text-white uppercase tracking-wider">
              {cardholderName || "STUDIO CLIENT"}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400">Expires</div>
            <div className="font-bold text-white tracking-wider">{cardExp || "MM/YY"}</div>
          </div>
        </div>
      </div>

      {/* Demo Autofill Buttons */}
      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
          <Sparkles className="size-3" />
          Quick Test Card Presets (Simulated Authorization)
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleFillDemo("4242424242424242")}
            className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-mono transition-colors"
          >
            4242 •••• •••• 4242 (Instant OK)
          </button>
          <button
            type="button"
            onClick={() => handleFillDemo("4000000000000002")}
            className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-mono transition-colors"
          >
            4000 •••• •••• 0002 (3DS Sim)
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Cardholder Name */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Cardholder Name *
          </label>
          <input
            type="text"
            placeholder="Maya Farhan"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
            required
          />
        </div>

        {/* Card Number */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Card Number *
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="4242 4242 4242 4242"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              maxLength={19}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono tracking-wider focus:outline-none focus:border-amber-500"
              required
            />
            <CreditCard className="absolute right-3.5 top-2.5 size-4 text-zinc-500" />
          </div>
        </div>

        {/* Expiry & CVC */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Expiration Date *
            </label>
            <input
              type="text"
              placeholder="MM/YY"
              value={cardExp}
              onChange={(e) => setCardExp(formatExp(e.target.value))}
              maxLength={5}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono tracking-wider focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              CVC Security Code *
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="123"
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono tracking-widest focus:outline-none focus:border-amber-500"
                required
              />
              <Lock className="absolute right-3.5 top-2.5 size-4 text-zinc-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Authorizing Payment...
            </>
          ) : (
            <>
              <Lock className="size-4" />
              Pay {currencySymbol}
              {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} Now
            </>
          )}
        </button>
        <p className="text-[10px] text-zinc-500 text-center mt-2 font-mono">
          256-Bit Encrypted Simulated Payment Gateway • Instant Slot Confirmation
        </p>
      </div>
    </form>
  );
}
