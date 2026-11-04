"use server";

import { db } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStaff } from "@/lib/auth/guard";
import { loadBookingDetails } from "@/lib/bookings/details";
import { resolveBookingPricing } from "@/lib/bookings/pricing";
import { newInvoiceNumber, onInvoicePaid } from "@/lib/bookings/billing";
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";

const STAFF_ROLES = new Set(["SUPER_ADMIN", "STUDIO_OWNER", "PHOTOGRAPHER", "VIDEOGRAPHER", "CREW"]);

const AdminCreateBookingSchema = z
  .object({
    tenantId: z.string().min(1),
    tenantSlug: z.string().min(1),
    slotId: z.string().min(1),
    // Either an existing customer account, or details for a new one.
    clientId: z.string().optional(),
    newClient: z
      .object({
        name: z.string().trim().min(2, "Customer name must be at least 2 characters"),
        email: z.string().trim().email("Please provide a valid customer email"),
        phone: z.string().trim().min(6, "Please provide a valid contact number"),
      })
      .optional(),
    discipline: z.string().default("PHOTOGRAPHY"),
    serviceTier: z.string().default("STANDARD"),
    category: z.string().optional(),
    creativeBrief: z.string().optional(),
    paymentStatus: z.enum(["PENDING", "PAID"]).default("PENDING"),
    paymentMethod: z.enum(["CARD", "QR_CODE", "CASH"]).default("CASH"),
    // Optional for staff (walk-ins may be priced by hand); sets deposit and balance when given.
    packageId: z.string().optional(),
  })
  .refine((v) => !!v.clientId || !!v.newClient, { message: "Select or create a customer" });

type AdminCreateBookingInput = z.input<typeof AdminCreateBookingSchema>;

export async function createBookingForCustomer(input: AdminCreateBookingInput) {
  try {
    const parsed = AdminCreateBookingSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid booking details" };
    }
    const data = parsed.data;

    // Only studio staff of this studio (or the platform super-admin) may book on a customer's behalf.
    const session = await getCurrentUser();
    if (
      !session ||
      !STAFF_ROLES.has(session.role) ||
      (session.role !== "SUPER_ADMIN" && session.tenantId !== data.tenantId)
    ) {
      return { success: false, error: "You are not allowed to create bookings for this studio" };
    }

    const result = await db.$transaction(async (tx) => {
      const slot = await tx.bookingSlot.findUnique({ where: { id: data.slotId } });
      if (!slot || slot.tenantId !== data.tenantId) throw new Error("Slot not found");
      if (slot.status !== "AVAILABLE") throw new Error("Slot is no longer available");

      // Resolve the customer account the booking will be linked to.
      let customer;
      if (data.clientId) {
        customer = await tx.user.findFirst({
          where: { id: data.clientId, tenantId: data.tenantId, role: "CLIENT" },
        });
        if (!customer) throw new Error("Customer account not found");
      } else {
        const email = data.newClient!.email.toLowerCase();
        const existing = await tx.user.findFirst({ where: { tenantId: data.tenantId, email } });
        if (existing && existing.role !== "CLIENT") {
          throw new Error("That email belongs to a studio staff account");
        }
        customer =
          existing ??
          (await tx.user.create({
            data: {
              tenantId: data.tenantId,
              name: data.newClient!.name,
              email,
              phone: data.newClient!.phone,
              role: "CLIENT",
              isQuickCreated: true,
            },
          }));
      }

      const isPaid = data.paymentStatus === "PAID";

      const priced = await resolveBookingPricing(tx, {
        tenantId: data.tenantId,
        slot,
        packageId: data.packageId,
        packageRequired: false,
      });
      if (!priced.ok) throw new Error(priced.message);
      const pricing = priced.pricing;

      // Claim the slot atomically so two admins (or a customer) can't double-book it.
      const claimed = await tx.bookingSlot.updateMany({
        where: { id: slot.id, status: "AVAILABLE" },
        data: {
          status: isPaid ? "BOOKED" : "PENDING_VERIFICATION",
          heldUntil: null,
          heldBySessionId: null,
        },
      });
      if (claimed.count !== 1) throw new Error("Slot is no longer available");

      const trackingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;

      const booking = await tx.clientBooking.create({
        data: {
          tenantId: data.tenantId,
          trackingCode,
          category: data.category || slot.category,
          clientName: customer.name,
          clientEmail: customer.email,
          clientPhone: customer.phone ?? data.newClient?.phone ?? "",
          discipline: data.discipline,
          serviceTier: pricing.packageName ?? data.serviceTier,
          targetDate: slot.date.toISOString().split("T")[0],
          creativeBrief: data.creativeBrief || null,
          status: isPaid ? "CONFIRMED" : "PENDING",
          depositPaid: isPaid,
          depositAmount: pricing.deposit,
          packageId: pricing.packageId,
          packageName: pricing.packageName,
          sessionPrice: pricing.sessionPrice,
          paymentMethod: data.paymentMethod,
          slotId: slot.id,
          userId: customer.id,
        },
      });

      // Every booking carries its deposit invoice: unpaid ones are what the
      // Verification console lists for approval; paid ones keep the ledger complete.
      const depositInvoice = await tx.milestoneInvoice.create({
        data: {
          tenantId: data.tenantId,
          invoiceNumber: newInvoiceNumber(),
          clientId: customer.id,
          bookingId: booking.id,
          milestoneType: "BOOKING_DEPOSIT",
          amount: pricing.deposit,
          status: isPaid ? "PAID" : "PENDING_VERIFICATION",
          paymentMethod: data.paymentMethod,
          paymentReference: `STAFF_BOOKING:${trackingCode}`,
          verifiedBy: isPaid ? session.name : null,
          dueDate: new Date(Date.now() + DEPOSIT_HOLD_HOURS * 3_600_000),
          paidAt: isPaid ? new Date() : null,
        },
      });

      // Deposit recorded as paid: the balance invoice goes out now.
      if (isPaid) await onInvoicePaid(tx, depositInvoice);

      return { booking, customerName: customer.name };
    });

    try {
      revalidatePath(`/${data.tenantSlug}/admin/calendar`);
      revalidatePath(`/${data.tenantSlug}/admin/verification`);
      revalidatePath(`/${data.tenantSlug}/book`);
      revalidatePath(`/${data.tenantSlug}/account`);
    } catch {
      // Non-request context fallback
    }

    return {
      success: true,
      bookingId: result.booking.id,
      trackingCode: result.booking.trackingCode,
      customerName: result.customerName,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create booking" };
  }
}

/** Full details of one booking, for the calendar's booking drill-down. Staff of the studio only. */
export async function getBookingDetails(input: { tenantId: string; bookingId: string }) {
  try {
    await requireStaff(input.tenantId);
    const [booking] = await loadBookingDetails(input.tenantId, { bookingId: input.bookingId });
    if (!booking) return { success: false as const, error: "Booking not found" };
    return { success: true as const, booking };
  } catch (err: any) {
    return { success: false as const, error: err.message || "Failed to load booking" };
  }
}
