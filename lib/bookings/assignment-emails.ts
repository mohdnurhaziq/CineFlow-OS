import { db } from "@/lib/db";
import { formatSlotDate } from "@/lib/slot-time";
import { sendNotification } from "@/lib/notifications";
import { studioUrl } from "@/lib/domain-name";
import { shooterInviteFor, type BookingForInvite } from "@/lib/bookings/calendar-invites";

/**
 * Tells team members about the shoots they are on: put on one, one confirmed, moved or cancelled, taken off one.
 * Email only; a failed or skipped email never blocks the action that caused it. For a confirmed
 * booking with a session time, the email carries the shoot as a calendar invite (lib/bookings/calendar-invites.ts).
 *
 * Not a "use server" module.
 */

export type AssignmentChange = {
  /** CONFIRMED: the deposit was paid; the shoot goes into the calendars of those already on it. */
  kind: "ASSIGNED" | "CONFIRMED" | "MOVED" | "CANCELLED" | "UNASSIGNED";
  /** MOVED: the old session, as text (e.g. "Mon, 1 Jun 2026, 10:00 AM – 11:00 AM"). */
  previous?: string;
  /** Who to tell. Default: everyone currently assigned. */
  userIds?: string[];
  /** ASSIGNED: the name of the person who made the assignment. */
  assignedByName?: string;
  /** CANCELLED: the booking as it was before the cancel (which lets go of its slot), to remove the right event. */
  before?: BookingForInvite;
};

/** NONE: nobody needed telling (no assignees, or only the person who made the change). */
export type AssigneeEmailSummary = "SENT" | "SKIPPED" | "FAILED" | "NONE";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

/** "Mon, 1 Jun 2026, 10:00 AM – 11:00 AM", for a booking's slot. */
export function sessionText(slot: { date: Date; startTime: string; endTime: string } | null): string {
  return slot ? `${formatSlotDate(slot.date, DATE_FORMAT)}, ${slot.startTime} – ${slot.endTime}` : "your session";
}

/** SENT if all sent, FAILED if any failed, SKIPPED if email isn't set up, NONE if there was nobody to tell. */
export function summariseDelivery(results: Array<"SENT" | "SKIPPED" | "FAILED" | "NONE">): AssigneeEmailSummary {
  const real = results.filter((r) => r !== "NONE") as Array<"SENT" | "SKIPPED" | "FAILED">;
  if (real.length === 0) return "NONE";
  if (real.includes("FAILED")) return "FAILED";
  if (real.every((r) => r === "SENT")) return "SENT";
  return "SKIPPED";
}

/** Sends the emails and says how they went. Never throws. */
export async function notifyAssigneesDetailed(bookingId: string, change: AssignmentChange): Promise<AssigneeEmailSummary> {
  try {
    const booking = await db.clientBooking.findUnique({
      where: { id: bookingId },
      include: { slot: true, tenant: { select: { name: true, slug: true } } },
    });
    if (!booking) return "NONE";

    const ids =
      change.userIds ??
      (await db.bookingAssignment.findMany({ where: { bookingId, tenantId: booking.tenantId }, select: { userId: true } })).map((a) => a.userId);
    if (ids.length === 0) return "NONE";
    // Only people still on this studio's team: a removed member is never emailed.
    const people = await db.user.findMany({
      where: { id: { in: ids }, tenantId: booking.tenantId, deactivatedAt: null },
      select: { id: true, name: true, email: true },
    });

    const date = booking.slot
      ? formatSlotDate(booking.slot.date, DATE_FORMAT)
      : booking.targetDate
        ? formatSlotDate(booking.targetDate, DATE_FORMAT)
        : "the date to be confirmed";
    const scheduleUrl = studioUrl(booking.tenant.slug, "/admin/schedule");
    const common = { studioName: booking.tenant.name, studioSlug: booking.tenant.slug, scheduleUrl, shootClientName: booking.clientName };

    const results: Array<"SENT" | "SKIPPED" | "FAILED"> = [];
    for (const person of people) {
      if (!person.email) continue;
      try {
        const to = { clientName: person.name, clientEmail: person.email };
        const calendar =
          shooterInviteFor(
            change.kind === "CANCELLED" ? (change.before ?? booking) : booking,
            person,
            change.kind === "CANCELLED" || change.kind === "UNASSIGNED" ? "CANCEL" : "REQUEST"
          ) ?? undefined;
        // "It's in your calendar" is only true with an invite to carry.
        if (change.kind === "CONFIRMED" && !calendar) continue;
        const result =
          change.kind === "ASSIGNED"
            ? await sendNotification(
                {
                  event: "SHOOT_ASSIGNED",
                  ...common,
                  ...to,
                  assignerName: change.assignedByName ?? "Your studio",
                  date,
                  startTime: booking.slot?.startTime ?? "time to be confirmed",
                  endTime: booking.slot?.endTime ?? "",
                  packageName: booking.packageName ?? undefined,
                  brief: booking.creativeBrief?.trim() || undefined,
                  calendar,
                },
                "EMAIL"
              )
            : await sendNotification(
                {
                  event: "SHOOT_CHANGED",
                  ...common,
                  ...to,
                  kind: change.kind,
                  calendar,
                  message:
                    change.kind === "CONFIRMED"
                      ? `${booking.clientName}'s session on ${sessionText(booking.slot)} is confirmed. It's in your calendar.`
                      : change.kind === "MOVED"
                      ? `${booking.clientName}'s session moved from ${change.previous ?? "its earlier time"} to ${sessionText(booking.slot)}.`
                      : change.kind === "CANCELLED"
                        ? `${booking.clientName}'s session on ${date} was cancelled.`
                        : `You're no longer on ${booking.clientName}'s session on ${date}.`,
                },
                "EMAIL"
              );
        results.push(result.emailDelivery);
      } catch (e) {
        console.error("Assignment email failed:", e);
        results.push("FAILED");
      }
    }
    return summariseDelivery(results);
  } catch (e) {
    console.error("Assignment emails failed:", e);
    return "FAILED";
  }
}

/**
 * A booking was just confirmed: those on the shoot at this moment get it in their calendar. The list is
 * taken now, so someone assigned a moment later gets their invite from the assignment instead, not twice.
 * The emails go out in the background. Never throws.
 */
export async function notifyShootConfirmed(bookingId: string): Promise<void> {
  try {
    const userIds = (await db.bookingAssignment.findMany({ where: { bookingId }, select: { userId: true } })).map((a) => a.userId);
    if (userIds.length > 0) void notifyAssigneesDetailed(bookingId, { kind: "CONFIRMED", userIds });
  } catch (e) {
    console.error("Shoot confirmed emails failed:", e);
  }
}

/** Tells the booking's assignees (or `change.userIds`) about the change. Never throws. */
export async function notifyAssignees(bookingId: string, change: AssignmentChange): Promise<void> {
  await notifyAssigneesDetailed(bookingId, change);
}
