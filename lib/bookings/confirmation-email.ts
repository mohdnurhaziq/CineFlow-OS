import { db } from "@/lib/db";
import { sendNotification, type NotificationResult } from "@/lib/notifications";
import { formatSlotDate } from "@/lib/slot-time";
import { clientInvitePath, issueClientInvite } from "@/lib/auth/invite";

/**
 * Emails the customer their booking confirmation (reference, package, session, deposit).
 * Used for bookings customers make online and bookings staff make on their behalf.
 *
 * Never throws: a delivery problem must not undo a booking. Without RESEND_API_KEY the
 * email is skipped (see sendNotification). Plain server module, not "use server".
 */
export async function sendBookingConfirmation(bookingId: string): Promise<NotificationResult | null> {
  try {
    const booking = await db.clientBooking.findUnique({
      where: { id: bookingId },
      include: { slot: true, tenant: { select: { name: true, slug: true, currency: true } } },
    });
    if (!booking?.clientEmail) return null;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const slug = booking.tenant.slug;

    // Where "view my booking" goes. A customer account the studio created has no password yet:
    // the link carries a one-time invite to set one, then opens the account (as proposals do).
    const account = booking.userId
      ? await db.user.findUnique({ where: { id: booking.userId }, select: { id: true, email: true, passwordHash: true } })
      : null;
    let link: string;
    let linkLabel: string;
    if (account && !account.passwordHash) {
      link = clientInvitePath(slug, account.email, await issueClientInvite(account.id), `/${slug}/account`);
      linkLabel = "Set your password & view booking";
    } else if (account) {
      link = `/${slug}/account`;
      linkLabel = "View my booking";
    } else {
      link = `/${slug}/my-booking?code=${encodeURIComponent(booking.trackingCode)}`;
      linkLabel = "View my booking";
    }
    // Slot dates are calendar days stored as midnight UTC: formatSlotDate keeps the day from shifting.
    const day = booking.slot?.date ?? (booking.targetDate ? new Date(`${booking.targetDate}T00:00:00Z`) : null);

    return await sendNotification({
      event: "BOOKING_CONFIRMED",
      studioName: booking.tenant.name,
      studioSlug: slug,
      clientName: booking.clientName,
      clientEmail: booking.clientEmail,
      clientPhone: booking.clientPhone || undefined,
      packageName: booking.packageName || "Studio session",
      slotDate: day ? formatSlotDate(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "To be scheduled",
      startTime: booking.slot?.startTime ?? "",
      endTime: booking.slot?.endTime ?? "",
      depositAmount: booking.depositAmount,
      depositPaid: booking.depositPaid,
      currency: booking.tenant.currency,
      trackingCode: booking.trackingCode,
      bookingUrl: `${appUrl}${link}`,
      bookingLinkLabel: linkLabel,
    });
  } catch (err) {
    console.error("Booking confirmation email failed:", err);
    return null;
  }
}
