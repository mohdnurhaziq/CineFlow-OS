import { db } from "@/lib/db";

/**
 * Releases slots held by unpaid deposits.
 *
 * A QR or cash booking holds its slot while the deposit is outstanding, for at most
 * DEPOSIT_HOLD_HOURS. After that, if no payment proof was submitted (no QR slip, or
 * cash never recorded) the booking is cancelled, its slot reopens and the deposit
 * invoice is voided. A booking whose slip is waiting for the studio's review is kept.
 * Online (card/FPX) bookings have their own short gateway hold and are not touched.
 *
 * There is no background scheduler, so this runs lazily wherever slots or bookings
 * are shown (booking page, admin pages, client account). Idempotent.
 *
 * Not a "use server" module.
 */

export const DEPOSIT_HOLD_HOURS = 24;

export async function expireUnpaidDeposits(tenantId: string, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DEPOSIT_HOLD_HOURS * 3_600_000);

  const stale = await db.clientBooking.findMany({
    where: {
      tenantId,
      status: "PENDING",
      depositPaid: false,
      paymentMethod: { in: ["QR_CODE", "CASH"] },
      createdAt: { lt: cutoff },
      // Its deposit is still unverified and nobody has submitted proof of payment.
      invoices: {
        some: { milestoneType: "BOOKING_DEPOSIT", status: "PENDING_VERIFICATION", paymentProofUrl: null },
        none: { milestoneType: "BOOKING_DEPOSIT", OR: [{ status: "PAID" }, { paymentProofUrl: { not: null } }] },
      },
    },
    select: { id: true, slotId: true },
  });

  let cancelled = 0;
  for (const booking of stale) {
    await db.$transaction(async (tx) => {
      // Re-check inside the transaction so a payment approved meanwhile wins.
      const claimed = await tx.clientBooking.updateMany({
        where: { id: booking.id, status: "PENDING", depositPaid: false },
        data: { status: "CANCELLED", slotId: null },
      });
      if (claimed.count !== 1) return;

      await tx.milestoneInvoice.updateMany({
        where: { bookingId: booking.id, milestoneType: "BOOKING_DEPOSIT", status: "PENDING_VERIFICATION", paymentProofUrl: null },
        data: { status: "VOID", verifiedBy: `System: deposit not paid within ${DEPOSIT_HOLD_HOURS} hours` },
      });
      if (booking.slotId) {
        await tx.bookingSlot.updateMany({
          where: { id: booking.slotId, status: "PENDING_VERIFICATION" },
          data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null },
        });
      }
      cancelled += 1;
    });
  }
  return cancelled;
}
