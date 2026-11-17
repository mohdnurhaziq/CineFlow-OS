/**
 * How the client's Bills tab groups invoices: one card per booking (or proposal), holding every
 * invoice for it. A print order is billed against the booking's gallery rather than the booking
 * itself, so it is matched through that gallery.
 */

export const BOOKING_MILESTONES: ReadonlySet<string> = new Set(["BOOKING_DEPOSIT", "BOOKING_BALANCE"]);
export const PROPOSAL_MILESTONES: ReadonlySet<string> = new Set(["RETAINER_50", "FINAL_BALANCE_50"]);

const DROPPED = new Set(["VOID", "CANCELLED"]);

/** The booking whose card this invoice belongs in, or null when it isn't for a booking. */
export function invoiceBookingId(
  inv: { bookingId: string | null; proposalId: string | null; projectId: string | null },
  bookingByProject: ReadonlyMap<string, string>
): string | null {
  if (inv.bookingId) return inv.bookingId;
  if (inv.proposalId || !inv.projectId) return null;
  return bookingByProject.get(inv.projectId) ?? null;
}

export interface BillSums {
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  hasReview: boolean;
  isFullyPaid: boolean;
  /** Paid share of the total, 0-100. */
  percentage: number;
}

/**
 * A card's totals: the agreed price (session or contract), plus anything else billed for it,
 * such as prints and frames. Without an agreed price, the plan's own invoices make up the base.
 */
export function billSums(
  basePrice: number | null | undefined,
  invoices: ReadonlyArray<{ milestoneType: string; status: string; amount: number }>,
  planMilestones: ReadonlySet<string>
): BillSums {
  const live = invoices.filter((i) => !DROPPED.has(i.status));
  const sum = (list: typeof live) => list.reduce((s, i) => s + i.amount, 0);
  const base = basePrice && basePrice > 0 ? basePrice : sum(live.filter((i) => planMilestones.has(i.milestoneType)));
  const totalAmount = base + sum(live.filter((i) => !planMilestones.has(i.milestoneType)));
  const paidAmount = sum(live.filter((i) => i.status === "PAID"));
  const balanceDue = sum(live.filter((i) => i.status === "PENDING" || i.status === "OVERDUE"));
  const hasReview = live.some((i) => i.status === "PENDING_VERIFICATION");
  // A slip still waiting for the studio's review isn't settled yet.
  const isFullyPaid = balanceDue <= 0 && !hasReview && paidAmount > 0;
  const percentage = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : isFullyPaid ? 100 : 0;
  return { totalAmount, paidAmount, balanceDue, hasReview, isFullyPaid, percentage };
}
