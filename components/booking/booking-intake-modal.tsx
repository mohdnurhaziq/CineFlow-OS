"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, User, Mail, Phone, FileText, Loader2, Calendar, CreditCard, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { createClientBooking, type CreateBookingInput } from "@/lib/actions/booking";
import { ClientAuthPanel } from "@/components/auth/client-auth-panel";
import { logoutAction } from "@/lib/auth/session";

interface BookingIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    date: Date | string;
    price: number;
    depositRequired: number;
    category: string;
  } | null;
  sessionId: string;
  brandColor?: string | null;
  /** Signed-in client for this studio, if any. Bookings are made under this account. */
  clientAccount?: { name: string; email: string; phone: string } | null;
  onBookingConfirmed: (trackingCode: string) => void;
}

export function BookingIntakeModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  currency,
  slot,
  sessionId,
  brandColor,
  clientAccount = null,
  onBookingConfirmed,
}: BookingIntakeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    creativeBrief: "",
    paymentMethod: "CARD" as "CARD" | "QR_CODE" | "CASH",
  });

  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);

  if (!isOpen || !slot) return null;

  const currencySymbol = currency === "MYR" ? "RM " : "$";
  const slotDateStr = new Date(slot.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientAccount) {
      toast.error("Please sign in or create a quick account to continue.");
      return;
    }

    startTransition(async () => {
      const payload: CreateBookingInput = {
        tenantId,
        slotId: slot.id,
        sessionId,
        clientName: clientAccount.name,
        clientEmail: clientAccount.email,
        clientPhone: clientAccount.phone,
        creativeBrief: formData.creativeBrief.trim() || undefined,
        serviceTier: "STANDARD",
        discipline: "PHOTOGRAPHY",
        category: slot.category,
        paymentMethod: formData.paymentMethod,
      };

      const result = await createClientBooking(payload);

      if (result.success && result.trackingCode) {
        setConfirmedCode(result.trackingCode);
        onBookingConfirmed(result.trackingCode);
        toast.success("Booking confirmed! Your slot is officially locked.");
      } else {
        toast.error(result.error || "Failed to confirm booking.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 max-w-lg w-full rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl flex flex-col">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#15151a]">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
              QUICK ACCOUNT // 4 FIELDS
            </span>
            <h3 className="text-base font-bold text-white tracking-tight">Complete Session Reservation</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Confirmed State View */}
        {confirmedCode ? (
          <div className="p-8 text-center space-y-6">
            <div className="size-16 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="size-8" />
            </div>

            <div className="space-y-2">
              <h4 className="text-xl font-bold text-white tracking-tight">Reservation Confirmed!</h4>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Your session slot has been permanently locked. A confirmation email and calendar invite have been dispatched.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 font-mono text-xs space-y-1.5">
              <div className="text-zinc-400 uppercase text-[10px]">Booking Tracking Reference:</div>
              <div className="text-base font-black text-amber-400 tracking-wider">{confirmedCode}</div>
              <div className="text-[11px] text-zinc-400 pt-2 border-t border-zinc-800">
                {slotDateStr} • {slot.startTime} – {slot.endTime}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg bg-amber-500 text-black font-bold text-xs uppercase tracking-wider hover:bg-amber-400"
            >
              Return to Calendar
            </button>
          </div>
        ) : (
          /* Intake Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Slot Summary Pill */}
            <div className="p-3 rounded-xl border border-zinc-800 bg-[#16161b] flex items-center justify-between text-xs font-mono">
              <div className="space-y-0.5">
                <div className="text-zinc-400 text-[10px] uppercase">{slot.category}</div>
                <div className="text-white font-bold">
                  {slotDateStr} • {slot.startTime}
                </div>
              </div>

              <div className="text-right">
                <div className="text-zinc-400 text-[10px] uppercase">50% Retainer</div>
                <div className="text-amber-400 font-bold tabular-nums">
                  {currencySymbol}
                  {slot.depositRequired.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Account */}
            <div className="space-y-3.5">
              {clientAccount ? (
                <div className="p-3 rounded-xl border border-zinc-800 bg-[#16161b] flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-zinc-400 text-[10px] uppercase font-mono">Booking as</div>
                    <div className="text-white font-semibold truncate">{clientAccount.name}</div>
                    <div className="text-zinc-400 truncate">{clientAccount.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await logoutAction();
                      router.refresh();
                    }}
                    className="text-[11px] font-mono text-zinc-400 hover:text-white underline underline-offset-2 flex-shrink-0"
                  >
                    Not you?
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">
                    Create a quick account (name, email, phone, password) to book, track your session and
                    see your photos and invoices in your own dashboard.
                  </p>
                  <ClientAuthPanel
                    tenantSlug={tenantSlug}
                    onSuccess={() => {
                      toast.success("You're signed in.");
                      router.refresh();
                    }}
                  />
                </div>
              )}

              {/* Optional Field 4: Brief */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Shoot Concept / Creative Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Convocation cap and gown with family, 4 members..."
                  value={formData.creativeBrief}
                  onChange={(e) => setFormData((prev) => ({ ...prev, creativeBrief: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "CARD", label: "Card (Instant)" },
                    { id: "QR_CODE", label: "Studio QR Slip" },
                    { id: "CASH", label: "Cash Counter" },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setFormData((prev) => ({ ...prev, paymentMethod: p.id as any }))}
                      className={`py-2 px-2 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                        formData.paymentMethod === p.id
                          ? "bg-amber-500 text-black border-amber-500"
                          : "bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit & Checkout CTAs */}
            <div className="pt-3 space-y-2">
              <button
                type="submit"
                disabled={isPending || !clientAccount}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Locking Reservation...
                  </>
                ) : (
                  <>
                    <Calendar className="size-4" />
                    Quick Confirm Booking
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={!clientAccount}
                onClick={() => {
                  const url = `/${tenantSlug}/checkout?slotId=${slot.id}&sessionId=${sessionId}&brief=${encodeURIComponent(
                    formData.creativeBrief
                  )}`;
                  router.push(url);
                }}
                className="w-full py-2.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-xs font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CreditCard className="size-3.5 text-amber-400" />
                <span>Proceed to Dedicated Checkout Page</span>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
