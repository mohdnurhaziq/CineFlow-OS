"use server";

import { db } from "@/lib/db";
import { z } from "zod";

/**
 * Public "My Booking" lookup. Clients have no accounts, so a booking is
 * unlocked by the pair (email used at booking time + tracking code).
 * Every failure mode returns the same NOT_FOUND so the form cannot be used
 * to discover which tracking codes or emails exist.
 */

const LookupSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().trim().email("Please enter a valid email address."),
  trackingCode: z
    .string()
    .trim()
    .min(4, "Please enter your tracking code.")
    .max(40)
    .transform((v) => v.toUpperCase()),
});

export interface MyBookingInvoice {
  id: string;
  invoiceNumber: string;
  milestoneType: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  payUrl: string | null;
}

export interface MyBookingProject {
  id: string;
  title: string;
  projectNumber: string;
  status: string;
  isFinalBalancePaid: boolean;
  vaultUrl: string;
}

export interface MyBookingProposal {
  id: string;
  title: string;
  proposalNumber: string;
  status: string;
  totalPrice: number;
  url: string;
}

export interface MyBookingView {
  trackingCode: string;
  status: string;
  clientName: string;
  /** The service package booked, if any. */
  packageName: string | null;
  category: string;
  discipline: string;
  depositPaid: boolean;
  depositAmount: number;
  paymentMethod: string | null;
  createdAt: string;
  slot: { date: string; startTime: string; endTime: string; status: string } | null;
  invoices: MyBookingInvoice[];
  projects: MyBookingProject[];
  proposals: MyBookingProposal[];
}

export type LookupResult =
  | { success: true; booking: MyBookingView; currency: string }
  | { success: false; error: "INVALID_INPUT" | "NOT_FOUND" | "RATE_LIMITED" | "INTERNAL_ERROR"; message: string };

// ─── Basic in-memory throttle (per tenant + email) ──────────────────────────
// Good enough for a single Node process; use a shared store (Redis) if the
// app is ever run on multiple instances.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isThrottled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

const NOT_FOUND: LookupResult = {
  success: false,
  error: "NOT_FOUND",
  message: "We couldn't find a booking matching that email and tracking code.",
};

export async function lookupMyBooking(input: {
  tenantSlug: string;
  email: string;
  trackingCode: string;
}): Promise<LookupResult> {
  const parsed = LookupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Please check your details.",
    };
  }

  const { tenantSlug, email, trackingCode } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  if (isThrottled(`${tenantSlug}:${normalizedEmail}`)) {
    return {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, currency: true },
    });
    if (!tenant) return NOT_FOUND;

    const booking = await db.clientBooking.findFirst({
      where: { tenantId: tenant.id, trackingCode },
      include: { slot: true },
    });

    if (!booking || booking.clientEmail.trim().toLowerCase() !== normalizedEmail) {
      return NOT_FOUND;
    }

    // Related records are reached through the booking's client user, always
    // scoped to this tenant.
    let invoices: MyBookingInvoice[] = [];
    let projects: MyBookingProject[] = [];
    let proposals: MyBookingProposal[] = [];

    if (booking.userId) {
      const [invoiceRows, projectRows, proposalRows] = await Promise.all([
        db.milestoneInvoice.findMany({
          where: { tenantId: tenant.id, clientId: booking.userId },
          orderBy: { createdAt: "desc" },
        }),
        db.project.findMany({
          where: { tenantId: tenant.id, clientId: booking.userId },
          orderBy: { createdAt: "desc" },
        }),
        db.proposal.findMany({
          where: { tenantId: tenant.id, clientId: booking.userId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      invoices = invoiceRows.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        milestoneType: inv.milestoneType,
        amount: inv.amount,
        status: inv.status,
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
        payUrl:
          inv.status === "PENDING" || inv.status === "OVERDUE"
            ? `/${tenantSlug}/checkout?invoiceId=${inv.id}`
            : null,
      }));

      projects = projectRows.map((p) => ({
        id: p.id,
        title: p.title,
        projectNumber: p.projectNumber,
        status: p.status,
        isFinalBalancePaid: p.isFinalBalancePaid,
        vaultUrl: `/${tenantSlug}/vault/${p.id}`,
      }));

      proposals = proposalRows.map((p) => ({
        id: p.id,
        title: p.title,
        proposalNumber: p.proposalNumber,
        status: p.status,
        totalPrice: p.totalPrice,
        url: `/${tenantSlug}/proposals/${p.id}`,
      }));
    }

    return {
      success: true,
      currency: tenant.currency,
      booking: {
        trackingCode: booking.trackingCode,
        status: booking.status,
        clientName: booking.clientName,
        packageName: booking.packageName,
        category: booking.category,
        discipline: booking.discipline,
        depositPaid: booking.depositPaid,
        depositAmount: booking.depositAmount,
        paymentMethod: booking.paymentMethod,
        createdAt: booking.createdAt.toISOString(),
        slot: booking.slot
          ? {
              date: booking.slot.date.toISOString(),
              startTime: booking.slot.startTime,
              endTime: booking.slot.endTime,
              status: booking.slot.status,
            }
          : null,
        invoices,
        projects,
        proposals,
      },
    };
  } catch (err) {
    console.error("My Booking lookup error:", err);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again shortly.",
    };
  }
}
