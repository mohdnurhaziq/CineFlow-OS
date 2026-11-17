/**
 * Whether someone may record a payment on an invoice in this status, as recordInvoicePayment
 * decides it: the "record or cancel payments" permission, and, when a client's payment slip is
 * waiting for review, "approve or reject payments" as well (recording over the slip approves it).
 *
 * Pure, so the invoice page's buttons (a client component) follow the same rule. Not a "use server" module.
 */
export function canRecordPaymentOn(status: string, ticks: { recordPayments: boolean; approvePayments: boolean }): boolean {
  if (!ticks.recordPayments) return false;
  return status !== "PENDING_VERIFICATION" || ticks.approvePayments;
}
