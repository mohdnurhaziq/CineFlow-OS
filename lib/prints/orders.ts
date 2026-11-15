import type { Prisma } from "@prisma/client";

/**
 * Print order state changes driven by the order's invoice. Not a "use server" module.
 */

type Tx = Prisma.TransactionClient;

/**
 * The invoice of a print order was paid: the order moves from AWAITING_PAYMENT to NEW so the
 * studio can start on it. Idempotent, and leaves an order in any other status alone (a
 * cancelled order stays cancelled). Must run inside the transaction that marks the invoice PAID.
 */
export async function markPrintOrderPaid(tx: Tx, invoiceId: string): Promise<null> {
  await tx.printOrder.updateMany({
    where: { invoiceId, status: "AWAITING_PAYMENT" },
    data: { status: "NEW" },
  });
  return null;
}

/** Statuses after which the prints have left the studio: nobody can cancel the order any more. */
export const SENT_ORDER_STATUSES = ["SHIPPED", "COLLECTED", "DELIVERED"];
