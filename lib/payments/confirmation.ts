import { db } from "@/lib/db";
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";

/**
 * What a client sees right after paying, on the page checkout sends them to: their bookings
 * (for a new booking) or the invoice they paid. Read from the database, never from the URL:
 * the URL only says which booking or invoice to look up, and it must be the signed-in client's.
 *
 * Server-only. Safe to pass the result to client components.
 */

export type PaymentConfirmationState =
  /** Paid (online card, or the studio already approved it): the booking is confirmed. */
  | "PAID"
  /** A payment slip was sent; the studio checks it before confirming. */
  | "AWAITING_CHECK"
  /** Cash at the studio: nothing paid yet. */
  | "PAY_AT_STUDIO"
  /** An online payment that has not come through yet. */
  | "AWAITING_PAYMENT";

export interface PaymentConfirmation {
  kind: "BOOKING" | "INVOICE";
  state: PaymentConfirmationState;
  trackingCode: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  paymentMethod: string | null;
  /** Set when this payment unlocked the project's final deliverables. */
  vaultProjectId: string | null;
  /** Hours the slot is held for a cash booking before it is released unpaid; null otherwise. */
  holdHours: number | null;
}

function stateFor(invoice: { status: string; paymentMethod: string | null } | null, bookingStatus?: string): PaymentConfirmationState {
  if (!invoice) return bookingStatus === "CONFIRMED" ? "PAID" : "AWAITING_PAYMENT";
  if (invoice.status === "PAID") return "PAID";
  if (invoice.paymentMethod === "CASH") return "PAY_AT_STUDIO";
  if (invoice.status === "PENDING_VERIFICATION") return "AWAITING_CHECK";
  return "AWAITING_PAYMENT";
}

const INVOICE_FIELDS = {
  id: true,
  invoiceNumber: true,
  amount: true,
  status: true,
  paymentMethod: true,
  milestoneType: true,
  projectId: true,
  project: { select: { isFinalBalancePaid: true } },
} as const;

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  paymentMethod: string | null;
  milestoneType: string;
  projectId: string | null;
  project: { isFinalBalancePaid: boolean } | null;
};

/** The vault opens once the final balance is paid; link to it right after that payment. */
function vaultFor(invoice: InvoiceRow): string | null {
  const finalPayment = invoice.milestoneType === "FINAL_BALANCE_50" || invoice.milestoneType === "BOOKING_BALANCE";
  return finalPayment && invoice.status === "PAID" && invoice.projectId && invoice.project?.isFinalBalancePaid
    ? invoice.projectId
    : null;
}

/** The confirmation for a booking the client just made, by its tracking code. */
export async function loadBookingConfirmation(
  tenantId: string,
  clientId: string,
  trackingCode: string
): Promise<PaymentConfirmation | null> {
  const booking = await db.clientBooking.findFirst({
    where: { tenantId, userId: clientId, trackingCode },
    select: { id: true, trackingCode: true, status: true, depositAmount: true },
  });
  if (!booking) return null;
  const deposit = (await db.milestoneInvoice.findFirst({
    where: { tenantId, clientId, bookingId: booking.id, milestoneType: "BOOKING_DEPOSIT" },
    orderBy: { createdAt: "desc" },
    select: INVOICE_FIELDS,
  })) as InvoiceRow | null;
  const state = stateFor(deposit, booking.status);
  return {
    kind: "BOOKING",
    state,
    trackingCode: booking.trackingCode,
    invoiceId: deposit?.id ?? null,
    invoiceNumber: deposit?.invoiceNumber ?? null,
    amount: deposit?.amount ?? booking.depositAmount,
    paymentMethod: deposit?.paymentMethod ?? null,
    vaultProjectId: null,
    holdHours: state === "PAY_AT_STUDIO" ? DEPOSIT_HOLD_HOURS : null,
  };
}

/** The confirmation for an invoice the client just paid (or sent a slip / chose cash for). */
export async function loadInvoiceConfirmation(
  tenantId: string,
  clientId: string,
  invoiceId: string
): Promise<PaymentConfirmation | null> {
  const invoice = (await db.milestoneInvoice.findFirst({
    where: { id: invoiceId, tenantId, clientId },
    select: INVOICE_FIELDS,
  })) as InvoiceRow | null;
  if (!invoice) return null;
  return {
    kind: "INVOICE",
    state: stateFor(invoice),
    trackingCode: null,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.amount,
    paymentMethod: invoice.paymentMethod,
    vaultProjectId: vaultFor(invoice),
    holdHours: null,
  };
}
