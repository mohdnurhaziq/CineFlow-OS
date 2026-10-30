"use server";

import { db } from "@/lib/db";
import { z } from "zod";

export const HoldSlotSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  previousSlotId: z.string().optional(),
});

export const ReleaseSlotSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
});

export const CreateBookingInputSchema = z.object({
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
});

export type CreateBookingInput = z.input<typeof CreateBookingInputSchema>;
export type CreateBookingOutput = z.output<typeof CreateBookingInputSchema>;

export async function holdBookingSlot(input: z.infer<typeof HoldSlotSchema>) {
  try {
    const validated = HoldSlotSchema.parse(input);
    const { tenantId, slotId, sessionId, previousSlotId } = validated;

    const now = new Date();
    const holdDurationMs = 10 * 60 * 1000; // Exactly 10 minutes
    const heldUntil = new Date(Date.now() + holdDurationMs);

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
        message: "This slot was just held by another client. Please choose another time or check back shortly.",
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
  } catch (err: any) {
    console.error("Error holding booking slot:", err);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: err.message || "Failed to hold slot",
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
  } catch (err: any) {
    console.error("Error releasing slot:", err);
    return { success: false, error: err.message };
  }
}

export async function getTenantBookingSlots(params: {
  tenantSlug: string;
  category?: string;
  date?: string;
}) {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: params.tenantSlug },
      select: { id: true },
    });

    if (!tenant) {
      return { success: false, error: "Tenant not found", slots: [] };
    }

    const now = new Date();

    // Auto-cleanup expired holds
    await db.bookingSlot.updateMany({
      where: {
        tenantId: tenant.id,
        status: "HELD",
        heldUntil: { lt: now },
      },
      data: {
        status: "AVAILABLE",
        heldUntil: null,
        heldBySessionId: null,
      },
    });

    const whereClause: any = { tenantId: tenant.id };
    if (params.category && params.category !== "all") {
      whereClause.category = params.category;
    }

    const slots = await db.bookingSlot.findMany({
      where: whereClause,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        booking: {
          select: { id: true, clientName: true, status: true },
        },
      },
    });

    return { success: true, slots };
  } catch (err: any) {
    console.error("Error fetching slots:", err);
    return { success: false, error: err.message, slots: [] };
  }
}

export async function createClientBooking(input: CreateBookingInput) {
  try {
    const validated = CreateBookingInputSchema.parse(input);
    const {
      tenantId,
      slotId,
      sessionId,
      clientName,
      clientEmail,
      clientPhone,
      creativeBrief,
      serviceTier,
      discipline,
      category,
      paymentMethod,
    } = validated;

    const slot = await db.bookingSlot.findUnique({
      where: { id: slotId },
    });

    if (!slot || slot.tenantId !== tenantId) {
      return { success: false, error: "Slot not found" };
    }

    // Must be either held by this session (and not expired) or available
    const now = new Date();
    const isHeldByMe = slot.status === "HELD" && slot.heldBySessionId === sessionId && slot.heldUntil && slot.heldUntil > now;
    const isAvailable = slot.status === "AVAILABLE";

    if (!isHeldByMe && !isAvailable) {
      return { success: false, error: "Slot is no longer available" };
    }

    const trackingCode = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const booking = await db.$transaction(async (tx) => {
      // Create user if not exists
      let user = await tx.user.findUnique({ where: { email: clientEmail } });
      if (!user) {
        user = await tx.user.create({
          data: {
            tenantId,
            name: clientName,
            email: clientEmail,
            phone: clientPhone,
            role: "CLIENT",
            isQuickCreated: true,
          },
        });
      }

      // Create ClientBooking
      const createdBooking = await tx.clientBooking.create({
        data: {
          tenantId,
          trackingCode,
          category,
          clientName,
          clientEmail,
          clientPhone,
          discipline,
          serviceTier,
          targetDate: slot.date.toISOString().split("T")[0],
          creativeBrief: creativeBrief || null,
          status: paymentMethod === "CARD" ? "CONFIRMED" : "PENDING",
          depositPaid: paymentMethod === "CARD",
          depositAmount: slot.depositRequired,
          paymentMethod,
          slotId: slot.id,
          userId: user.id,
        },
      });

      // Update slot status
      await tx.bookingSlot.update({
        where: { id: slot.id },
        data: {
          status: paymentMethod === "CARD" ? "BOOKED" : "PENDING_VERIFICATION",
          heldUntil: null,
          heldBySessionId: null,
        },
      });

      return createdBooking;
    });

    return {
      success: true,
      bookingId: booking.id,
      trackingCode: booking.trackingCode,
    };
  } catch (err: any) {
    console.error("Error creating booking:", err);
    return { success: false, error: err.message || "Failed to create booking" };
  }
}
