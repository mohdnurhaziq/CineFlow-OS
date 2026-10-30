"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateSingleSlotSchema,
  UpdateBookingSlotSchema,
  BatchGenerateSlotsSchema,
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

// ---------------------------------------------------------------------------
// Calendar Slot Server Actions
// ---------------------------------------------------------------------------

export async function createSingleBookingSlot(input: CreateSingleSlotInput) {
  try {
    const validated = CreateSingleSlotSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      date,
      startTime,
      endTime,
      category,
      campaignTitle,
      price,
      depositRequired,
      status,
    } = validated;

    // Verify tenant
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    // Standardize date to UTC midnight
    const slotDate = new Date(`${date}T00:00:00.000Z`);

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
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_SLOT_FAILED",
      message: error.message || "Failed to create booking slot.",
    };
  }
}

export async function updateBookingSlot(input: UpdateBookingSlotInput) {
  try {
    const validated = UpdateBookingSlotSchema.parse(input);
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

    const payload: any = { ...updateData };
    if (updateData.date) {
      payload.date = new Date(`${updateData.date}T00:00:00.000Z`);
    }

    const updated = await db.bookingSlot.update({
      where: { id },
      data: payload,
    });

    safeRevalidate(`/${tenantSlug}/admin/calendar`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, slot: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_SLOT_FAILED",
      message: error.message || "Failed to update booking slot.",
    };
  }
}

export async function deleteBookingSlot(input: DeleteBookingSlotInput) {
  try {
    const validated = DeleteBookingSlotSchema.parse(input);
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
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_SLOT_FAILED",
      message: error.message || "Failed to delete booking slot.",
    };
  }
}

export async function batchDeleteBookingSlots(input: BatchDeleteSlotsInput) {
  try {
    const validated = BatchDeleteSlotsSchema.parse(input);
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
  } catch (error: any) {
    return {
      success: false,
      error: "BATCH_DELETE_FAILED",
      message: error.message || "Failed to batch delete slots.",
    };
  }
}

export async function batchGenerateBookingSlots(input: BatchGenerateSlotsInput) {
  try {
    const validated = BatchGenerateSlotsSchema.parse(input);
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
      price,
      depositRequired,
      skipConflicts,
    } = validated;

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

    // Pre-query existing slots for conflict checking if skipConflicts is on
    let existingSlotKeys = new Set<string>();
    if (skipConflicts) {
      const existing = await db.bookingSlot.findMany({
        where: {
          tenantId,
          date: { gte: start, lte: end },
        },
        select: {
          date: true,
          startTime: true,
        },
      });

      for (const s of existing) {
        const dateStr = s.date.toISOString().split("T")[0];
        existingSlotKeys.add(`${dateStr}_${s.startTime}`);
      }
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
        const dateStr = current.toISOString().split("T")[0];
        let curMin = dayStartMin;

        while (curMin + slotDurationMinutes <= dayEndMin) {
          const slotEndMin = curMin + slotDurationMinutes;
          const formattedStart = formatMinutesToTime(curMin);
          const formattedEnd = formatMinutesToTime(slotEndMin);
          const key = `${dateStr}_${formattedStart}`;

          if (skipConflicts && existingSlotKeys.has(key)) {
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
            existingSlotKeys.add(key); // prevent duplicate in same batch
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
        message: "No new slots generated (all potential slots conflicted with existing inventory).",
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
      message: `Successfully generated ${createResult.count} slots across selected date window (${skippedCount} conflicts skipped).`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: "BATCH_GENERATE_FAILED",
      message: error.message || "Failed to batch generate booking slots.",
    };
  }
}

export async function forceReleaseHeldSlot(input: ForceReleaseSlotInput) {
  try {
    const validated = ForceReleaseSlotSchema.parse(input);
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
  } catch (error: any) {
    return {
      success: false,
      error: "FORCE_RELEASE_FAILED",
      message: error.message || "Failed to force release slot.",
    };
  }
}

export async function toggleBlockBookingSlot(input: ToggleBlockSlotInput) {
  try {
    const validated = ToggleBlockSlotSchema.parse(input);
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
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_BLOCK_FAILED",
      message: error.message || "Failed to toggle block status.",
    };
  }
}

export async function cleanupExpiredHolds(tenantId: string, tenantSlug: string) {
  try {
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
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
