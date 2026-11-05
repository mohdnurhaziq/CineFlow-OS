"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Mail,
  Hash,
  AlertCircle,
  CalendarClock,
  FileText,
  Receipt,
  FolderLock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { lookupMyBooking, type MyBookingView } from "@/lib/actions/my-booking";
import { formatMoney } from "@/lib/money";

interface MyBookingLookupProps {
  tenantSlug: string;
  tenantName: string;
  initialCode?: string;
}

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  PAID: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  PENDING_VERIFICATION: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  SENT: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  CANCELLED: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  DECLINED: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase tracking-wide ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MyBookingLookup({ tenantSlug, tenantName, initialCode = "" }: MyBookingLookupProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<MyBookingView | null>(null);
  const [currency, setCurrency] = useState("USD");

  const money = (amount: number) => formatMoney(currency, amount);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await lookupMyBooking({ tenantSlug, email, trackingCode: code });
      if (!result.success) {
        setBooking(null);
        setError(result.message);
      } else {
        setBooking(result.booking);
        setCurrency(result.currency);
      }
    } catch {
      setBooking(null);
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-2 text-center">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
          Client Booking Lookup
        </span>
        <h1 className="text-2xl font-black tracking-tight text-white">{tenantName}</h1>
        <p className="text-xs text-zinc-400">
          Enter the email you booked with and your tracking code to see your booking, invoices,
          proposals and delivery vault.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl space-y-4"
      >
        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300"
          >
            <AlertCircle className="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="mb-email" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Mail className="size-3.5 text-amber-400" />
              Email Address
            </label>
            <input
              id="mb-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mb-code" className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Hash className="size-3.5 text-amber-400" />
              Tracking Code
            </label>
            <input
              id="mb-code"
              type="text"
              required
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BK-XXXXXXXX-XXXX"
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-sm text-white placeholder-zinc-500 outline-none transition-colors font-mono uppercase"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs tracking-wide uppercase transition-colors flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Looking up...</span>
            </>
          ) : (
            <>
              <Search className="size-3.5" />
              <span>Find My Booking</span>
            </>
          )}
        </button>
      </form>

      {booking && (
        <div className="space-y-4" aria-live="polite">
          {/* Booking summary */}
          <section className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Booking</div>
                <div className="font-mono text-lg font-bold text-white">{booking.trackingCode}</div>
                <div className="text-xs text-zinc-400">Hi {booking.clientName}</div>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
              <div>
                <dt className="text-zinc-500">Service</dt>
                <dd className="text-zinc-200">
                  {humanize(booking.category)} · {humanize(booking.discipline)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Package</dt>
                <dd className="text-zinc-200">{booking.serviceTier}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Deposit</dt>
                <dd className="text-zinc-200">
                  {money(booking.depositAmount)} ·{" "}
                  {booking.depositPaid ? "Paid" : "Awaiting payment / verification"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Payment method</dt>
                <dd className="text-zinc-200">
                  {booking.paymentMethod ? humanize(booking.paymentMethod) : "—"}
                </dd>
              </div>
            </dl>

            {booking.slot && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200">
                <CalendarClock className="size-4 text-amber-400 flex-shrink-0" />
                <span>
                  {formatDate(booking.slot.date)} · {booking.slot.startTime} – {booking.slot.endTime}
                </span>
              </div>
            )}
          </section>

          {/* Invoices */}
          {booking.invoices.length > 0 && (
            <section className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="size-4 text-amber-400" /> Invoices
              </h2>
              <ul className="divide-y divide-zinc-800/80">
                {booking.invoices.map((inv) => (
                  <li key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-mono text-zinc-200">{inv.invoiceNumber}</div>
                      <div className="text-zinc-500">
                        {humanize(inv.milestoneType)} · due {formatDate(inv.dueDate)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-zinc-200">{money(inv.amount)}</span>
                      <StatusBadge status={inv.status} />
                      {inv.payUrl && (
                        <Link
                          href={inv.payUrl}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-black font-semibold hover:bg-amber-400"
                        >
                          Pay <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Proposals */}
          {booking.proposals.length > 0 && (
            <section className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="size-4 text-amber-400" /> Proposals
              </h2>
              <ul className="divide-y divide-zinc-800/80">
                {booking.proposals.map((p) => (
                  <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-zinc-200">{p.title}</div>
                      <div className="font-mono text-zinc-500">
                        {p.proposalNumber} · {money(p.totalPrice)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.status} />
                      <Link href={p.url} className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold">
                        View <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Projects / Vault */}
          {booking.projects.length > 0 && (
            <section className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderLock className="size-4 text-amber-400" /> Projects &amp; Delivery Vault
              </h2>
              <ul className="divide-y divide-zinc-800/80">
                {booking.projects.map((p) => (
                  <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-zinc-200">{p.title}</div>
                      <div className="font-mono text-zinc-500">
                        {p.projectNumber} ·{" "}
                        {p.isFinalBalancePaid ? "Masters unlocked" : "Masters unlock after final balance"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.status} />
                      <Link href={p.vaultUrl} className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold">
                        Open Vault <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {booking.invoices.length === 0 &&
            booking.proposals.length === 0 &&
            booking.projects.length === 0 && (
              <p className="text-center text-xs text-zinc-500">
                No invoices, proposals or projects are linked to this booking yet. {tenantName} will
                add them here as your booking progresses.
              </p>
            )}
        </div>
      )}

      <div className="text-center">
        <Link
          href={`/${tenantSlug}`}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to {tenantName}
        </Link>
      </div>
    </div>
  );
}
