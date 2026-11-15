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
  CANCELLED: "bg-zinc-800 text-zinc-500 border-zinc-700",
};

export function printOrderStatusLabel(status: string): string {
  return PRINT_ORDER_STATUS_LABELS[status] ?? status;
}
