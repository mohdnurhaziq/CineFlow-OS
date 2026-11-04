import { db } from "@/lib/db";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";

/**
 * Everything needed to render one invoice (or, once paid, its receipt).
 *
 * Not a "use server" module and performs no authorization: callers must check
 * who is viewing first (the client who owns the invoice, or the studio's staff).
 */

export interface InvoiceDocument {
  id: string;
  invoiceNumber: string;
  milestoneType: string;
  title: string;
  status: string;
  amount: number;
  currency: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentProofUrl: string | null;
  verifiedBy: string | null;
  studio: {
    name: string;
    slug: string;
    logoUrl: string | null;
    tagline: string | null;
    contactEmail: string | null;
    bankDetails: string | null;
  };
  client: { id: string; name: string; email: string; phone: string | null };
  lines: Array<{ description: string; detail?: string; amount: number }>;
  /** For booking invoices: the session and how the total breaks down. */
  booking: {
    trackingCode: string;
    sessionDate: string | null;
    startTime: string | null;
    endTime: string | null;
    packageName: string | null;
    sessionPrice: number | null;
    depositAmount: number;
  } | null;
  project: { title: string; projectNumber: string; budget: number } | null;
}

export const MILESTONE_TITLES: Record<string, string> = {
  BOOKING_DEPOSIT: "Booking deposit",
  BOOKING_BALANCE: "Session balance",
  RETAINER_50: "Project retainer (50%)",
  FINAL_BALANCE_50: "Project final balance (50%)",
  PRINT_FRAME_ORDER: "Print & frame order",
};

export function milestoneTitle(type: string): string {
  return MILESTONE_TITLES[type] ?? type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export async function loadInvoiceDocument(tenantId: string, invoiceId: string): Promise<InvoiceDocument | null> {
  const invoice = await db.milestoneInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { tenant: true, client: true, project: true },
  });
  if (!invoice) return null;

  const owner = await db.user.findFirst({
    where: { tenantId, role: "STUDIO_OWNER" },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });

  const isBookingInvoice = invoice.milestoneType === "BOOKING_DEPOSIT" || invoice.milestoneType === "BOOKING_BALANCE";
  const linked = isBookingInvoice ? await resolveInvoiceBooking(db, invoice) : null;
  const slot = linked?.slotId ? await db.bookingSlot.findUnique({ where: { id: linked.slotId } }) : null;

  const booking = linked
    ? {
        trackingCode: linked.trackingCode,
        sessionDate: slot ? slot.date.toISOString().slice(0, 10) : linked.targetDate ?? null,
        startTime: slot?.startTime ?? null,
        endTime: slot?.endTime ?? null,
        packageName: linked.packageName,
        sessionPrice: linked.sessionPrice,
        depositAmount: linked.depositAmount,
      }
    : null;

  const title = milestoneTitle(invoice.milestoneType);
  const what = booking?.packageName ?? (invoice.project ? invoice.project.title : null);
  const detail = booking
    ? [booking.trackingCode, booking.sessionDate, booking.startTime && booking.endTime ? `${booking.startTime} – ${booking.endTime}` : null]
        .filter(Boolean)
        .join(" · ")
    : invoice.project
      ? invoice.project.projectNumber
      : undefined;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    milestoneType: invoice.milestoneType,
    title,
    status: invoice.status,
    amount: invoice.amount,
    currency: invoice.tenant.currency,
    issuedAt: invoice.createdAt.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    paymentProofUrl: invoice.paymentProofUrl,
    verifiedBy: invoice.verifiedBy,
    studio: {
      name: invoice.tenant.name,
      slug: invoice.tenant.slug,
      logoUrl: invoice.tenant.logoUrl,
      tagline: invoice.tenant.tagline,
      contactEmail: owner?.email ?? null,
      bankDetails: invoice.tenant.bankDetails,
    },
    client: { id: invoice.client.id, name: invoice.client.name, email: invoice.client.email, phone: invoice.client.phone },
    lines: [{ description: what ? `${title}: ${what}` : title, detail, amount: invoice.amount }],
    booking,
    project: invoice.project
      ? { title: invoice.project.title, projectNumber: invoice.project.projectNumber, budget: invoice.project.budget }
      : null,
  };
}
