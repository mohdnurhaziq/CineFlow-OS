"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OWNER_ROLES, requireStaff } from "@/lib/auth/guard";
import { actionErrorMessage } from "@/lib/action-error";
import { BALANCE_DUE_AFTER_SESSION_DAYS } from "@/lib/bookings/billing";
import { sameCategory } from "@/lib/bookings/pricing-shared";
import { isSlotInPast, minutesOfDay, slotDateKey, formatSlotDate } from "@/lib/slot-time";
import { sendNotification } from "@/lib/notifications";

/**
 * What a studio does with a booking after it is made:
 *
 *   PENDING / CONFIRMED --reschedule--> same status, another slot
 *   PENDING / CONFIRMED --cancel------> CANCELLED (slot reopens, unpaid invoices voided)
 *   CONFIRMED ----------after the session--> COMPLETED or NO_SHOW
 *   COMPLETED ---------------------------> DELIVERED (optional gallery link for the client)
 *
 * Cancelling a booking whose deposit was paid is owner-only: the deposit may need refunding.
 */

const DAY_MS = 86_400_000;

const Base = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  bookingId: z.string().min(1),
});

type Result = { success: true } | { success: false; error: string; message: string };

function fail(error: string, message: string): Result {
  return { success: false, error, message };
}

function revalidate(tenantSlug: string) {
  for (const path of [`/${tenantSlug}/admin/bookings`, `/${tenantSlug}/admin/calendar`, `/${tenantSlug}/admin`, `/${tenantSlug}/account`, `/${tenantSlug}/book`]) {
    try {
      revalidatePath(path);
    } catch {
      // non-request context
    }
  }
}

const sessionText = (slot: { date: Date; startTime: string; endTime: string } | null) =>
  slot ? `${formatSlotDate(slot.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}, ${slot.startTime} – ${slot.endTime}` : "your session";

async function notifyClient(
  tenantId: string,
  booking: { clientName: string; clientEmail: string; clientPhone: string },
  update: { headline: string; message: string; linkUrl?: string; linkLabel?: string }
) {
  if (!booking.clientEmail) return;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
  if (!tenant) return;
  sendNotification({
    event: "STUDIO_UPDATE",
    studioName: tenant.name,
    studioSlug: tenant.slug,
    clientName: booking.clientName,
    clientEmail: booking.clientEmail,
    clientPhone: booking.clientPhone || undefined,
    linkUrl: update.linkUrl ?? `${env.NEXT_PUBLIC_APP_URL}/${tenant.slug}/account`,
    linkLabel: update.linkLabel ?? "View my booking",
    headline: update.headline,
    message: update.message,
  }).catch((e) => console.error("Notification dispatch failed:", e));
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

const CancelSchema = Base.extend({ reason: z.string().trim().min(3, "Give a short reason (it is shown to the client).").max(300) });

export async function cancelBooking(input: z.input<typeof CancelSchema>): Promise<Result> {
  try {
    const data = CancelSchema.parse(input);
    const session = await requireStaff(data.tenantId);
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId }, include: { slot: true } });
    if (!booking) return fail("NOT_FOUND", "Booking not found.");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      return fail("NOT_CANCELLABLE", "Only upcoming bookings can be cancelled.");
    }
    if (booking.depositPaid && !OWNER_ROLES.has(session.role)) {
      return fail("OWNER_ONLY", "Only the studio owner can cancel a paid booking, as the deposit may need refunding.");
    }

    await db.$transaction(async (tx) => {
      await tx.clientBooking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: data.reason,
          slotId: null,
          // Keep the session date on record once the slot is let go.
          targetDate: booking.slot ? slotDateKey(booking.slot.date) : booking.targetDate,
        },
      });
      if (booking.slotId) {
        await tx.bookingSlot.update({
          where: { id: booking.slotId },
          data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null },
        });
      }
      // Nothing more is owed for a cancelled booking. A paid deposit stays on record as paid.
      await tx.milestoneInvoice.updateMany({
        where: { bookingId: booking.id, status: { in: ["PENDING", "OVERDUE", "PENDING_VERIFICATION", "REJECTED"] } },
        data: { status: "VOID", verifiedBy: `Booking cancelled by ${session.name}` },
      });
    });

    revalidate(data.tenantSlug);
    await notifyClient(data.tenantId, booking, {
      headline: "Your booking was cancelled",
      message: `Your session on ${sessionText(booking.slot)} has been cancelled. Reason: ${data.reason}.${
        booking.depositPaid ? " The studio will contact you about your deposit." : ""
      }`,
    });
    return { success: true };
  } catch (err) {
    return fail("CANCEL_FAILED", actionErrorMessage(err, "Could not cancel the booking."));
  }
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

export interface RescheduleOption {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Open, upcoming slots in the booking's category that it could move to. */
export async function listRescheduleOptions(input: z.input<typeof Base>): Promise<{ success: true; slots: RescheduleOption[] } | { success: false; error: string; message: string }> {
  try {
    const data = Base.parse(input);
    await requireStaff(data.tenantId);
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId } });
    if (!booking) return { success: false, error: "NOT_FOUND", message: "Booking not found." };
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const slots = await db.bookingSlot.findMany({
      where: { tenantId: data.tenantId, status: "AVAILABLE", date: { gte: new Date(today.getTime() - DAY_MS) } },
      orderBy: [{ date: "asc" }],
      take: 300,
    });
    const options = slots
      .filter((s) => sameCategory(s.category, booking.category) && !isSlotInPast(s))
      .sort((a, b) => slotDateKey(a.date).localeCompare(slotDateKey(b.date)) || (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0))
      .slice(0, 60)
      .map((s) => ({ id: s.id, date: s.date.toISOString(), startTime: s.startTime, endTime: s.endTime }));
    return { success: true, slots: options };
  } catch (err) {
    return { success: false, error: "LIST_FAILED", message: actionErrorMessage(err, "Could not load open slots.") };
  }
}

const RescheduleSchema = Base.extend({ newSlotId: z.string().min(1) });

export async function rescheduleBooking(input: z.input<typeof RescheduleSchema>): Promise<Result> {
  try {
    const data = RescheduleSchema.parse(input);
    await requireStaff(data.tenantId);
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId }, include: { slot: true } });
    if (!booking) return fail("NOT_FOUND", "Booking not found.");
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      return fail("NOT_MOVABLE", "Only upcoming bookings can be moved.");
    }
    const target = await db.bookingSlot.findFirst({ where: { id: data.newSlotId, tenantId: data.tenantId } });
    if (!target || target.status !== "AVAILABLE") return fail("SLOT_UNAVAILABLE", "That slot is no longer open.");
    if (isSlotInPast(target)) return fail("SLOT_IN_PAST", "That slot has already passed.");
    if (!sameCategory(target.category, booking.category)) {
      return fail("CATEGORY_MISMATCH", "Move the booking to a slot in the same category, so its price still applies.");
    }

    // The new slot takes on the old one's state: booked once paid, otherwise awaiting payment.
    const newStatus = booking.status === "CONFIRMED" ? "BOOKED" : booking.slot?.status ?? "PENDING_VERIFICATION";
    await db.$transaction(async (tx) => {
      const claimed = await tx.bookingSlot.updateMany({
        where: { id: target.id, status: "AVAILABLE" },
        data: { status: newStatus, heldUntil: null, heldBySessionId: null },
      });
      if (claimed.count !== 1) throw new Error("That slot was just taken. Pick another.");
      if (booking.slotId) {
        await tx.bookingSlot.update({
          where: { id: booking.slotId },
          data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null },
        });
      }
      await tx.clientBooking.update({
        where: { id: booking.id },
        data: { slotId: target.id, targetDate: slotDateKey(target.date) },
      });
      // An unpaid balance stays due a week after the (new) session.
      const newDue = new Date(new Date(`${slotDateKey(target.date)}T00:00:00.000Z`).getTime() + BALANCE_DUE_AFTER_SESSION_DAYS * DAY_MS);
      await tx.milestoneInvoice.updateMany({
        where: { bookingId: booking.id, milestoneType: "BOOKING_BALANCE", status: { in: ["PENDING", "OVERDUE"] } },
        data: { dueDate: newDue, status: "PENDING" },
      });
    });

    revalidate(data.tenantSlug);
    await notifyClient(data.tenantId, booking, {
      headline: "Your booking was moved",
      message: `Your session has moved from ${sessionText(booking.slot)} to ${sessionText(target)}.`,
    });
    return { success: true };
  } catch (err) {
    return fail("RESCHEDULE_FAILED", actionErrorMessage(err, "Could not move the booking."));
  }
}

// ---------------------------------------------------------------------------
// After the session
// ---------------------------------------------------------------------------

const OutcomeSchema = Base.extend({ outcome: z.enum(["COMPLETED", "NO_SHOW"]) });

/** Marks a confirmed session as done, or the client as a no-show. Only once it has started. */
export async function recordSessionOutcome(input: z.input<typeof OutcomeSchema>): Promise<Result> {
  try {
    const data = OutcomeSchema.parse(input);
    await requireStaff(data.tenantId);
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId }, include: { slot: true } });
    if (!booking) return fail("NOT_FOUND", "Booking not found.");
    if (booking.status !== "CONFIRMED") return fail("NOT_CONFIRMED", "Only confirmed bookings can be marked as done or no-show.");
    if (booking.slot && !isSlotInPast(booking.slot)) return fail("NOT_STARTED", "The session hasn't started yet.");

    await db.clientBooking.update({ where: { id: booking.id }, data: { status: data.outcome, completedAt: new Date() } });
    revalidate(data.tenantSlug);
    return { success: true };
  } catch (err) {
    return fail("OUTCOME_FAILED", actionErrorMessage(err, "Could not update the booking."));
  }
}

const DeliverSchema = Base.extend({
  deliveryUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Enter a full link starting with https://"),
});

/** Marks the client's photos or files as delivered, with an optional link they'll see in their account. */
export async function markBookingDelivered(input: z.input<typeof DeliverSchema>): Promise<Result> {
  try {
    const data = DeliverSchema.parse(input);
    await requireStaff(data.tenantId);
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId } });
    if (!booking) return fail("NOT_FOUND", "Booking not found.");
    if (booking.status !== "COMPLETED" && booking.status !== "DELIVERED") {
      return fail("NOT_COMPLETED", "Mark the session as done before delivering.");
    }

    await db.clientBooking.update({
      where: { id: booking.id },
      data: { status: "DELIVERED", deliveredAt: booking.deliveredAt ?? new Date(), deliveryUrl: data.deliveryUrl ?? null },
    });
    revalidate(data.tenantSlug);
    await notifyClient(data.tenantId, booking, {
      headline: "Your photos are ready",
      message: data.deliveryUrl
        ? "Your files from the session are ready. Use the link below to view and download them."
        : "Your files from the session are ready. The studio will share them with you directly.",
      ...(data.deliveryUrl ? { linkUrl: data.deliveryUrl, linkLabel: "View my photos" } : {}),
    });
    return { success: true };
  } catch (err) {
    return fail("DELIVER_FAILED", actionErrorMessage(err, "Could not mark the booking delivered."));
  }
}
