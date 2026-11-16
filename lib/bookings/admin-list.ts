import { db } from "@/lib/db";
import { levelAtLeast, type AccessMap } from "@/lib/auth/access";
import { loadBookingDetails, type BookingDetails } from "@/lib/bookings/details";

export { isUnassigned } from "@/lib/bookings/unassigned";

/** Who is looking at a list: their id (for "Only their own") and their access. */
export interface ListViewer {
  id: string;
  access: AccessMap;
}

/**
 * The Bookings page list: every booking of the studio (newest first) for Bookings VIEW and up,
 * only the bookings they are assigned to at OWN, nothing without Bookings access. Prices, amounts
 * and invoices only with Invoices VIEW.
 *
 * Not a "use server" module: callers must authorize first.
 */
export async function loadAdminBookings(tenantId: string, viewer: ListViewer): Promise<BookingDetails[]> {
  const level = viewer.access.areas.bookings;
  if (level === "NONE") return [];
  const money = levelAtLeast(viewer.access.areas.invoices, "VIEW");
  if (levelAtLeast(level, "VIEW")) return loadBookingDetails(tenantId, { money });
  // loadBookingDetails keeps to this studio's bookings, whatever the assignment rows say.
  const assigned = await db.bookingAssignment.findMany({
    where: { userId: viewer.id, booking: { tenantId } },
    select: { bookingId: true },
  });
  if (assigned.length === 0) return [];
  return loadBookingDetails(tenantId, { bookingIds: assigned.map((a) => a.bookingId), money });
}
