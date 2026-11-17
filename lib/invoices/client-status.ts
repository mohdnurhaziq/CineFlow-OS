/**
 * Where an invoice stands from the client's side, and what they should do next. The stored status
 * alone can't say this: a QR deposit is "awaiting verification" from the moment it's booked, but
 * until a slip is uploaded the studio has nothing to verify and the client still has to pay.
 */
export type ClientPayState =
  /** Paid in full. */
  | "PAID"
  /** Unpaid, or past its due date: pay online. */
  | "DUE"
  /** QR transfer chosen but no slip yet, or cash to bring to the studio. */
  | "AWAITING_PAYMENT"
  /** A slip was sent; the studio is checking it. */
  | "IN_REVIEW"
  /** The studio didn't accept the slip; send a new one. */
  | "REJECTED"
  /** Cancelled: nothing to pay. */
  | "VOID";

export interface PayStateInput {
  status: string;
  paymentMethod?: string | null;
  paymentProofUrl?: string | null;
}

export function clientPayState(inv: PayStateInput): ClientPayState {
  switch (inv.status) {
    case "PAID":
      return "PAID";
    case "PENDING":
    case "OVERDUE":
      return "DUE";
    case "REJECTED":
      return "REJECTED";
    case "VOID":
    case "CANCELLED":
      return "VOID";
    case "PENDING_VERIFICATION":
      return inv.paymentProofUrl ? "IN_REVIEW" : "AWAITING_PAYMENT";
    default:
      return "DUE";
  }
}

/** Still owed by the client: counts toward their balance and the Unpaid filter. */
export function isOwed(inv: PayStateInput): boolean {
  const state = clientPayState(inv);
  return state === "DUE" || state === "AWAITING_PAYMENT" || state === "REJECTED";
}

/** Short label for a badge. */
export function clientPayLabel(inv: PayStateInput & { status: string }): string {
  switch (clientPayState(inv)) {
    case "PAID":
      return "Paid";
    case "DUE":
      return inv.status === "OVERDUE" ? "Overdue" : "Unpaid";
    case "AWAITING_PAYMENT":
      return inv.paymentMethod === "CASH" ? "Pay at the studio" : "Upload your slip";
    case "IN_REVIEW":
      return "Under review";
    case "REJECTED":
      return "Slip not accepted";
    case "VOID":
      return "Cancelled";
  }
}

/**
 * The client's next step, if any: paying online, uploading a slip (both on the checkout page,
 * which opens on the invoice's own payment method), or nothing (cash is paid at the studio).
 */
export function clientPayAction(inv: PayStateInput): { label: string } | null {
  const state = clientPayState(inv);
  if (state === "DUE") return { label: "Pay now" };
  if ((state === "AWAITING_PAYMENT" || state === "REJECTED") && inv.paymentMethod !== "CASH") return { label: "Upload slip" };
  return null;
}
