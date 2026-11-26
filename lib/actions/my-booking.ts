"use server";

import { db } from "@/lib/db";
import { filesReleased } from "@/lib/deliverables/access";
import { liveProjectWhere } from "@/lib/projects/list";
import { z } from "zod";
import { studioPath } from "@/lib/domain-name";
import { isRateLimited } from "@/lib/rate-limit";
import { requestIp } from "@/lib/client-ip";

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
  /** Full-resolution files open: paid, or the studio releases them before payment. */
  filesReleased: boolean;
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

// Limits, on the shared limiter (lib/rate-limit): one email at one studio, and one visitor across
// every email, so neither guessing codes for a known email nor trying many emails gets far.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_EMAIL = 8;
const MAX_PER_VISITOR = 40;

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

  const ip = await requestIp();
  if (
    isRateLimited(`my-booking:${tenantSlug}:${normalizedEmail}`, MAX_PER_EMAIL, WINDOW_MS) ||
    (ip && isRateLimited(`my-booking-ip:${ip}`, MAX_PER_VISITOR, WINDOW_MS))
  ) {
    return {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, currency: true, releaseFilesBeforePayment: true },
    });
    if (!tenant) return NOT_FOUND;

    const booking = await db.clientBooking.findFirst({
      where: { tenantId: tenant.id, trackingCode },
      include: { slot: true },
    });

    if (!booking || booking.clientEmail.trim().toLowerCase() !== normalizedEmail) {
      return NOT_FOUND;
    }

    // Only this booking's own records. Anyone can make a booking with someone else's email (and so
    // get its tracking code), so the email and code prove nothing about the client's other
    // invoices, projects or proposals: those are for the signed-in account.
    let invoices: MyBookingInvoice[] = [];
    let projects: MyBookingProject[] = [];
    const proposals: MyBookingProposal[] = [];

    {
      const projectRows = await db.project.findMany({
        where: { tenantId: tenant.id, bookingId: booking.id, ...liveProjectWhere },
        orderBy: { createdAt: "desc" },
      });
      // The booking's own invoices (deposit, balance) and those of its own project (its gallery or
      // production: a retainer, a final balance, a custom charge).
      const invoiceRows = await db.milestoneInvoice.findMany({
        where: {
          tenantId: tenant.id,
          OR: [{ bookingId: booking.id }, ...(projectRows.length > 0 ? [{ projectId: { in: projectRows.map((p) => p.id) } }] : [])],
        },
        orderBy: { createdAt: "desc" },
      });

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
            ? studioPath(tenantSlug, `/checkout?invoiceId=${inv.id}`)
            : null,
      }));

      projects = projectRows.map((p) => ({
        id: p.id,
        title: p.title,
        projectNumber: p.projectNumber,
        status: p.status,
        isFinalBalancePaid: p.isFinalBalancePaid,
        filesReleased: filesReleased(p, tenant),
        vaultUrl: studioPath(tenantSlug, `/vault/${p.id}`),
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
