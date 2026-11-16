import type { AccessArea, AccessLevel, AccessTick } from "@/lib/auth/access";

/** Owner-facing wording for the access model, shared by the role editor, the member screens and the manual. */
export const AREA_LABELS: Record<AccessArea, string> = {
  bookings: "Bookings & Calendar",
  galleries: "Galleries & photos",
  production: "Shoot days & gear",
  printOrders: "Print orders",
  clients: "Clients",
  proposals: "Proposals",
  invoices: "Invoices",
  services: "Services",
  catalog: "Catalog & website",
};

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  NONE: "None",
  OWN: "Only their own",
  VIEW: "View",
  MANAGE: "Manage",
};

export const TICK_LABELS: Record<AccessTick, { title: string; description: string }> = {
  approvePayments: { title: "Approve or reject payments", description: "Check bank-transfer and cash payments in Verification." },
  recordPayments: {
    title: "Record or cancel payments",
    description: "Mark money received outside the app, cancel invoices, and cancel bookings or orders that have a payment.",
  },
  setPrices: { title: "Set prices", description: "Change packages and slot fees, send proposals and create invoices." },
};

export const VIEW_LEVEL_NOTE =
  "View means they can look but not change anything, except on-set tasks like ticking shots and checking gear in and out.";
