"use server";

import { db } from "@/lib/db";
import { z } from "zod";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { isSlotInPast } from "@/lib/slot-time";
import { SLOT_HOLD_MINUTES } from "@/lib/bookings/hold";
import { errorMessageOf } from "@/lib/action-error";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";

const HoldSlotSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  previousSlotId: z.string().optional(),
});

const ReleaseSlotSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
});

const CreateBookingInputSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  clientName: z.string().min(2, "Full name must be at least 2 characters"),
  clientEmail: z.string().email("Please provide a valid email address"),
  clientPhone: z.string().min(6, "Please provide a valid contact number"),
  creativeBrief: z.string().optional(),
  serviceTier: z.string().default("STANDARD"),
  discipline: z.string().default("PHOTOGRAPHY"),
  category: z.string().default("STUDIO_PORTRAIT"),
  paymentMethod: z.enum(["CARD", "QR_CODE", "CASH"]).default("CARD"),
  packageId: z.string().optional(),
});

export type CreateBookingInput = z.input<typeof CreateBookingInputSchema>;
export type CreateBookingOutput = z.output<typeof CreateBookingInputSchema>;

export async function holdBookingSlot(input: z.infer<typeof HoldSlotSchema>) {
  // One visitor can't grab slot after slot to block a studio's calendar.
  const ip = await requestIp();
  if (ip && isRateLimited(`slot-hold:${ip}`, 30)) {
    return { success: false, error: "RATE_LIMITED", message: "Too many tries. Please wait a few minutes." };
  }
  try {
    const validated = HoldSlotSchema.parse(input);
    const { tenantId, slotId, sessionId, previousSlotId } = validated;

    const now = new Date();
    const holdDurationMs = SLOT_HOLD_MINUTES * 60_000;
    const heldUntil = new Date(Date.now() + holdDurationMs);

    // A session that has already started can't be held or booked.
    const target = await db.bookingSlot.findFirst({
      where: { id: slotId, tenantId },
      select: { date: true, startTime: true },
    });
    if (target && isSlotInPast(target, now)) {
      return { success: false, error: "SLOT_IN_PAST", message: "This session time has already passed. Please choose an upcoming slot." };
    }

    // 1. Atomic conditional hold update on target slot FIRST
    const result = await db.bookingSlot.updateMany({
      where: {
        id: slotId,
        tenantId, // Strict multi-tenant isolation
        OR: [
          { status: "AVAILABLE" },
          { status: "HELD", heldUntil: { lt: now } }, // Reclaim expired hold
          { status: "HELD", heldBySessionId: sessionId }, // Refresh own hold
        ],
      },
      data: {
        status: "HELD",
        heldUntil,
        heldBySessionId: sessionId,
      },
    });

    // 2. Handle conflict if slot was already acquired or unavailable
    if (result.count === 0) {
      const currentSlot = await db.bookingSlot.findFirst({
        where: { id: slotId, tenantId },
      });

      if (!currentSlot) {
        return { success: false, error: "SLOT_NOT_FOUND", message: "Booking slot does not exist." };
      }
      if (currentSlot.status === "BOOKED") {
        return { success: false, error: "SLOT_ALREADY_BOOKED", message: "This slot is already booked." };
      }
      if (currentSlot.status === "PENDING_VERIFICATION") {
        return { success: false, error: "SLOT_PENDING_VERIFICATION", message: "This slot is awaiting payment verification." };
      }
      if (currentSlot.status === "BLOCKED") {
        return { success: false, error: "SLOT_BLOCKED", message: "This slot is reserved for studio maintenance." };
      }

      return {
        success: false,
        error: "SLOT_ALREADY_HELD",
        message: "Someone else is booking this time right now. Please choose another time or check back shortly.",
      };
    }

    // 3. Target slot secured: now safely release previous slot held by this session
    if (previousSlotId && previousSlotId !== slotId) {
      await db.bookingSlot.updateMany({
        where: {
          id: previousSlotId,
          tenantId,
          status: "HELD",
          heldBySessionId: sessionId,
        },
        data: {
          status: "AVAILABLE",
          heldUntil: null,
          heldBySessionId: null,
        },
      });
    }

    // 4. Return updated slot
    const updatedSlot = await db.bookingSlot.findFirst({
      where: { id: slotId, tenantId },
    });

    return {
      success: true,
      heldUntil: heldUntil.toISOString(),
      slot: updatedSlot,
    };
  } catch (err) {
    console.error("Error holding booking slot:", err);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: errorMessageOf(err) || "That time could not be selected. Please try again.",
    };
  }
}

export async function releaseBookingSlot(input: z.infer<typeof ReleaseSlotSchema>) {
  try {
    const { tenantId, slotId, sessionId } = ReleaseSlotSchema.parse(input);

    const result = await db.bookingSlot.updateMany({
      where: {
        id: slotId,
        tenantId,
        status: "HELD",
        heldBySessionId: sessionId,
      },
      data: {
        status: "AVAILABLE",
        heldUntil: null,
        heldBySessionId: null,
      },
    });

    return { success: result.count > 0 };
  } catch (err) {
    console.error("Error releasing slot:", err);
    return { success: false, error: errorMessageOf(err) };
  }
}

/**
 * Books a held slot from the booking-page popup.
 *
 * This goes through the same checkout path as the dedicated checkout page, so
 * every booking gets its deposit invoice (which is what the studio's
 * Verification console lists) and card payments go through the studio's
 * payment gateway instead of being confirmed without payment.
 */
export async function createClientBooking(input: CreateBookingInput) {
  // Rate-limited in processBookingCheckout, which this goes through: counted once there.
  try {
    const validated = CreateBookingInputSchema.parse(input);

    const tenant = await db.tenant.findUnique({
      where: { id: validated.tenantId },
      select: { slug: true },
    });
    if (!tenant) {
      return { success: false, error: "Studio not found" };
    }

    const result = await processBookingCheckout({
      tenantId: validated.tenantId,
      tenantSlug: tenant.slug,
      slotId: validated.slotId,
      sessionId: validated.sessionId,
      clientName: validated.clientName,
      clientEmail: validated.clientEmail,
      clientPhone: validated.clientPhone,
      creativeBrief: validated.creativeBrief,
      paymentMethod: validated.paymentMethod,
      packageId: validated.packageId,
    });

    if (!result.success) {
      return { success: false, error: result.message || "Failed to create booking" };
    }

    return {
      success: true,
      bookingId: result.bookingId,
      trackingCode: result.trackingCode,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      status: result.status,
      // Present only when the client must finish paying on the gateway's page.
      paymentUrl: "paymentUrl" in result ? result.paymentUrl : undefined,
    };
  } catch (err) {
    console.error("Error creating booking:", err);
    return { success: false, error: errorMessageOf(err) || "Failed to create booking" };
  }
}
