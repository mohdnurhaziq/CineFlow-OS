"use client";

import { useMemo, useState } from "react";
import { Search, CalendarCheck, Inbox } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BookingDetails } from "@/lib/bookings/details";
import {
  BookingDetailsDialog,
  BookingStageBadge,
  bookingStage,
  formatSessionDate,
  formatPaymentMethod,
} from "./booking-details-dialog";

type FilterId = "upcoming" | "verify" | "confirmed" | "past" | "cancelled" | "all";

interface BookingsConsoleProps {
  tenantSlug: string;
  currency: string;
  bookings: BookingDetails[];
  /** Today's date (YYYY-MM-DD), computed on the server so the first render matches. */
  today: string;
}

/** "09:00 AM" -> minutes since midnight, for ordering sessions within a day. */
function minutesOf(time: string | undefined): number {
  const m = time?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[3]?.toUpperCase() === "PM") h += 12;
  if (!m[3] && Number(m[1]) === 12) h = 12;
  return h * 60 + Number(m[2]);
}

function sessionKey(b: BookingDetails): string {
  return `${b.sessionDate ?? "0000-00-00"} ${String(minutesOf(b.slot?.startTime)).padStart(4, "0")}`;
}

export function BookingsConsole({ tenantSlug, currency, bookings, today }: BookingsConsoleProps) {
  // Open on whatever needs the owner's attention first.
  const [filter, setFilter] = useState<FilterId>(() =>
    bookings.some((b) => ["VERIFYING", "BALANCE_VERIFYING"].includes(bookingStage(b))) ? "verify" : "upcoming"
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BookingDetails | null>(null);

  const groups = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "CANCELLED");
    const isUpcoming = (b: BookingDetails) => !!b.sessionDate && b.sessionDate >= today;
    return {
      upcoming: active.filter(isUpcoming),
      verify: bookings.filter((b) => ["VERIFYING", "BALANCE_VERIFYING"].includes(bookingStage(b))),
      confirmed: bookings.filter((b) => b.status === "CONFIRMED"),
      past: active.filter((b) => !isUpcoming(b)),
      cancelled: bookings.filter((b) => b.status === "CANCELLED"),
      all: bookings,
    } satisfies Record<FilterId, BookingDetails[]>;
  }, [bookings, today]);

  const tabs: { id: FilterId; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "verify", label: "Needs verification" },
    { id: "confirmed", label: "Confirmed" },
    { id: "past", label: "Past" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All" },
  ];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? groups[filter].filter((b) =>
          [b.clientName, b.clientEmail, b.clientPhone, b.trackingCode, b.invoice?.invoiceNumber ?? ""].some((v) =>
            v.toLowerCase().includes(q)
          )
        )
      : groups[filter];
    // Soonest first for what's ahead; most recent first for everything else.
    const ascending = filter === "upcoming" || filter === "verify";
    return [...matches].sort((a, b) =>
      ascending ? sessionKey(a).localeCompare(sessionKey(b)) : sessionKey(b).localeCompare(sessionKey(a))
    );
  }, [groups, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <CalendarCheck className="size-6 text-amber-400" />
            Bookings
          </h1>
          <p className="text-xs text-zinc-400">
            Every client booking with contact details, brief and deposit status. Select a booking to see everything.
          </p>
        </div>

        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search bookings</span>
          <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email, phone or code"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Filter bookings" className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {tabs.map((t) => {
          const active = filter === t.id;
          const count = groups[t.id].length;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border whitespace-nowrap transition-colors ${
                active
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-zinc-800"
              }`}
            >
              {t.label}
              <span
                className={`px-1.5 rounded-full text-[10px] tabular-nums ${
                  t.id === "verify" && count > 0 ? "bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.1fr_1.4fr_1fr_1fr_10rem] gap-4 px-5 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          <span>Session</span>
          <span>Client</span>
          <span>Tracking code</span>
          <span>Deposit</span>
          <span className="text-right">Status</span>
        </div>

        {visible.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-2">
            <Inbox className="size-8 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-300">
              {query ? "No bookings match your search." : "No bookings here yet."}
            </p>
            {!query && filter === "upcoming" && (
              <p className="text-xs text-zinc-500">New bookings from your booking page will appear here.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {visible.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelected(b)}
                  className="w-full text-left px-5 py-3.5 grid grid-cols-[1fr_auto] md:grid-cols-[1.1fr_1.4fr_1fr_1fr_10rem] gap-x-4 gap-y-1.5 items-center hover:bg-zinc-900/60 focus-visible:bg-zinc-900/60 focus-visible:outline-none transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-white">{formatSessionDate(b.sessionDate)}</span>
                    <span className="block text-[11px] font-mono text-zinc-400">
                      {b.slot ? `${b.slot.startTime} – ${b.slot.endTime}` : "Slot released"}
                    </span>
                  </span>

                  <span className="md:hidden justify-self-end">
                    <BookingStageBadge booking={b} />
                  </span>

                  <span className="min-w-0 col-span-2 md:col-span-1">
                    <span className="block text-xs text-zinc-200 truncate">{b.clientName}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">{b.clientEmail}</span>
                  </span>

                  <span className="hidden md:block text-[11px] font-mono text-amber-400/90 truncate">{b.trackingCode}</span>

                  <span className="min-w-0 col-span-2 md:col-span-1 text-[11px] text-zinc-400">
                    <span className="text-zinc-200">{formatCurrency(b.depositAmount, currency)}</span>
                    <span className="text-zinc-500"> · {formatPaymentMethod(b.paymentMethod)}</span>
                  </span>

                  <span className="hidden md:block justify-self-end">
                    <BookingStageBadge booking={b} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BookingDetailsDialog
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        tenantSlug={tenantSlug}
        currency={currency}
        booking={selected}
      />
    </div>
  );
}
