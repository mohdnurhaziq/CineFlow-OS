import { db } from "@/lib/db";
import { STUDIO_TIME_ZONE } from "@/lib/slot-time";
import type { ClientAccountStatus } from "@/lib/client-directory-labels";

export type { ClientAccountStatus } from "@/lib/client-directory-labels";

/**
 * Studio-side view of a studio's clients (User rows with role CLIENT): the admin Clients list
 * and the per-client page. Server-only (imports the database).
 *
 * Bookings link to a client by `userId`; older guest bookings may have no link, so a booking
 * with no `userId` is also matched to the client by email (case-insensitive).
 */

/** Statuses that still count towards what a client owes. VOID (cancelled) and PAID do not. */
const OUTSTANDING_INVOICE_STATUSES = new Set(["PENDING", "OVERDUE", "PENDING_VERIFICATION", "REJECTED"]);

export function clientAccountStatus(user: { passwordHash: string | null; inviteToken: string | null }): ClientAccountStatus {
  if (user.passwordHash) return "REGISTERED";
  if (user.inviteToken) return "INVITED";
  return "GUEST";
}

export interface ClientMoneySummary {
  paid: number;
  outstanding: number;
}

export function summarizeInvoices(invoices: { amount: number; status: string }[]): ClientMoneySummary {
  let paid = 0;
  let outstanding = 0;
  for (const inv of invoices) {
    if (inv.status === "PAID") paid += inv.amount;
    else if (OUTSTANDING_INVOICE_STATUSES.has(inv.status)) outstanding += inv.amount;
  }
  return { paid, outstanding };
}

export interface ClientDirectoryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  accountStatus: ClientAccountStatus;
  bookingCount: number;
  projectCount: number;
  paid: number;
  outstanding: number;
  /** ISO timestamp of the latest booking, project or invoice, or when the account was made. */
  lastActivityAt: string;
  /** lastActivityAt as a studio-local date ("13 Nov 2026"), formatted here so server and browser agree. */
  lastActivityLabel: string;
  /** Studio-local "YYYY-MM-DD" dates, for the CSV export (sorts and parses in spreadsheets). */
  lastActivityDate: string;
  clientSinceDate: string;
  createdAt: string;
}

/** A timestamp as a studio-local calendar date, e.g. "13 Nov 2026". */
export function formatStudioDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: STUDIO_TIME_ZONE });
}

/** A timestamp as a studio-local "YYYY-MM-DD" (the en-CA locale writes dates that way). */
export function studioIsoDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: STUDIO_TIME_ZONE });
}

function latest(...dates: (Date | null | undefined)[]): Date {
  let best = new Date(0);
  for (const d of dates) if (d && d > best) best = d;
  return best;
}

export async function loadClientDirectory(tenantId: string): Promise<ClientDirectoryRow[]> {
  const [clients, bookings] = await Promise.all([
    db.user.findMany({
      where: { tenantId, role: "CLIENT" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        passwordHash: true,
        inviteToken: true,
        createdAt: true,
        invoices: { where: { tenantId }, select: { amount: true, status: true, createdAt: true } },
        clientProjects: { where: { tenantId }, select: { updatedAt: true } },
      },
    }),
    db.clientBooking.findMany({
      where: { tenantId },
      select: { userId: true, clientEmail: true, createdAt: true },
    }),
  ]);

  const idByEmail = new Map(clients.map((c) => [c.email.trim().toLowerCase(), c.id]));
  const bookingsByClient = new Map<string, Date[]>();
  for (const b of bookings) {
    const ownerId = b.userId ?? idByEmail.get(b.clientEmail.trim().toLowerCase());
    if (!ownerId) continue;
    const list = bookingsByClient.get(ownerId) ?? [];
    list.push(b.createdAt);
    bookingsByClient.set(ownerId, list);
  }

  return clients
    .map((c) => {
      const bookingDates = bookingsByClient.get(c.id) ?? [];
      const money = summarizeInvoices(c.invoices);
      const lastActivity = latest(
        c.createdAt,
        ...bookingDates,
        ...c.clientProjects.map((p) => p.updatedAt),
        ...c.invoices.map((i) => i.createdAt)
      );
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        accountStatus: clientAccountStatus(c),
        bookingCount: bookingDates.length,
        projectCount: c.clientProjects.length,
        paid: money.paid,
        outstanding: money.outstanding,
        lastActivityAt: lastActivity.toISOString(),
        lastActivityLabel: formatStudioDate(lastActivity),
        lastActivityDate: studioIsoDate(lastActivity),
        clientSinceDate: studioIsoDate(c.createdAt),
        createdAt: c.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** One client of this studio with everything they have with it, or null if not this studio's client. */
export async function loadClientProfile(tenantId: string, clientId: string) {
  const client = await db.user.findFirst({
    where: { id: clientId, tenantId, role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      passwordHash: true,
      inviteToken: true,
      isQuickCreated: true,
      staffNotes: true,
      createdAt: true,
    },
  });
  if (!client) return null;

  // Unlinked bookings stored the email as typed, so compare case-insensitively in code
  // (SQLite has no case-insensitive Prisma filter).
  const email = client.email.trim().toLowerCase();
  const [linkedBookings, unlinkedBookings, projects, invoices, proposals] = await Promise.all([
    db.clientBooking.findMany({
      where: { tenantId, userId: client.id },
      orderBy: { createdAt: "desc" },
      select: bookingSelect,
    }),
    db.clientBooking.findMany({
      where: { tenantId, userId: null },
      orderBy: { createdAt: "desc" },
      select: bookingSelect,
    }),
    db.project.findMany({
      where: { tenantId, clientId: client.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectNumber: true, title: true, status: true, budget: true, shootDates: true, updatedAt: true },
    }),
    db.milestoneInvoice.findMany({
      where: { tenantId, clientId: client.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        milestoneType: true,
        description: true,
        amount: true,
        status: true,
        dueDate: true,
        paidAt: true,
      },
    }),
    db.proposal.findMany({
      where: { tenantId, clientId: client.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, proposalNumber: true, title: true, status: true, totalPrice: true, createdAt: true },
    }),
  ]);

  const bookings = [
    ...linkedBookings,
    ...unlinkedBookings.filter((b) => b.clientEmail.trim().toLowerCase() === email),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // The latest phone a booking was made with, for clients whose account has none.
  const bookingPhone = bookings.find((b) => b.clientPhone.trim())?.clientPhone ?? null;

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      /** The phone saved on the account itself (null if it has none), for the edit form. */
      accountPhone: client.phone,
      phone: client.phone || bookingPhone,
      accountStatus: clientAccountStatus(client),
      staffNotes: client.staffNotes ?? "",
      createdAt: client.createdAt,
    },
    bookings,
    projects,
    invoices,
    proposals,
    money: summarizeInvoices(invoices),
  };
}

const bookingSelect = {
  id: true,
  trackingCode: true,
  status: true,
  packageName: true,
  serviceTier: true,
  targetDate: true,
  sessionPrice: true,
  depositAmount: true,
  depositPaid: true,
  clientEmail: true,
  clientPhone: true,
  createdAt: true,
} as const;

export type ClientProfile = NonNullable<Awaited<ReturnType<typeof loadClientProfile>>>;
