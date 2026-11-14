"use server";

import { actionErrorMessage, errorMessageOf } from "@/lib/action-error";
import { OWNER_ROLES, requireStaff } from "@/lib/auth/guard";
import { packagesForCategory } from "@/lib/bookings/pricing";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateSingleSlotSchema,
  UpdateBookingSlotSchema,
  BatchGenerateSlotsSchema,
  slotDepositWithinFee,
  SLOT_DEPOSIT_ERROR,
  ForceReleaseSlotSchema,
  ToggleBlockSlotSchema,
  DeleteBookingSlotSchema,
  BatchDeleteSlotsSchema,
  type CreateSingleSlotInput,
  type UpdateBookingSlotInput,
  type BatchGenerateSlotsInput,
  type ForceReleaseSlotInput,
  type ToggleBlockSlotInput,
  type DeleteBookingSlotInput,
  type BatchDeleteSlotsInput,
} from "@/lib/validations/calendar";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

import { parseTimeToMinutes, formatMinutesToTime } from "@/lib/utils/time";
import { isSlotInPast, minutesOfDay, slotDateKey } from "@/lib/slot-time";

type SlotCheck = { ok: true } | { ok: false; error: string; message: string };

/** Start and end must be readable times, and the session must end after it starts. */
function checkSlotTimes(startTime: string, endTime: string): SlotCheck & { start?: number; end?: number } {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (start === null || end === null) {
    return { ok: false, error: "INVALID_TIME", message: "Enter the start and end times as e.g. 10:00 AM." };
  }
  if (end <= start) {
    return { ok: false, error: "INVALID_TIME_RANGE", message: "The end time must be after the start time." };
  }
  return { ok: true, start, end };
}

/**
 * The studio is one room: no two slots may share any minute of the same day, whatever their
 * status, or a client could book a time that is already booked or blacked out.
 */
async function findOverlap(
  tenantId: string,
  date: Date,
  start: number,
  end: number,
  excludeId?: string
): Promise<{ startTime: string; endTime: string } | null> {
  // Match the whole calendar day: older slots were saved with a time of day on `date`.
  const dayStart = new Date(`${slotDateKey(date)}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const sameDay = await db.bookingSlot.findMany({
    where: { tenantId, date: { gte: dayStart, lt: dayEnd }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { startTime: true, endTime: true },
  });
  return (
    sameDay.find((s) => {
      const a = minutesOfDay(s.startTime);
      const b = minutesOfDay(s.endTime);
      return a !== null && b !== null && a < end && start < b;
    }) ?? null
  );
}

/**
 * Setting prices is the owner's call. Slots a staff member opens are priced by the
 * category's packages (fee 0; the deposit is the package deposit the client picks), so a
 * category needs at least one package before staff can open slots in it.
 */
async function staffSlotPricing(
  tenantId: string,
  category: string
): Promise<{ ok: true; price: number; depositRequired: number } | { ok: false; error: string; message: string }> {
  const packages = await packagesForCategory(db, tenantId, category);
  if (packages.length === 0) {
    return {
      ok: false,
      error: "OWNER_PRICING_REQUIRED",
      message: "Only the studio owner can set slot prices. Ask them to add a package for this category in Services first.",
    };
  }
  return { ok: true, price: 0, depositRequired: Math.min(...packages.map((p) => p.depositPrice)) };
}

const overlapMessage = (s: { startTime: string; endTime: string }) =>
  `This overlaps the ${s.startTime} – ${s.endTime} slot on the same day. Edit or remove that slot first.`;

// ---------------------------------------------------------------------------
// Calendar Slot Server Actions
// ---------------------------------------------------------------------------

export async function createSingleBookingSlot(input: CreateSingleSlotInput) {
  try {
    const validated = CreateSingleSlotSchema.parse(input);
    const session = await requireStaff(validated.tenantId);
    const { tenantId, tenantSlug, date, startTime, endTime, category, campaignTitle, status } = validated;
    let { price, depositRequired } = validated;
    if (!OWNER_ROLES.has(session.role)) {
      if (status === "BLOCKED") {
        price = 0;
        depositRequired = 0;
      } else {
        const pricing = await staffSlotPricing(tenantId, category);
        if (!pricing.ok) return { success: false, error: pricing.error, message: pricing.message };
        ({ price, depositRequired } = pricing);
      }
    }

    // Verify tenant
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    const times = checkSlotTimes(startTime, endTime);
    if (!times.ok) return { success: false, error: times.error, message: times.message };

    // Standardize date to UTC midnight
    const slotDate = new Date(`${date}T00:00:00.000Z`);
    if (isNaN(slotDate.getTime())) {
      return { success: false, error: "INVALID_DATE", message: "Choose a valid date." };
    }
    if (isSlotInPast({ date: slotDate, startTime })) {
      return { success: false, error: "SLOT_IN_PAST", message: "That date and time has already passed." };
    }
    const clash = await findOverlap(tenantId, slotDate, times.start!, times.end!);
    if (clash) return { success: false, error: "SLOT_OVERLAP", message: overlapMessage(clash) };

    const slot = await db.bookingSlot.create({
      data: {
        tenantId,
        date: slotDate,
        startTime,
        endTime,
        category,
        campaignTitle: campaignTitle || null,
        price,
        depositRequired,
        status,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, slot };
  } catch (error) {
    return {
      success: false,
      error: "CREATE_SLOT_FAILED",
      message: actionErrorMessage(error, "Failed to create booking slot."),
    };
  }
}

export async function updateBookingSlot(input: UpdateBookingSlotInput) {
  try {
    const validated = UpdateBookingSlotSchema.parse(input);
    const session = await requireStaff(validated.tenantId);
    const { id, tenantId, tenantSlug, ...updateData } = validated;

    const existing = await db.bookingSlot.findFirst({
      where: { id, tenantId },
      include: { booking: true },
    });

    if (!existing) {
      return { success: false, error: "SLOT_NOT_FOUND", message: "Slot not found or does not belong to studio." };
    }

    // Prevent modifying status of booked slots to incompatible states
    if (existing.booking && updateData.status && updateData.status !== "BOOKED") {
      return {
        success: false,
        error: "SLOT_HAS_BOOKING",
        message: "Cannot change status of a slot that is already booked by a client.",
      };
    }

    const changesPrice =
      (updateData.price !== undefined && updateData.price !== existing.price) ||
      (updateData.depositRequired !== undefined && updateData.depositRequired !== existing.depositRequired);
    if (changesPrice && !OWNER_ROLES.has(session.role)) {
      return { success: false, error: "OWNER_ONLY", message: "Only the studio owner can change a slot's fee or deposit." };
    }

    if (!slotDepositWithinFee(updateData.price ?? existing.price, updateData.depositRequired ?? existing.depositRequired)) {
      return { success: false, error: "DEPOSIT_EXCEEDS_FEE", message: SLOT_DEPOSIT_ERROR };
    }

    const { date: newDateKey, ...slotFields } = updateData;
    const payload: Prisma.BookingSlotUpdateInput & { date?: Date } = {
      ...slotFields,
      ...(newDateKey ? { date: new Date(`${newDateKey}T00:00:00.000Z`) } : {}),
    };

    // Moving or resizing a slot gets the same checks as creating one.
    if (updateData.date || updateData.startTime || updateData.endTime) {
      const date: Date = payload.date ?? existing.date;
      const startTime = updateData.startTime ?? existing.startTime;
      const endTime = updateData.endTime ?? existing.endTime;
      const times = checkSlotTimes(startTime, endTime);
      if (!times.ok) return { success: false, error: times.error, message: times.message };
      if (isNaN(date.getTime())) return { success: false, error: "INVALID_DATE", message: "Choose a valid date." };
      const moved = date.getTime() !== existing.date.getTime() || startTime !== existing.startTime;
      if (moved && isSlotInPast({ date, startTime })) {
        return { success: false, error: "SLOT_IN_PAST", message: "That date and time has already passed." };
      }
      const clash = await findOverlap(tenantId, date, times.start!, times.end!, id);
      if (clash) return { success: false, error: "SLOT_OVERLAP", message: overlapMessage(clash) };
    }

    const updated = await db.bookingSlot.update({
      where: { id },
      data: payload,
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, slot: updated };
  } catch (error) {
    return {
      success: false,
      error: "UPDATE_SLOT_FAILED",
      message: actionErrorMessage(error, "Failed to update booking slot."),
    };
  }
}

export async function deleteBookingSlot(input: DeleteBookingSlotInput) {
  try {
    const validated = DeleteBookingSlotSchema.parse(input);
    await requireStaff(validated.tenantId);
    const { slotId, tenantId, tenantSlug } = validated;

    const slot = await db.bookingSlot.findFirst({
      where: { id: slotId, tenantId },
      include: { booking: true },
    });

    if (!slot) {
      return { success: false, error: "SLOT_NOT_FOUND", message: "Booking slot not found." };
    }

    if (slot.booking || slot.status === "BOOKED" || slot.status === "PENDING_VERIFICATION") {
      return {
        success: false,
        error: "SLOT_HAS_BOOKING",
        message: "Cannot delete a slot with an active or pending client booking.",
      };
    }

    await db.bookingSlot.delete({
      where: { id: slotId },
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, deletedId: slotId };
  } catch (error) {
    return {
      success: false,
      error: "DELETE_SLOT_FAILED",
      message: actionErrorMessage(error, "Failed to delete booking slot."),
    };
  }
}

export async function batchDeleteBookingSlots(input: BatchDeleteSlotsInput) {
  try {
    const validated = BatchDeleteSlotsSchema.parse(input);
    await requireStaff(validated.tenantId);
    const { tenantId, tenantSlug, slotIds } = validated;

    // Filter out any slots that have client bookings or are BOOKED/PENDING_VERIFICATION
    const eligibleSlots = await db.bookingSlot.findMany({
      where: {
        id: { in: slotIds },
        tenantId,
        status: { notIn: ["BOOKED", "PENDING_VERIFICATION"] },
        booking: null,
      },
      select: { id: true },
    });

    const eligibleIds = eligibleSlots.map((s) => s.id);
    if (eligibleIds.length === 0) {
      return {
        success: false,
        error: "NO_DELETABLE_SLOTS",
        message: "None of the selected slots could be deleted (they may be booked or pending).",
      };
    }

    const deleteResult = await db.bookingSlot.deleteMany({
      where: { id: { in: eligibleIds } },
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return {
      success: true,
      deletedCount: deleteResult.count,
      skippedCount: slotIds.length - deleteResult.count,
    };
  } catch (error) {
    return {
      success: false,
      error: "BATCH_DELETE_FAILED",
      message: actionErrorMessage(error, "Failed to batch delete slots."),
    };
  }
}

export async function batchGenerateBookingSlots(input: BatchGenerateSlotsInput) {
  try {
    const validated = BatchGenerateSlotsSchema.parse(input);
    const session = await requireStaff(validated.tenantId);
    const {
      tenantId,
      tenantSlug,
      startDate,
      endDate,
      daysOfWeek,
      dayStartTime,
      dayEndTime,
      slotDurationMinutes,
      bufferMinutes,
      category,
      campaignTitle,
    } = validated;
    let { price, depositRequired } = validated;
    if (!OWNER_ROLES.has(session.role)) {
      const pricing = await staffSlotPricing(tenantId, category);
      if (!pricing.ok) return { success: false, error: pricing.error, message: pricing.message };
      ({ price, depositRequired } = pricing);
    }

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Tenant not found." };
    }

    const dayStartMin = parseTimeToMinutes(dayStartTime);
    const dayEndMin = parseTimeToMinutes(dayEndTime);

    if (dayStartMin >= dayEndMin) {
      return {
        success: false,
        error: "INVALID_TIME_RANGE",
        message: "Day start time must be before day end time.",
      };
    }

    if (slotDurationMinutes <= 0) {
      return {
        success: false,
        error: "INVALID_DURATION",
        message: "Slot duration must be greater than zero.",
      };
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (start > end) {
      return {
        success: false,
        error: "INVALID_DATE_RANGE",
        message: "Start date must be before or equal to end date.",
      };
    }

    // Existing slots per day, so new ones never overlap them (or each other).
    const taken = new Map<string, Array<[number, number]>>();
    const existing = await db.bookingSlot.findMany({
      // `lt` the day after `end`, so slots saved with a time of day on the last date count too.
      where: { tenantId, date: { gte: start, lt: new Date(end.getTime() + 86_400_000) } },
      select: { date: true, startTime: true, endTime: true },
    });
    for (const s of existing) {
      const a = minutesOfDay(s.startTime);
      const b = minutesOfDay(s.endTime);
      if (a === null || b === null) continue;
      const key = slotDateKey(s.date);
      taken.set(key, [...(taken.get(key) ?? []), [a, b]]);
    }

    const slotsToCreate: Array<{
      tenantId: string;
      category: string;
      campaignTitle: string | null;
      date: Date;
      startTime: string;
      endTime: string;
      price: number;
      depositRequired: number;
      status: string;
    }> = [];

    let skippedCount = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getUTCDay(); // 0 = Sun, 6 = Sat
      if (daysOfWeek.includes(dayOfWeek)) {
        const dateStr = current.toISOString().slice(0, 10);
        let curMin = dayStartMin;

        while (curMin + slotDurationMinutes <= dayEndMin) {
          const slotEndMin = curMin + slotDurationMinutes;
          const formattedStart = formatMinutesToTime(curMin);
          const formattedEnd = formatMinutesToTime(slotEndMin);
          const dayTaken = taken.get(dateStr) ?? [];
          const overlaps = dayTaken.some(([a, b]) => a < slotEndMin && curMin < b);

          if (overlaps || isSlotInPast({ date: current, startTime: formattedStart })) {
            skippedCount++;
          } else {
            slotsToCreate.push({
              tenantId,
              category,
              campaignTitle: campaignTitle || null,
              date: new Date(current),
              startTime: formattedStart,
              endTime: formattedEnd,
              price,
              depositRequired,
              status: "AVAILABLE",
            });
            taken.set(dateStr, [...dayTaken, [curMin, slotEndMin]]); // and none overlap within the batch
          }

          curMin = slotEndMin + bufferMinutes;
        }
      }

      // Increment by 1 day
      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (slotsToCreate.length === 0) {
      return {
        success: true,
        createdCount: 0,
        skippedCount,
        message: "No new slots generated: every time overlapped an existing slot or had already passed.",
      };
    }

    const createResult = await db.bookingSlot.createMany({
      data: slotsToCreate,
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return {
      success: true,
      createdCount: createResult.count,
      skippedCount,
      message: `Generated ${createResult.count} slots (${skippedCount} skipped: overlapping an existing slot or already past).`,
    };
  } catch (error) {
    return {
      success: false,
      error: "BATCH_GENERATE_FAILED",
      message: actionErrorMessage(error, "Failed to batch generate booking slots."),
    };
  }
}

export async function forceReleaseHeldSlot(input: ForceReleaseSlotInput) {
  try {
    const validated = ForceReleaseSlotSchema.parse(input);
    await requireStaff(validated.tenantId);
    const { slotId, tenantId, tenantSlug } = validated;

    // Atomic conditional update: only updates if slot is actually HELD
    const updateResult = await db.bookingSlot.updateMany({
      where: {
        id: slotId,
        tenantId,
        status: "HELD",
      },
      data: {
        status: "AVAILABLE",
        heldUntil: null,
        heldBySessionId: null,
      },
    });

    if (updateResult.count === 0) {
      return {
        success: false,
        error: "NOT_HELD",
        message: "Slot is not currently in HELD status or does not belong to studio.",
      };
    }

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, slotId };
  } catch (error) {
    return {
      success: false,
      error: "FORCE_RELEASE_FAILED",
      message: actionErrorMessage(error, "Failed to force release slot."),
    };
  }
}

export async function toggleBlockBookingSlot(input: ToggleBlockSlotInput) {
  try {
    const validated = ToggleBlockSlotSchema.parse(input);
    await requireStaff(validated.tenantId);
    const { slotId, tenantId, tenantSlug } = validated;

    const slot = await db.bookingSlot.findFirst({
      where: { id: slotId, tenantId },
    });

    if (!slot) {
      return { success: false, error: "SLOT_NOT_FOUND", message: "Booking slot not found." };
    }

    if (slot.status === "HELD" || slot.status === "BOOKED" || slot.status === "PENDING_VERIFICATION") {
      return {
        success: false,
        error: "CANNOT_BLOCK",
        message: `Cannot toggle block on a slot with status ${slot.status}.`,
      };
    }

    const newStatus = slot.status === "BLOCKED" ? "AVAILABLE" : "BLOCKED";

    const updated = await db.bookingSlot.update({
      where: { id: slotId },
      data: { status: newStatus },
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, slot: updated };
  } catch (error) {
    return {
      success: false,
      error: "TOGGLE_BLOCK_FAILED",
      message: actionErrorMessage(error, "Failed to toggle block status."),
    };
  }
}

export async function cleanupExpiredHolds(tenantId: string, tenantSlug: string) {
  try {
    await requireStaff(tenantId);
    const now = new Date();
    const result = await db.bookingSlot.updateMany({
      where: {
        tenantId,
        status: "HELD",
        heldUntil: { lt: now },
      },
      data: {
        status: "AVAILABLE",
        heldUntil: null,
        heldBySessionId: null,
      },
    });

    if (result.count > 0) {
      safeRevalidate(`/${tenantSlug}/admin/calendar`);
      safeRevalidate(`/${tenantSlug}/book`);
    }

    return { success: true, releasedCount: result.count };
  } catch (error) {
    return { success: false, error: errorMessageOf(error) };
  }
}
