"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  X,
  CalendarCheck,
  Clock,
  Mail,
  Phone,
  FileText,
  Receipt,
  ShieldCheck,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BookingDetails } from "@/lib/bookings/details";

// ---------------------------------------------------------------------------
// Shared presentation helpers (also used by the Bookings list)
// ---------------------------------------------------------------------------

export type BookingStage = "CONFIRMED" | "VERIFYING" | "AWAITING_PAYMENT" | "REJECTED" | "PENDING" | "CANCELLED";

export function bookingStage(b: BookingDetails): BookingStage {
  if (b.status === "CANCELLED") return "CANCELLED";
  if (b.status === "CONFIRMED") return "CONFIRMED";
  if (b.invoice?.status === "PENDING_VERIFICATION") return "VERIFYING";
  if (b.invoice?.status === "PENDING") return "AWAITING_PAYMENT";
  if (b.invoice?.status === "REJECTED") return "REJECTED";
  return "PENDING";
}

const STAGE_STYLE: Record<BookingStage, { label: string; className: string }> = {
  CONFIRMED: { label: "Confirmed", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  VERIFYING: { label: "Awaiting verification", className: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  AWAITING_PAYMENT: { label: "Awaiting online payment", className: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  REJECTED: { label: "Payment rejected", className: "bg-red-500/10 text-red-400 border-red-500/25" },
  PENDING: { label: "Pending", className: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  CANCELLED: { label: "Cancelled", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

export function BookingStageBadge({ booking }: { booking: BookingDetails }) {
  const style = STAGE_STYLE[bookingStage(booking)];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}

/** "Sun, 1 Nov 2026". Session dates are calendar days, so format them in UTC to avoid shifting a day. */
export function formatSessionDate(date: string | null): string {
  if (!date) return "No date";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatPaymentMethod(method: string | null): string {
  switch (method) {
    case "CARD":
      return "Card / FPX (online)";
    case "QR_CODE":
      return "Studio QR transfer";
    case "CASH":
      return "Cash at counter";
    case "BANK_TRANSFER":
      return "Bank transfer";
    default:
      return method ? method.replace(/_/g, " ").toLowerCase() : "Not specified";
  }
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface BookingDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  currency: string;
  booking: BookingDetails | null;
  loading?: boolean;
  error?: string | null;
}

export function BookingDetailsDialog({
  isOpen,
  onClose,
  tenantSlug,
  currency,
  booking,
  loading = false,
  error = null,
}: BookingDetailsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the close button once on open; Escape closes. Keyed on isOpen only so a
  // parent re-render (e.g. details finishing loading) doesn't steal focus.
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-details-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800 sticky top-0 bg-[#0d0d10] z-10">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarCheck className="size-5 text-amber-400 shrink-0" />
            <h2 id="booking-details-title" className="text-base font-bold text-white tracking-tight">
              Booking Details
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin text-amber-400" />
            Loading booking…
          </div>
        ) : error || !booking ? (
          <div className="p-5">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error || "Booking not found."}</span>
            </div>
          </div>
        ) : (
          <BookingDetailsBody booking={booking} tenantSlug={tenantSlug} currency={currency} />
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/70">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-xs">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-200 text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function BookingDetailsBody({
  booking,
  tenantSlug,
  currency,
}: {
  booking: BookingDetails;
  tenantSlug: string;
  currency: string;
}) {
  const inv = booking.invoice;
  const stage = bookingStage(booking);

  return (
    <div className="p-5 space-y-5">
      {/* Summary */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-white tracking-tight truncate">{booking.clientName}</div>
            <div className="text-[11px] font-mono text-amber-400 tracking-wider">{booking.trackingCode}</div>
          </div>
          <BookingStageBadge booking={booking} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <span className="flex items-center gap-1.5">
            <CalendarCheck className="size-3.5 text-zinc-500" />
            {formatSessionDate(booking.sessionDate)}
          </span>
          {booking.slot && (
            <span className="flex items-center gap-1.5 font-mono">
              <Clock className="size-3.5 text-zinc-500" />
              {booking.slot.startTime} – {booking.slot.endTime}
            </span>
          )}
        </div>
      </div>

      {stage === "VERIFYING" && (
        <Link
          href={`/${tenantSlug}/admin/verification`}
          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-xs text-blue-200 hover:bg-blue-500/15 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-blue-400" />
            Deposit is waiting for your approval.
          </span>
          <span className="font-semibold text-blue-300 whitespace-nowrap">Verify payment →</span>
        </Link>
      )}

      <Section title="Client" icon={Mail}>
        <Row label="Email">
          <a href={`mailto:${booking.clientEmail}`} className="text-amber-400 hover:underline">
            {booking.clientEmail}
          </a>
        </Row>
        <Row label="Phone">
          {booking.clientPhone ? (
            <a href={`tel:${booking.clientPhone}`} className="inline-flex items-center gap-1 text-amber-400 hover:underline">
              <Phone className="size-3" />
              {booking.clientPhone}
            </a>
          ) : (
            <span className="text-zinc-500">Not provided</span>
          )}
        </Row>
      </Section>

      <Section title="Session" icon={Clock}>
        <Row label="Category">{titleCase(booking.category)}</Row>
        {booking.slot?.campaignTitle && <Row label="Campaign">{booking.slot.campaignTitle}</Row>}
        <Row label="Service">
          {titleCase(booking.discipline)} · {titleCase(booking.serviceTier)}
        </Row>
        {booking.slot ? (
          <Row label="Session price">{formatCurrency(booking.slot.price, currency)}</Row>
        ) : (
          <Row label="Slot">
            <span className="text-zinc-500">Released</span>
          </Row>
        )}
      </Section>

      <Section title="Creative brief" icon={FileText}>
        <p className="px-3.5 py-2.5 text-xs text-zinc-300 whitespace-pre-wrap">
          {booking.creativeBrief?.trim() || <span className="text-zinc-500">No brief provided.</span>}
        </p>
      </Section>

      <Section title="Deposit & payment" icon={Receipt}>
        <Row label="Deposit">
          {formatCurrency(booking.depositAmount, currency)}{" "}
          <span className={booking.depositPaid ? "text-emerald-400" : "text-amber-400"}>
            ({booking.depositPaid ? "paid" : "unpaid"})
          </span>
        </Row>
        <Row label="Method">{formatPaymentMethod(booking.paymentMethod)}</Row>
        {inv ? (
          <>
            <Row label="Invoice">
              <span className="font-mono">{inv.invoiceNumber}</span>{" "}
              <span className="text-zinc-500">· {titleCase(inv.status)}</span>
            </Row>
            {inv.verifiedBy && (
              <Row label="Verified by">
                {inv.verifiedBy}
                {inv.paidAt && <span className="text-zinc-500"> · {formatDateTime(inv.paidAt)}</span>}
              </Row>
            )}
            <Row label="Receipt">
              {inv.paymentProofUrl ? (
                <a
                  href={inv.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                >
                  View uploaded slip <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="text-zinc-500">None uploaded</span>
              )}
            </Row>
          </>
        ) : (
          <Row label="Invoice">
            <span className="text-zinc-500">No deposit invoice on record</span>
          </Row>
        )}
      </Section>

      <p className="text-[11px] font-mono text-zinc-500">Booked on {formatDateTime(booking.createdAt)}</p>
    </div>
  );
}
