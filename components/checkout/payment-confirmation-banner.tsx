"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Banknote, Download, X } from "lucide-react";
import confetti from "canvas-confetti";
import { formatMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { PaymentConfirmation } from "@/lib/payments/confirmation";

interface PaymentConfirmationBannerProps {
  tenantSlug: string;
  currency: string;
  confirmation: PaymentConfirmation;
  /** The same page without the confirmation query, for the dismiss button. */
  dismissHref: string;
}

function copyFor(c: PaymentConfirmation, amount: string): { title: string; body: string } {
  const booking = c.kind === "BOOKING";
  switch (c.state) {
    case "PAID":
      return booking
        ? { title: "Booking confirmed", body: "Your deposit is paid and your session is booked. You'll find it below." }
        : { title: "Payment received", body: "Thank you, this invoice is paid. Your receipt is below." };
    case "AWAITING_CHECK":
      return booking
        ? { title: "Payment slip received", body: "The studio will check your transfer and confirm your booking. Your slot is held while they do." }
        : { title: "Payment slip received", body: "The studio will check your transfer and mark this invoice paid." };
    case "PAY_AT_STUDIO":
      return booking
        ? {
            title: "Booking requested: pay at the studio",
            body: `Pay ${amount} in cash at the studio to confirm your booking.${
              c.holdHours ? ` Your slot is held for ${c.holdHours} hours; after that it is released if unpaid.` : ""
            }`,
          }
        : { title: "Pay at the studio", body: `Pay ${amount} in cash at the studio, and they'll mark this invoice paid.` };
    case "AWAITING_PAYMENT":
      return { title: "Waiting for your payment", body: "We haven't received confirmation of your online payment yet. If you completed it, this can take a minute." };
  }
}

/**
 * Shown at the top of the client's bookings or invoice page right after checkout, in place of a
 * separate success screen: the client lands where the booking or invoice lives, and a refresh
 * keeps it (the URL carries which booking or invoice; the details come from the database).
 */
export function PaymentConfirmationBanner({ tenantSlug, currency, confirmation: c, dismissHref }: PaymentConfirmationBannerProps) {
  const router = useRouter();
  const paid = c.state === "PAID";
  const cash = c.state === "PAY_AT_STUDIO";
  const amount = formatMoney(currency, c.amount);
  const { title, body } = copyFor(c, amount);

  // Celebrate a confirmed payment once per booking or invoice, not on every refresh.
  useEffect(() => {
    if (!paid) return;
    const key = `cineflow:confetti:${c.trackingCode ?? c.invoiceId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: celebrating every time is fine.
    }
    try {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 }, colors: ["#f59e0b", "#10b981", "#ffffff"] });
    } catch {
      // No canvas available.
    }
  }, [paid, c.trackingCode, c.invoiceId]);

  const Icon = paid ? CheckCircle2 : cash ? Banknote : Clock;
  const rows: { label: string; value: string; strong?: boolean }[] = [
    ...(c.trackingCode ? [{ label: "Booking reference", value: c.trackingCode, strong: true }] : []),
    ...(c.invoiceNumber ? [{ label: "Invoice", value: c.invoiceNumber }] : []),
    ...(c.paymentMethod ? [{ label: "Payment method", value: paymentMethodLabel(c.paymentMethod) }] : []),
    { label: paid ? "Paid" : c.state === "AWAITING_CHECK" ? "Amount sent" : "Amount due", value: amount, strong: true },
  ];

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "relative rounded-2xl border p-5 sm:p-6 print:hidden",
        paid ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-amber-500/30 bg-amber-500/[0.07]"
      )}
    >
      <button
        type="button"
        onClick={() => router.replace(dismissHref, { scroll: false })}
        aria-label="Dismiss"
        className="absolute top-3 right-3 inline-flex items-center justify-center size-9 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div
          className={cn(
            "size-10 shrink-0 rounded-full flex items-center justify-center border",
            paid ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-amber-500/15 border-amber-500/40 text-amber-400"
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
          <p className="text-sm text-zinc-300 leading-relaxed">{body}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 min-w-0">
            <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{r.label}</dt>
            <dd className={cn("mt-0.5 text-sm truncate tabular-nums", r.strong ? "font-bold text-white" : "text-zinc-200")}>{r.value}</dd>
          </div>
        ))}
      </dl>

      {c.vaultProjectId && (
        <Link
          href={`/${tenantSlug}/vault/${c.vaultProjectId}`}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold uppercase tracking-wider transition-colors"
        >
          <Download className="size-4" aria-hidden="true" />
          Open your delivery vault
        </Link>
      )}
    </section>
  );
}
