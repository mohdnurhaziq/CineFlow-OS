/** What a client (and the studio) sees for each print order status. Safe to import in client components. */
export const PRINT_ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  NEW: "Received",
  IN_PRODUCTION: "In production",
  READY_FOR_PICKUP: "Ready for pickup",
  SHIPPED: "Shipped",
  COLLECTED: "Collected",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Badge colours per status, in the shared dark zinc badge style. */
export const PRINT_ORDER_STATUS_STYLES: Record<string, string> = {
  AWAITING_PAYMENT: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  NEW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_PRODUCTION: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  READY_FOR_PICKUP: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  SHIPPED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  COLLECTED: "bg-zinc-800 text-zinc-300 border-zinc-700",
  DELIVERED: "bg-zinc-800 text-zinc-300 border-zinc-700",
  CANCELLED: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

export function printOrderStatusLabel(status: string): string {
  return PRINT_ORDER_STATUS_LABELS[status] ?? status;
}

/** The moves staff make by hand, from each status, for each fulfilment (cancelling is separate). */
const STAFF_MOVES: Record<string, Record<string, string[]>> = {
  PICKUP: { NEW: ["IN_PRODUCTION"], IN_PRODUCTION: ["READY_FOR_PICKUP"], READY_FOR_PICKUP: ["COLLECTED"] },
  SHIP: { NEW: ["IN_PRODUCTION"], IN_PRODUCTION: ["SHIPPED"], SHIPPED: ["DELIVERED"] },
};

/** Where staff can move an order next: nothing while it awaits payment, or once it's done or cancelled. */
export function nextPrintOrderStatuses(fulfilment: string, status: string): string[] {
  return STAFF_MOVES[fulfilment]?.[status] ?? [];
}

/** How each mat board choice is described to clients and staff. */
export const MAT_BOARD_LABELS: Record<string, string> = {
  NONE: "No mat",
  WHITE_2INCH: '2" white mat',
  OFFWHITE_2INCH: '2" off-white mat',
};
