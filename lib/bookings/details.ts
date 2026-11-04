import { db } from "@/lib/db";

/**
 * Booking details for the studio admin (Bookings page and calendar drill-down).
 *
 * Not a "use server" module: callers must authorize first. Pages under /admin are
 * guarded by the admin layout; the server action wrapper calls requireStaff.
 */

export interface BookingInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  amount: number;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  verifiedBy: string | null;
  paidAt: string | null;
}

export interface BookingDetails {
  id: string;
  trackingCode: string;
  status: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  category: string;
  discipline: string;
  serviceTier: string;
  creativeBrief: string | null;
  paymentMethod: string | null;
  depositAmount: number;
  depositPaid: boolean;
  createdAt: string;
  /** Session date as YYYY-MM-DD (the slot's date, or the requested date if the slot was released). */
  sessionDate: string | null;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    campaignTitle: string | null;
    price: number;
  } | null;
  invoice: BookingInvoiceSummary | null;
}

// A booking and its deposit invoice are written in the same transaction.
const SAME_TRANSACTION_MS = 5 * 60 * 1000;

export async function loadBookingDetails(
  tenantId: string,
  opts: { bookingId?: string } = {}
): Promise<BookingDetails[]> {
  const bookings = await db.clientBooking.findMany({
    where: { tenantId, ...(opts.bookingId ? { id: opts.bookingId } : {}) },
    include: { slot: true },
    orderBy: { createdAt: "desc" },
  });
  if (bookings.length === 0) return [];

  const clientIds = [...new Set(bookings.map((b) => b.userId).filter((id): id is string => !!id))];
  const invoices = clientIds.length
    ? await db.milestoneInvoice.findMany({
        where: { tenantId, milestoneType: "BOOKING_DEPOSIT", clientId: { in: clientIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // The schema has no booking<->invoice foreign key. Match on the tracking code when the
  // invoice reference carries it, otherwise on the same client within the same transaction.
  const used = new Set<string>();
  const matched = new Map<string, (typeof invoices)[number]>();
  for (const b of bookings) {
    const inv = invoices.find((i) => !used.has(i.id) && !!i.paymentReference?.includes(b.trackingCode));
    if (inv) {
      used.add(inv.id);
      matched.set(b.id, inv);
    }
  }
  for (const b of bookings) {
    if (matched.has(b.id) || !b.userId) continue;
    let best: (typeof invoices)[number] | undefined;
    let bestGap = Infinity;
    for (const i of invoices) {
      if (used.has(i.id) || i.clientId !== b.userId) continue;
      const gap = Math.abs(i.createdAt.getTime() - b.createdAt.getTime());
      if (gap <= SAME_TRANSACTION_MS && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      matched.set(b.id, best);
    }
  }

  return bookings.map((b) => {
    const inv = matched.get(b.id);
    return {
      id: b.id,
      trackingCode: b.trackingCode,
      status: b.status,
      clientName: b.clientName,
      clientEmail: b.clientEmail,
      clientPhone: b.clientPhone,
      category: b.category,
      discipline: b.discipline,
      serviceTier: b.serviceTier,
      creativeBrief: b.creativeBrief,
      paymentMethod: b.paymentMethod,
      depositAmount: b.depositAmount,
      depositPaid: b.depositPaid,
      createdAt: b.createdAt.toISOString(),
      sessionDate: b.slot ? b.slot.date.toISOString().slice(0, 10) : b.targetDate ?? null,
      slot: b.slot
        ? {
            id: b.slot.id,
            startTime: b.slot.startTime,
            endTime: b.slot.endTime,
            status: b.slot.status,
            campaignTitle: b.slot.campaignTitle,
            price: b.slot.price,
          }
        : null,
      invoice: inv
        ? {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            amount: inv.amount,
            paymentMethod: inv.paymentMethod,
            paymentProofUrl: inv.paymentProofUrl,
            verifiedBy: inv.verifiedBy,
            paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
          }
        : null,
    };
  });
}
