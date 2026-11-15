import type { Prisma } from "@prisma/client";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { markPrintOrderPaid } from "@/lib/prints/orders";

/**
 * Follow-up invoices issued when a payment is confirmed.
 *
 *  - Booking deposit paid  -> BOOKING_BALANCE invoice for (session price - deposit),
 *    due 7 days after the session (the balance is settled after the shoot).
 *  - Project retainer paid -> FINAL_BALANCE_50 invoice for (project budget - retainer).
 *    Paying it unlocks the client's master files in the delivery vault.
 *  - Print order invoice paid -> no follow-up invoice; the order moves to NEW.
 *
 * Every path that marks an invoice PAID calls onInvoicePaid inside the same
 * transaction. It is idempotent: a follow-up invoice is never issued twice.
 *
 * Not a "use server" module.
 */

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
export const BALANCE_DUE_AFTER_SESSION_DAYS = 7;
const FINAL_BALANCE_DUE_DAYS = 30;

/**
 * The studio's next invoice number: INV-<year>-<n>, counting 0001, 0002… per studio and
 * starting again each year. Must run inside the transaction that creates the invoice.
 */
export async function nextInvoiceNumber(tx: Tx, tenantId: string, now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  // Bumping the counter first locks the studio's row, so two invoices created at the same
  // moment can never be given the same number.
  const bumped = await tx.tenant.update({
    where: { id: tenantId },
    data: { invoiceSeq: { increment: 1 } },
    select: { invoiceSeq: true, invoiceSeqYear: true },
  });
  let seq = bumped.invoiceSeq;
  if (bumped.invoiceSeqYear !== year) {
    // First invoice of the year (or of a studio that predates the counter): carry on after
    // the highest number already issued this year rather than restarting at 1.
    seq = (await highestInvoiceSeq(tx, tenantId, year)) + 1;
    await tx.tenant.update({ where: { id: tenantId }, data: { invoiceSeq: seq, invoiceSeqYear: year } });
  }
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

/** Highest sequential number among the studio's INV-<year>-<n> invoices; 0 if none. */
async function highestInvoiceSeq(tx: Tx, tenantId: string, year: number): Promise<number> {
  const prefix = `INV-${year}-`;
  const rows = await tx.milestoneInvoice.findMany({
    where: { tenantId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const { invoiceNumber } of rows) {
    const suffix = invoiceNumber.slice(prefix.length);
    // Older invoices got random 6-digit numbers; they aren't part of the sequence.
    if (/^\d{1,5}$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return max;
}

/** Invoice statuses that still count as unpaid: they can be paid, or cancelled (voided). */
export const UNPAID_INVOICE_STATUSES = ["PENDING", "OVERDUE", "PENDING_VERIFICATION", "REJECTED"];

/** The invoice was paid or cancelled after the caller checked it. Thrown to roll the transaction back. */
export class InvoiceNotPayableError extends Error {
  constructor(public status: "PAID" | "VOID") {
    super(status === "VOID" ? "This invoice was cancelled and can no longer be paid." : "Invoice is already paid.");
  }
}

/**
 * Updates an invoice that must still be payable (neither PAID nor VOID) at the moment of the
 * write. Throws InvoiceNotPayableError otherwise, so a cancel or another payment that slipped in
 * between the caller's check and its transaction wins.
 */
export async function updatePayableInvoice(tx: Tx, invoiceId: string, data: Prisma.MilestoneInvoiceUpdateManyMutationInput) {
  const won = await tx.milestoneInvoice.updateMany({ where: { id: invoiceId, status: { notIn: ["PAID", "VOID"] } }, data });
  if (won.count === 1) return;
  const now = await tx.milestoneInvoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  throw new InvoiceNotPayableError(now?.status === "PAID" ? "PAID" : "VOID");
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

/**
 * Issues the follow-up invoice for a just-paid invoice, if one is due, and moves a paid print
 * order on to NEW. Returns the follow-up invoice, or null.
 */
export async function onInvoicePaid(tx: Tx, invoice: PaidInvoice) {
  if (invoice.milestoneType === "BOOKING_DEPOSIT") return issueBookingBalance(tx, invoice);
  if (invoice.milestoneType === "RETAINER_50") return issueProjectFinalBalance(tx, invoice);
  if (invoice.milestoneType === "PRINT_FRAME_ORDER") return markPrintOrderPaid(tx, invoice.id);
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
      invoiceNumber: await nextInvoiceNumber(tx, booking.tenantId),
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
      invoiceNumber: await nextInvoiceNumber(tx, retainer.tenantId),
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

/**
 * The next print order number: PO-<year>-<n>, 0001, 0002… counted from the orders placed that
 * year. Order numbers are unique across every studio, so the count is too (a per-studio count
 * would hand two studios the same number). Must run inside the transaction that creates the
 * order, after it holds the write lock.
 */
export async function nextPrintOrderNumber(tx: Tx, tenantId: string, now: Date = new Date()): Promise<string> {
  void tenantId; // Kept for symmetry with nextInvoiceNumber; see the note above.
  const prefix = `PO-${now.getFullYear()}-`;
  const rows = await tx.printOrder.findMany({
    where: { orderNumber: { startsWith: prefix } },
    select: { orderNumber: true },
  });
  let max = 0;
  for (const { orderNumber } of rows) {
    const suffix = orderNumber.slice(prefix.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
