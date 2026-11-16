"use client";

import { chipClass, chipCountClass, chipListClass } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";
import { useMemo, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Search, CalendarCheck, Inbox, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { assignTeamMember } from "@/lib/actions/admin-assignments";
import { isUnassigned } from "@/lib/bookings/unassigned";
import type { AssignableMember } from "@/lib/team/members";
import { AssignDialog } from "./assign-dialog";
import { emailNote } from "./assign-email-note";
import { NewBookingDialog } from "./new-booking-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import type { BookingDetails } from "@/lib/bookings/details";
import type { BookingActionPowers } from "@/lib/auth/page-powers";
import {
  BookingDetailsDialog,
  BookingStageBadge,
  bookingStage,
  formatSessionDate,
  formatPaymentMethod,
} from "./booking-details-dialog";

export type FilterId = "upcoming" | "unassigned" | "verify" | "confirmed" | "past" | "cancelled" | "all";

interface BookingsConsoleProps {
  tenantSlug: string;
  currency: string;
  bookings: BookingDetails[];
  /** Today's date (YYYY-MM-DD), computed on the server so the first render matches. */
  today: string;
  /** Opens on this chip (the Overview links to "unassigned"). */
  initialFilter?: FilterId;
  tenantId: string;
  /** Bookings MANAGE: new bookings, moving and cancelling. */
  canManage: boolean;
  /** The recordPayments permission: may record a booking as paid and cancel paid bookings. */
  canRecordPayments: boolean;
  /** Mark done / no-show and create the gallery, in a booking's details. */
  actionPowers: BookingActionPowers;
  /** The owner and active team members, for the Assign picker. */
  assignable: AssignableMember[];
  /** Data for "New booking" (book a customer into an open session). */
  newBooking: Omit<
    ComponentProps<typeof NewBookingDialog>,
    "isOpen" | "onClose" | "onBooked" | "tenantId" | "tenantSlug" | "currency" | "canRecordPayments"
  >;
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

export function BookingsConsole({
  tenantSlug,
  currency,
  bookings,
  today,
  initialFilter,
  tenantId,
  canManage,
  canRecordPayments,
  actionPowers,
  assignable,
  newBooking,
}: BookingsConsoleProps) {
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  // Open on whatever needs the owner's attention first.
  const [filter, setFilter] = useState<FilterId>(() =>
    initialFilter ??
    (bookings.some((b) => ["VERIFYING", "BALANCE_VERIFYING"].includes(bookingStage(b))) ? "verify" : "upcoming")
  );
  const [query, setQuery] = useState("");
  // Track the open booking by id so it shows fresh data after an action refreshes the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? bookings.find((b) => b.id === selectedId) ?? null : null;
  const router = useRouter();
  // Ticked rows for "Assign" (Bookings MANAGE only).
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const groups = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "CANCELLED");
    const isUpcoming = (b: BookingDetails) => !!b.sessionDate && b.sessionDate >= today;
    return {
      upcoming: active.filter(isUpcoming),
      unassigned: bookings.filter((b) => isUnassigned(b, today)),
      verify: bookings.filter((b) => ["VERIFYING", "BALANCE_VERIFYING"].includes(bookingStage(b))),
      confirmed: bookings.filter((b) => b.status === "CONFIRMED"),
      past: active.filter((b) => !isUpcoming(b)),
      cancelled: bookings.filter((b) => b.status === "CANCELLED"),
      all: bookings,
    } satisfies Record<FilterId, BookingDetails[]>;
  }, [bookings, today]);

  const tabs: { id: FilterId; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "unassigned", label: "Unassigned" },
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
    const ascending = filter === "upcoming" || filter === "unassigned" || filter === "verify";
    return [...matches].sort((a, b) =>
      ascending ? sessionKey(a).localeCompare(sessionKey(b)) : sessionKey(b).localeCompare(sessionKey(a))
    );
  }, [groups, filter, query]);

  const selectFilter = (id: FilterId) => {
    setFilter(id);
    setTicked(new Set());
  };
  const allTicked = visible.length > 0 && visible.every((b) => ticked.has(b.id));
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const columns = "md:grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_10rem]";

  const assignTicked = async (userId: string): Promise<string | null> => {
    const ids = visible.filter((b) => ticked.has(b.id)).map((b) => b.id);
    const res = await assignTeamMember({ tenantId, tenantSlug, bookingIds: ids, userId });
    if (!res.success) return res.message;
    const name = assignable.find((p) => p.id === userId)?.name ?? "They";
    toast.success(
      `${name} assigned to ${res.assigned} booking${res.assigned === 1 ? "" : "s"}.` +
        (res.skipped > 0 ? ` ${res.skipped} skipped.` : "") +
        emailNote(res.emailDelivery)
    );
    setAssignOpen(false);
    setTicked(new Set());
    router.refresh();
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarCheck}
        title="Bookings"
        description="Every client booking with contact details, brief and deposit status. Select a booking to see everything."
        actions={
          <>
        {canManage && (
          <button
            type="button"
            onClick={() => setNewBookingOpen(true)}
            className={cn(buttonVariants(), "shrink-0")}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New booking
          </button>
        )}
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search bookings</span>
          <Search className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTicked(new Set());
            }}
            placeholder="Name, email, phone or code"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </label>
          </>
        }
      />

      <NewBookingDialog
        isOpen={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onBooked={() => router.refresh()}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        canRecordPayments={canRecordPayments}
        {...newBooking}
      />

      <div role="tablist" aria-label="Filter bookings" className={chipListClass}>
        {tabs.map((t) => {
          const active = filter === t.id;
          const count = groups[t.id].length;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectFilter(t.id)}
              className={chipClass(active)}
            >
              {t.label}
              <span
                className={chipCountClass(active, t.id === "verify" && count > 0)}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {canManage && ticked.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <span className="text-xs text-amber-200">{ticked.size} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTicked(new Set())} className={buttonVariants({ variant: "secondary" })}>
              Clear
            </button>
            <button type="button" onClick={() => setAssignOpen(true)} className={buttonVariants()}>
              <UserPlus className="size-3.5" aria-hidden="true" />
              Assign
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
        <div className="hidden md:flex items-center">
          {canManage && (
            <label className="w-11 shrink-0 flex items-center justify-center py-2.5 border-b border-zinc-800">
              <span className="sr-only">Select all shown bookings</span>
              <input
                type="checkbox"
                checked={allTicked}
                disabled={visible.length === 0}
                onChange={() => setTicked(allTicked ? new Set() : new Set(visible.map((b) => b.id)))}
                className="accent-amber-500"
              />
            </label>
          )}
          <div
            className={cn(
              "flex-1 grid gap-4 py-2.5 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-widest text-zinc-500",
              canManage ? "pr-5" : "px-5",
              columns
            )}
          >
            <span>Session</span>
            <span>Client</span>
            <span>Tracking code</span>
            <span>Deposit</span>
            <span>Team</span>
            <span className="text-right">Status</span>
          </div>
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
              <li key={b.id} className="flex items-stretch">
                {canManage && (
                  <label className="w-11 shrink-0 flex items-center justify-center cursor-pointer">
                    <span className="sr-only">Select booking for {b.clientName}</span>
                    <input type="checkbox" checked={ticked.has(b.id)} onChange={() => toggle(b.id)} className="accent-amber-500" />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={cn("flex-1 min-w-0 text-left py-3.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 items-center hover:bg-zinc-900/60 focus-visible:bg-zinc-900/60 focus-visible:outline-none transition-colors", canManage ? "pr-5" : "px-5", columns)}
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
                    {b.money && (
                      <>
                        <span className="text-zinc-200">{formatCurrency(b.depositAmount, currency)}</span>
                        <span className="text-zinc-500"> · {formatPaymentMethod(b.paymentMethod)}</span>
                      </>
                    )}
                  </span>

                  <span className="min-w-0 col-span-2 md:col-span-1 text-[11px] text-zinc-400 truncate">
                    <span className="md:hidden text-zinc-500">Team: </span>
                    {b.assignees.length > 0 ? b.assignees.map((a) => a.name.split(" ")[0]).join(", ") : "—"}
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
        onClose={() => setSelectedId(null)}
        tenantSlug={tenantSlug}
        currency={currency}
        booking={selected}
        tenantId={tenantId}
        canManage={canManage}
        canRecordPayments={canRecordPayments}
        actionPowers={actionPowers}
        assignable={assignable}
        onChanged={() => router.refresh()}
      />

      {canManage && (
        <AssignDialog
          isOpen={assignOpen}
          onClose={() => setAssignOpen(false)}
          people={assignable}
          title={`Assign ${ticked.size} booking${ticked.size === 1 ? "" : "s"}`}
          description="Pick one person. They will be emailed each booking."
          onAssign={assignTicked}
        />
      )}
    </div>
  );
}
