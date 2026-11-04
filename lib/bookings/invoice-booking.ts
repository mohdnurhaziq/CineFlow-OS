import type { db } from "@/lib/db";

/**
 * Finds the booking a BOOKING_DEPOSIT invoice pays for.
 *
 * Approving, rejecting or settling a deposit must act on exactly that booking. Guessing
 * "the client's latest pending booking" confirmed the wrong one when a client had two.
 *
 * Order of evidence:
 *  1. invoice.bookingId, the explicit link written when the invoice is created;
 *  2. a booking tracking code carried in invoice.paymentReference (older invoices);
 *  3. the client's only pending booking that no other invoice is linked to.
 * Anything else is ambiguous and returns null, so no booking is changed.
 *
 * Not a "use server" module. Safe inside a transaction.
 */

type Tx = Pick<typeof db, "clientBooking">;

export interface DepositInvoiceRef {
  id: string;
  tenantId: string;
  clientId: string;
  bookingId: string | null;
  paymentReference: string | null;
}

const TRACKING_CODE = /BK-[A-Z0-9]+(?:-[A-Z0-9]+)*/g;
const PENDING = ["PENDING", "PENDING_VERIFICATION"];

export async function resolveInvoiceBooking(tx: Tx, invoice: DepositInvoiceRef) {
  if (invoice.bookingId) {
    return tx.clientBooking.findFirst({ where: { id: invoice.bookingId, tenantId: invoice.tenantId } });
  }

  const codes = [...new Set(invoice.paymentReference?.match(TRACKING_CODE) ?? [])];
  if (codes.length > 0) {
    const byCode = await tx.clientBooking.findMany({
      where: { tenantId: invoice.tenantId, userId: invoice.clientId, trackingCode: { in: codes } },
    });
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) return null;
  }

  const candidates = await tx.clientBooking.findMany({
    where: {
      tenantId: invoice.tenantId,
      userId: invoice.clientId,
      status: { in: PENDING },
      invoices: { none: { id: { not: invoice.id } } },
    },
    take: 2,
  });
  return candidates.length === 1 ? candidates[0] : null;
}
