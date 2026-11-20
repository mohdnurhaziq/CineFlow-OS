import { db } from "@/lib/db";
import { buildInvite, inviteSequence, slotTimes, type CalendarInvite } from "@/lib/calendar/ics";
import { platformSenderAddress } from "@/lib/notifications";
import { studioUrl } from "@/lib/domain-name";

/**
 * The calendar invites for a booking's session: one event for the client and one per shooter,
 * sent with the emails they already get (docs/superpowers/specs/2026-11-20-calendar-invites-design.md).
 *
 * Only confirmed bookings with a session time have an event. REQUEST adds or moves it, CANCEL
 * removes it. Builders return null rather than throw: an invite never blocks the booking action.
 * Not a "use server" module.
 */

export type InviteMethod = CalendarInvite["method"];

/** What an invite needs from a booking, read before a change when the change removes it (a cancel). */
export interface BookingForInvite {
  id: string;
  status: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  discipline: string;
  packageName: string | null;
  trackingCode: string;
  creativeBrief: string | null;
  slot: { date: Date; startTime: string; endTime: string } | null;
  tenant: { name: string; slug: string };
}

const UID_HOST = "cineflow-os";

/** The booking as invites need it, or null if there is none. */
export async function loadBookingForInvite(bookingId: string): Promise<BookingForInvite | null> {
  return db.clientBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      discipline: true,
      packageName: true,
      trackingCode: true,
      creativeBrief: true,
      slot: { select: { date: true, startTime: true, endTime: true } },
      tenant: { select: { name: true, slug: true } },
    },
  });
}

/** The booking's session as instants, if it is confirmed and has a readable time. */
function sessionTimes(b: BookingForInvite) {
  if (b.status !== "CONFIRMED" || !b.slot) return null;
  return slotTimes(b.slot);
}

function sessionKind(discipline: string): string {
  if (discipline === "VIDEOGRAPHY") return "Video session";
  if (discipline === "HYBRID") return "Photo & video session";
  return "Photo session";
}

/** The client's event: "Photo session with <studio>", with the package, reference and their account link. */
export function clientInviteFor(
  b: BookingForInvite,
  method: InviteMethod,
  to: { name: string; email: string } = { name: b.clientName, email: b.clientEmail }
): CalendarInvite | null {
  try {
    const times = sessionTimes(b);
    if (!times || !to.email) return null;
    const account = studioUrl(b.tenant.slug, "/account");
    return buildInvite(
      {
        uid: `booking-${b.id}-client@${UID_HOST}`,
        sequence: inviteSequence(),
        title: `${sessionKind(b.discipline)} with ${b.tenant.name}`,
        description: [`Package: ${b.packageName || "Studio session"}`, `Booking ref: ${b.trackingCode}`, `Your booking: ${account}`].join("\n"),
        start: times.start,
        end: times.end,
        organizerName: b.tenant.name,
        organizerEmail: platformSenderAddress(),
        attendeeName: to.name,
        attendeeEmail: to.email,
        url: account,
      },
      method
    );
  } catch (err) {
    console.error("Client calendar invite failed:", err);
    return null;
  }
}

/** The client's invite for a booking as it is now (null when it has no event). Never throws. */
export async function clientInvite(
  bookingId: string,
  method: InviteMethod,
  to?: { name: string; email: string }
): Promise<CalendarInvite | null> {
  try {
    const b = await loadBookingForInvite(bookingId);
    return b ? clientInviteFor(b, method, to) : null;
  } catch (err) {
    console.error("Client calendar invite failed:", err);
    return null;
  }
}

/** A shooter's event: "Shoot: <client> (<package>)", with the client's phone, the brief and the booking's admin page. */
export function shooterInviteFor(
  b: BookingForInvite,
  person: { id: string; name: string; email: string },
  method: InviteMethod
): CalendarInvite | null {
  try {
    const times = sessionTimes(b);
    if (!times || !person.email) return null;
    const bookingPage = studioUrl(b.tenant.slug, `/admin/bookings/${b.id}`);
    return buildInvite(
      {
        uid: `booking-${b.id}-shooter-${person.id}@${UID_HOST}`,
        sequence: inviteSequence(),
        title: b.packageName ? `Shoot: ${b.clientName} (${b.packageName})` : `Shoot: ${b.clientName}`,
        description: [
          `Client: ${b.clientName}`,
          b.clientPhone ? `Phone: ${b.clientPhone}` : "",
          b.creativeBrief?.trim() ? `Brief: ${b.creativeBrief.trim()}` : "",
          `Booking: ${bookingPage}`,
        ]
          .filter(Boolean)
          .join("\n"),
        start: times.start,
        end: times.end,
        organizerName: b.tenant.name,
        organizerEmail: platformSenderAddress(),
        attendeeName: person.name,
        attendeeEmail: person.email,
        url: bookingPage,
      },
      method
    );
  } catch (err) {
    console.error("Shooter calendar invite failed:", err);
    return null;
  }
}
