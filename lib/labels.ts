/**
 * Human-readable labels for the codes stored in the database (HYBRID, QR_CODE, ON_SHOOT…),
 * so the UI never shows a raw code. Safe to import from client and server code.
 */

/** "STUDIO_PORTRAIT" or "studio-portrait" -> "Studio portrait". The fallback for unknown codes. */
export function humanize(code: string | null | undefined): string {
  if (!code) return "";
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lookup(map: Record<string, string>) {
  return (code: string | null | undefined) => (code ? map[code] ?? humanize(code) : "");
}

export const DISCIPLINE_LABELS: Record<string, string> = {
  PHOTOGRAPHY: "Photography",
  VIDEOGRAPHY: "Videography",
  HYBRID: "Photo & video",
  UNIVERSAL: "Any discipline",
};
export const disciplineLabel = lookup(DISCIPLINE_LABELS);

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  QR_CODE: "QR / bank transfer",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CARD: "Card / FPX",
};
export const paymentMethodLabel = lookup(PAYMENT_METHOD_LABELS);

export const MILESTONE_TITLES: Record<string, string> = {
  BOOKING_DEPOSIT: "Booking deposit",
  BOOKING_BALANCE: "Session balance",
  RETAINER_50: "Project retainer (50%)",
  FINAL_BALANCE_50: "Project final balance (50%)",
  PRINT_FRAME_ORDER: "Print & frame order",
  CUSTOM: "Invoice",
};
export const milestoneLabel = lookup(MILESTONE_TITLES);

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Unpaid",
  OVERDUE: "Overdue",
  PENDING_VERIFICATION: "Under review",
  PAID: "Paid",
  REJECTED: "Slip rejected",
  VOID: "Cancelled",
};
export const invoiceStatusLabel = lookup(INVOICE_STATUS_LABELS);

export const GEAR_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  ON_SHOOT: "On a shoot",
  MAINTENANCE: "In repair",
};
export const gearStatusLabel = lookup(GEAR_STATUS_LABELS);

export const CONDITION_LABELS: Record<string, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  MAINTENANCE_NEEDED: "Needs maintenance",
  DAMAGED: "Damaged",
};
export const conditionLabel = lookup(CONDITION_LABELS);

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  RESERVED: "Reserved",
  CHECKED_OUT: "Checked out",
  RETURNED: "Returned",
};
export const reservationStatusLabel = lookup(RESERVATION_STATUS_LABELS);
