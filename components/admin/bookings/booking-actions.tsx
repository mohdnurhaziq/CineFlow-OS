"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, Clapperboard, Loader2, Mail, PackageCheck, UserX, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { BookingDetails } from "@/lib/bookings/details";
import { promoteBookingToProjectAction } from "@/lib/actions/admin-bookings";
import {
  cancelBooking,
  listRescheduleOptions,
  markBookingDelivered,
  recordSessionOutcome,
  rescheduleBooking,
  resendBookingConfirmation,
  type RescheduleOption,
} from "@/lib/actions/admin-booking-lifecycle";
import { formatSlotDate, isSlotInPast } from "@/lib/slot-time";

interface BookingActionsProps {
  booking: BookingDetails;
  tenantId: string;
  tenantSlug: string;
  /** Studio owner: may cancel a booking whose deposit was paid. */
  isOwner: boolean;
  /** Called after a change so the caller can reload the booking and list. */
  onChanged: () => void;
}

type Mode = null | "cancel" | "reschedule" | "deliver";

const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50";
const quiet = `${btn} border-zinc-700 text-zinc-200 hover:bg-zinc-800`;
const input =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";

/** What the studio can do with a booking from here: move, cancel, close out and deliver. */
export function BookingActions({ booking, tenantId, tenantSlug, isOwner, onChanged }: BookingActionsProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState(booking.deliveryUrl ?? "");
  const [options, setOptions] = useState<RescheduleOption[] | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ids = { tenantId, tenantSlug, bookingId: booking.id };
  const upcoming = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const started =
    !!booking.sessionDate && !!booking.slot && isSlotInPast({ date: booking.sessionDate, startTime: booking.slot.startTime });
  const canCancel = upcoming && (!booking.depositPaid || isOwner);

  const run = (fn: () => Promise<{ success: boolean; message?: string }>, done: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.success) {
        setError(res.message ?? "Something went wrong.");
        return;
      }
      toast.success(done);
      setMode(null);
      onChanged();
    });

  // Not "run": nothing on the booking changes, and the toast names who the email went to.
  const resendConfirmation = () =>
    start(async () => {
      setError(null);
      const res = await resendBookingConfirmation(ids);
      if (res.success) toast.success(`Confirmation emailed to ${res.sentTo}.`);
      else setError(res.message);
    });

  const openReschedule = () => {
    setMode("reschedule");
    setError(null);
    setOptions(null);
    start(async () => {
      const res = await listRescheduleOptions(ids);
      if (res.success) setOptions(res.slots);
      else setError(res.message);
    });
  };

  if (!upcoming && booking.status !== "COMPLETED" && booking.status !== "DELIVERED") return null;

  return (
    <section className="px-5 pb-5 space-y-3" aria-label="Booking actions">
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Actions</div>

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          {upcoming && (
            <button type="button" className={quiet} onClick={openReschedule}>
              <CalendarClock className="size-3.5" /> Move to another slot
            </button>
          )}
          {upcoming && (
            <button type="button" className={quiet} disabled={pending} onClick={resendConfirmation}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Resend confirmation email
            </button>
          )}
          {booking.status === "CONFIRMED" && started && (
            <>
              <button
                type="button"
                className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}
                disabled={pending}
                onClick={() => run(() => recordSessionOutcome({ ...ids, outcome: "COMPLETED" }), "Session marked as done.")}
              >
                <CheckCircle2 className="size-3.5" /> Mark session done
              </button>
              <button
                type="button"
                className={quiet}
                disabled={pending}
                onClick={() => run(() => recordSessionOutcome({ ...ids, outcome: "NO_SHOW" }), "Marked as a no-show.")}
              >
                <UserX className="size-3.5" /> Client didn&apos;t show
              </button>
            </>
          )}
          {(booking.status === "COMPLETED" || booking.status === "DELIVERED") && (
            <button type="button" className={`${btn} border-violet-500/40 text-violet-300 hover:bg-violet-500/10`} onClick={() => setMode("deliver")}>
              <PackageCheck className="size-3.5" /> {booking.status === "DELIVERED" ? "Update gallery link" : "Mark delivered"}
            </button>
          )}
          {booking.project ? (
            <Link
              href={`/${tenantSlug}/admin/projects/${booking.project.id}`}
              className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
            >
              <Clapperboard className="size-3.5" /> Project {booking.project.projectNumber}
              <ArrowUpRight className="size-3 ml-0.5" />
            </Link>
          ) : (
            (booking.status === "CONFIRMED" || booking.status === "COMPLETED") && (
              <button
                type="button"
                className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
                disabled={pending}
                onClick={() =>
                  run(
                    () => promoteBookingToProjectAction({ tenantId, tenantSlug, bookingId: booking.id }),
                    "Booking promoted to Project."
                  )
                }
              >
                <Clapperboard className="size-3.5" /> Promote to Project
              </button>
            )
          )}
          {upcoming &&
            (canCancel ? (
              <button type="button" className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`} onClick={() => setMode("cancel")}>
                <XCircle className="size-3.5" /> Cancel booking
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500 self-center">Only the studio owner can cancel a paid booking.</p>
            ))}
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-2">
          <label htmlFor="cancel-reason" className="text-xs text-zinc-300 block">
            Why is it being cancelled? The client sees this.
          </label>
          <textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
          <p className="text-[11px] text-zinc-500">
            The slot reopens and anything unpaid is cancelled.
            {booking.depositPaid ? " The paid deposit stays on record: refund it outside the app if needed." : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setMode(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${btn} bg-red-600 border-red-600 text-white hover:bg-red-500`}
              onClick={() => run(() => cancelBooking({ ...ids, reason }), "Booking cancelled.")}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Cancel booking
            </button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="space-y-2">
          <label htmlFor="reschedule-slot" className="text-xs text-zinc-300 block">
            Move to an open slot in the same category
          </label>
          {options === null ? (
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Loading open slots…
            </div>
          ) : options.length === 0 ? (
            <p className="text-xs text-zinc-400">No open slots in this category. Open one in the Calendar first.</p>
          ) : (
            <select id="reschedule-slot" value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
              <option value="">Choose a slot…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {formatSlotDate(o.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {o.startTime} – {o.endTime}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setMode(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={pending || !target}
              className={`${btn} bg-amber-500 border-amber-500 text-black hover:bg-amber-400`}
              onClick={() => run(() => rescheduleBooking({ ...ids, newSlotId: target }), "Booking moved. The client has been told.")}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Move booking
            </button>
          </div>
        </div>
      )}

      {mode === "deliver" && (
        <div className="space-y-2">
          <label htmlFor="delivery-link" className="text-xs text-zinc-300 block">
            Link to the client&apos;s photos (optional)
          </label>
          <input
            id="delivery-link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://… (Google Drive, Pixieset, Dropbox)"
            className={input}
          />
          <p className="text-[11px] text-zinc-500">The client is notified and sees the link in their account.</p>
          <div className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setMode(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${btn} bg-violet-500 border-violet-500 text-white hover:bg-violet-400`}
              onClick={() => run(() => markBookingDelivered({ ...ids, deliveryUrl: link }), "Marked as delivered.")}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Mark delivered
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
