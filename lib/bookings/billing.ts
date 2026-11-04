import type { Prisma } from "@prisma/client";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";

/**
 * Follow-up invoices issued when a payment is confirmed.
 *
 *  - Booking deposit paid  -> BOOKING_BALANCE invoice for (session price - deposit),
 *    due 7 days after the session (the balance is settled after the shoot).
 *  - Project retainer paid -> FINAL_BALANCE_50 invoice for (project budget - retainer).
 *    Paying it unlocks the client's master files in the delivery vault.
 *
 * Every path that marks an invoice PAID calls onInvoicePaid inside the same
 * transaction. It is idempotent: a follow-up invoice is never issued twice.
 *
 * Not a "use server" module.
 */

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const BALANCE_DUE_AFTER_SESSION_DAYS = 7;
const FINAL_BALANCE_DUE_DAYS = 30;

export function newInvoiceNumber(): string {
  return `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Amount still owed; tiny float remainders count as nothing owed. */
function owed(total: number, paid: number): number {
  const rest = Math.round((total - paid) * 100) / 100;
  return rest > 0 ? rest : 0;
}

export interface PaidInvoice {
  id: string;
  tenantId: string;
  clientId: string;
  bookingId: string | null;
  projectId: string | null;
  proposalId: string | null;
  milestoneType: string;
  amount: number;
  paymentReference: string | null;
}

/** Issues the follow-up invoice for a just-paid invoice, if one is due. Returns it, or null. */
export async function onInvoicePaid(tx: Tx, invoice: PaidInvoice) {
  if (invoice.milestoneType === "BOOKING_DEPOSIT") return issueBookingBalance(tx, invoice);
  if (invoice.milestoneType === "RETAINER_50") return issueProjectFinalBalance(tx, invoice);
  return null;
}

async function issueBookingBalance(tx: Tx, deposit: PaidInvoice) {
  const booking = await resolveInvoiceBooking(tx, deposit);
  if (!booking || booking.sessionPrice == null) return null;

  const amount = owed(booking.sessionPrice, booking.depositAmount);
  if (amount === 0) return null;

  const existing = await tx.milestoneInvoice.findFirst({
    where: { bookingId: booking.id, milestoneType: "BOOKING_BALANCE" },
  });
  if (existing) return null;

  const slot = booking.slotId ? await tx.bookingSlot.findUnique({ where: { id: booking.slotId } }) : null;
  const sessionDay = slot?.date ?? (booking.targetDate ? new Date(`${booking.targetDate}T00:00:00.000Z`) : null);
  const base = sessionDay && sessionDay.getTime() > Date.now() ? sessionDay.getTime() : Date.now();

  return tx.milestoneInvoice.create({
    data: {
      tenantId: booking.tenantId,
      invoiceNumber: newInvoiceNumber(),
      clientId: deposit.clientId,
      bookingId: booking.id,
      milestoneType: "BOOKING_BALANCE",
      amount,
      status: "PENDING",
      paymentReference: `BALANCE:${booking.trackingCode}`,
      dueDate: new Date(base + BALANCE_DUE_AFTER_SESSION_DAYS * DAY_MS),
    },
  });
}

async function issueProjectFinalBalance(tx: Tx, retainer: PaidInvoice) {
  if (!retainer.projectId) return null;
  const project = await tx.project.findUnique({ where: { id: retainer.projectId } });
  if (!project) return null;

  const existing = await tx.milestoneInvoice.findFirst({
    where: { projectId: project.id, milestoneType: "FINAL_BALANCE_50" },
  });
  if (existing) return null;

  const amount = owed(project.budget, retainer.amount);
  if (amount === 0) return null;

  return tx.milestoneInvoice.create({
    data: {
      tenantId: retainer.tenantId,
      invoiceNumber: newInvoiceNumber(),
      clientId: retainer.clientId,
      projectId: project.id,
      proposalId: retainer.proposalId,
      milestoneType: "FINAL_BALANCE_50",
      amount,
      status: "PENDING",
      paymentReference: `FINAL:${project.projectNumber}`,
      dueDate: new Date(Date.now() + FINAL_BALANCE_DUE_DAYS * DAY_MS),
    },
  });
}
