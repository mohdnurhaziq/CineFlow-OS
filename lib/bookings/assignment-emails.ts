import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatSlotDate } from "@/lib/slot-time";
import { sendNotification } from "@/lib/notifications";

/**
 * Tells team members about the shoots they are on: put on one, one moved or was cancelled, taken off one.
 * Email only; a failed or skipped email never blocks the action that caused it.
 *
 * Not a "use server" module.
 */

export type AssignmentChange = {
  kind: "ASSIGNED" | "MOVED" | "CANCELLED" | "UNASSIGNED";
  /** MOVED: the old session, as text (e.g. "Mon, 1 Jun 2026, 10:00 AM – 11:00 AM"). */
  previous?: string;
  /** Who to tell. Default: everyone currently assigned. */
  userIds?: string[];
  /** ASSIGNED: the name of the person who made the assignment. */
  assignedByName?: string;
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
    const scheduleUrl = `${env.NEXT_PUBLIC_APP_URL}/${booking.tenant.slug}/admin/schedule`;
    const common = { studioName: booking.tenant.name, studioSlug: booking.tenant.slug, scheduleUrl, shootClientName: booking.clientName };

    const results: Array<"SENT" | "SKIPPED" | "FAILED"> = [];
    for (const person of people) {
      if (!person.email) continue;
      try {
        const to = { clientName: person.name, clientEmail: person.email };
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
                },
                "EMAIL"
              )
            : await sendNotification(
                {
                  event: "SHOOT_CHANGED",
                  ...common,
                  ...to,
                  kind: change.kind,
                  message:
                    change.kind === "MOVED"
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

/** Tells the booking's assignees (or `change.userIds`) about the change. Never throws. */
export async function notifyAssignees(bookingId: string, change: AssignmentChange): Promise<void> {
  await notifyAssigneesDetailed(bookingId, change);
}
