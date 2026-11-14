import { db } from "@/lib/db";
import { isSlotInPast, minutesOfDay } from "@/lib/slot-time";

/**
 * Slots staff can book a customer into from the Bookings page ("New booking"): open
 * (AVAILABLE) and not yet started in the studio's time zone, soonest first.
 *
 * Holds that have run out are released first, so a slot a client abandoned at checkout is
 * offered again. Plain server module (not "use server").
 */
export async function loadBookableSlots(tenantId: string, now: Date = new Date()) {
  await db.bookingSlot.updateMany({
    where: { tenantId, status: "HELD", heldUntil: { lt: now } },
    data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null },
  });

  const slots = await db.bookingSlot.findMany({
    where: { tenantId, status: "AVAILABLE" },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      category: true,
      campaignTitle: true,
      price: true,
      depositRequired: true,
      status: true,
    },
  });

  return slots
    .filter((slot) => !isSlotInPast(slot, now))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0),
    );
}
