"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateGearItemSchema,
  UpdateGearItemSchema,
  CreateKitBundleSchema,
  UpdateKitBundleSchema,
  CreateReservationSchema,
  LogPreShootInspectionSchema,
  LogPostShootInspectionSchema,
  type CreateGearItemInput,
  type UpdateGearItemInput,
  type CreateKitBundleInput,
  type UpdateKitBundleInput,
  type CreateReservationInput,
  type LogPreShootInspectionInput,
  type LogPostShootInspectionInput,
} from "@/lib/validations/gear";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

// ==============================================================================
// 1. INVENTORY ITEM ACTIONS (Feature 33)
// ==============================================================================

export async function createGearItem(input: CreateGearItemInput) {
  try {
    const validated = CreateGearItemSchema.parse(input);
    const { tenantId, tenantSlug, sku, ...data } = validated;

    // Check SKU uniqueness
    const existingSku = await db.inventoryItem.findUnique({
      where: { sku },
    });
    if (existingSku) {
      return {
        success: false,
        error: "SKU_EXISTS",
        message: `An inventory item with SKU '${sku}' already exists.`,
      };
    }

    const item = await db.inventoryItem.create({
      data: {
        tenantId,
        sku,
        ...data,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      item,
    };
  } catch (err: any) {
    console.error("createGearItem error:", err);
    return {
      success: false,
      error: "CREATE_FAILED",
      message: err.message || "Failed to create inventory item.",
    };
  }
}

export async function updateGearItem(input: UpdateGearItemInput) {
  try {
    const validated = UpdateGearItemSchema.parse(input);
    const { id, tenantId, tenantSlug, sku, ...data } = validated;

    const existing = await db.inventoryItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Equipment item not found in this studio tenant.",
      };
    }

    // Check SKU uniqueness if changed
    if (sku && sku !== existing.sku) {
      const conflict = await db.inventoryItem.findUnique({
        where: { sku },
      });
      if (conflict) {
        return {
          success: false,
          error: "SKU_EXISTS",
          message: `SKU '${sku}' is already taken by another item.`,
        };
      }
    }

    const updated = await db.inventoryItem.update({
      where: { id },
      data: {
        ...(sku ? { sku } : {}),
        ...data,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      item: updated,
    };
  } catch (err: any) {
    console.error("updateGearItem error:", err);
    return {
      success: false,
      error: "UPDATE_FAILED",
      message: err.message || "Failed to update inventory item.",
    };
  }
}

export async function deleteGearItem(input: {
  id: string;
  tenantId: string;
  tenantSlug: string;
}) {
  try {
    const { id, tenantId, tenantSlug } = input;

    const existing = await db.inventoryItem.findFirst({
      where: { id, tenantId },
      include: {
        reservations: {
          where: {
            status: { in: ["RESERVED", "CHECKED_OUT"] },
          },
        },
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Item not found.",
      };
    }

    if (existing.reservations.length > 0) {
      return {
        success: false,
        error: "ACTIVE_RESERVATIONS",
        message: "Cannot delete item with active shoot reservations or check-outs.",
      };
    }

    await db.inventoryItem.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return { success: true };
  } catch (err: any) {
    console.error("deleteGearItem error:", err);
    return {
      success: false,
      error: "DELETE_FAILED",
      message: err.message || "Failed to delete gear item.",
    };
  }
}

export async function updateGearConditionStatus(input: {
  id: string;
  tenantId: string;
  tenantSlug: string;
  condition?: string;
  status?: string;
  location?: string;
}) {
  try {
    const { id, tenantId, tenantSlug, condition, status, location } = input;

    const existing = await db.inventoryItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "NOT_FOUND" };
    }

    const updated = await db.inventoryItem.update({
      where: { id },
      data: {
        ...(condition ? { condition } : {}),
        ...(status ? { status } : {}),
        ...(location !== undefined ? { location } : {}),
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);
    return { success: true, item: updated };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ==============================================================================
// 2. KIT BUNDLE & BOM ACTIONS (Feature 34)
// ==============================================================================

export async function createKitBundle(input: CreateKitBundleInput) {
  try {
    const validated = CreateKitBundleSchema.parse(input);
    const { tenantId, tenantSlug, name, description, discipline, dailyRate, items } =
      validated;

    // Multi-tenant check: ensure every item belongs to the same tenant!
    const itemIds = items.map((i) => i.itemId);
    const tenantItems = await db.inventoryItem.findMany({
      where: {
        id: { in: itemIds },
        tenantId,
      },
      select: { id: true },
    });

    if (tenantItems.length !== itemIds.length) {
      return {
        success: false,
        error: "CROSS_TENANT_VIOLATION",
        message: "All constituent items in a kit bundle must belong to the same studio tenant.",
      };
    }

    const bundle = await db.$transaction(async (tx) => {
      const createdBundle = await tx.kitBundle.create({
        data: {
          tenantId,
          name,
          description,
          discipline,
          dailyRate: dailyRate || null,
        },
      });

      for (const item of items) {
        await tx.kitBundleItem.create({
          data: {
            bundleId: createdBundle.id,
            itemId: item.itemId,
            quantity: item.quantity,
          },
        });
      }

      return createdBundle;
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      bundle,
    };
  } catch (err: any) {
    console.error("createKitBundle error:", err);
    return {
      success: false,
      error: "CREATE_BUNDLE_FAILED",
      message: err.message || "Failed to create kit bundle.",
    };
  }
}

export async function updateKitBundle(input: UpdateKitBundleInput) {
  try {
    const validated = UpdateKitBundleSchema.parse(input);
    const { id, tenantId, tenantSlug, name, description, discipline, dailyRate, items } =
      validated;

    const existingBundle = await db.kitBundle.findFirst({
      where: { id, tenantId },
    });
    if (!existingBundle) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Kit bundle not found in this studio tenant.",
      };
    }

    // If new items specified, check tenant ownership
    if (items && items.length > 0) {
      const itemIds = items.map((i) => i.itemId);
      const tenantItems = await db.inventoryItem.findMany({
        where: {
          id: { in: itemIds },
          tenantId,
        },
        select: { id: true },
      });

      if (tenantItems.length !== itemIds.length) {
        return {
          success: false,
          error: "CROSS_TENANT_VIOLATION",
          message: "All constituent items must belong to the studio tenant.",
        };
      }
    }

    await db.$transaction(async (tx) => {
      await tx.kitBundle.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(description ? { description } : {}),
          ...(discipline ? { discipline } : {}),
          ...(dailyRate !== undefined ? { dailyRate } : {}),
        },
      });

      if (items) {
        // Re-sync kit bundle items
        await tx.kitBundleItem.deleteMany({
          where: { bundleId: id },
        });

        for (const item of items) {
          await tx.kitBundleItem.create({
            data: {
              bundleId: id,
              itemId: item.itemId,
              quantity: item.quantity,
            },
          });
        }
      }
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return { success: true };
  } catch (err: any) {
    console.error("updateKitBundle error:", err);
    return {
      success: false,
      error: "UPDATE_BUNDLE_FAILED",
      message: err.message || "Failed to update kit bundle.",
    };
  }
}

export async function deleteKitBundle(input: {
  id: string;
  tenantId: string;
  tenantSlug: string;
}) {
  try {
    const { id, tenantId, tenantSlug } = input;
    const existing = await db.kitBundle.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "NOT_FOUND" };
    }

    await db.kitBundle.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Checks real-time BOM availability for a kit bundle based on constituent item statuses.
 */
export async function checkBundleAvailability(bundleId: string, tenantId: string) {
  try {
    const bundle = await db.kitBundle.findFirst({
      where: { id: bundleId, tenantId },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!bundle) {
      return {
        success: false,
        error: "BUNDLE_NOT_FOUND",
        isFullyAvailable: false,
        totalItems: 0,
        availableItems: 0,
        conflictingItems: [],
        aggregateDailyRate: 0,
      };
    }

    const totalItems = bundle.items.length;
    let availableCount = 0;
    const conflictingItems: Array<{
      id: string;
      name: string;
      sku: string;
      status: string;
      condition: string;
      requiredQuantity: number;
    }> = [];
    let aggregateDailyRate = 0;

    for (const bItem of bundle.items) {
      const item = bItem.item;
      const rate = (item.dailyRate || 0) * bItem.quantity;
      aggregateDailyRate += rate;

      if (item.status === "AVAILABLE") {
        availableCount += 1;
      } else {
        conflictingItems.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          status: item.status,
          condition: item.condition,
          requiredQuantity: bItem.quantity,
        });
      }
    }

    const isFullyAvailable = availableCount === totalItems && totalItems > 0;

    return {
      success: true,
      bundleName: bundle.name,
      isFullyAvailable,
      totalItems,
      availableItems: availableCount,
      conflictingItems,
      aggregateDailyRate: bundle.dailyRate || aggregateDailyRate,
    };
  } catch (err: any) {
    console.error("checkBundleAvailability error:", err);
    return {
      success: false,
      error: "CHECK_FAILED",
      isFullyAvailable: false,
      totalItems: 0,
      availableItems: 0,
      conflictingItems: [],
      aggregateDailyRate: 0,
    };
  }
}

// ==============================================================================
// 3. RESERVATION & INSPECTION ACTIONS (Feature 35)
// ==============================================================================

export async function createEquipmentReservation(input: CreateReservationInput) {
  try {
    const validated = CreateReservationSchema.parse(input);
    const { tenantId, tenantSlug, projectId, itemId, startDate, endDate } = validated;

    // Verify Project and Item belong to tenant
    const [project, item] = await Promise.all([
      db.project.findFirst({ where: { id: projectId, tenantId } }),
      db.inventoryItem.findFirst({ where: { id: itemId, tenantId } }),
    ]);

    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND", message: "Project not found for this tenant." };
    }
    if (!item) {
      return { success: false, error: "ITEM_NOT_FOUND", message: "Gear item not found for this tenant." };
    }

    if (item.status === "MAINTENANCE") {
      return {
        success: false,
        error: "ITEM_UNDER_MAINTENANCE",
        message: "This gear item is quarantined under maintenance and cannot be reserved.",
      };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check date overlap with active reservations
    const overlap = await db.equipmentReservation.findFirst({
      where: {
        itemId,
        status: { in: ["RESERVED", "CHECKED_OUT"] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
    });

    if (overlap) {
      return {
        success: false,
        error: "DATE_CONFLICT",
        message: "This gear item is already reserved or checked out during this date window.",
      };
    }

    const reservation = await db.$transaction(async (tx) => {
      const res = await tx.equipmentReservation.create({
        data: {
          projectId,
          itemId,
          startDate: start,
          endDate: end,
          status: "RESERVED",
        },
      });

      // If item is currently AVAILABLE, update to RESERVED
      if (item.status === "AVAILABLE") {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { status: "RESERVED" },
        });
      }

      return res;
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      reservation,
    };
  } catch (err: any) {
    console.error("createEquipmentReservation error:", err);
    return {
      success: false,
      error: "RESERVATION_FAILED",
      message: err.message || "Failed to create gear reservation.",
    };
  }
}

/**
 * Pre-Shoot Check-Out Inspection:
 * Atomically transitions reservation to CHECKED_OUT, gear item to ON_SHOOT,
 * and records checkout condition inspection log.
 */
export async function logPreShootInspection(input: LogPreShootInspectionInput) {
  try {
    const validated = LogPreShootInspectionSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      reservationId,
      inspectorName,
      condition,
      notes,
      sensorVerified,
      mediaFormatted,
      batteriesCharged,
    } = validated;

    // Verify reservation and tenant ownership
    const reservation = await db.equipmentReservation.findFirst({
      where: {
        id: reservationId,
        project: { tenantId },
      },
      include: {
        item: true,
      },
    });

    if (!reservation) {
      return {
        success: false,
        error: "RESERVATION_NOT_FOUND",
        message: "Equipment reservation not found.",
      };
    }

    const checklistDetails = [
      sensorVerified ? "Sensor Verified Clean" : "Sensor Not Clean",
      mediaFormatted ? "Media Cards Formatted" : "Media Pending",
      batteriesCharged ? "Batteries 100% Charged" : "Batteries Partial",
    ].join(", ");

    const checkoutConditionText = `Condition: ${condition} | Checklist: [${checklistDetails}]`;

    await db.$transaction(async (tx) => {
      // 1. Upsert InspectionLog
      await tx.inspectionLog.upsert({
        where: { reservationId },
        create: {
          reservationId,
          inspectorName,
          checkoutCondition: checkoutConditionText,
          notes: notes || null,
        },
        update: {
          inspectorName,
          checkoutCondition: checkoutConditionText,
          notes: notes || null,
        },
      });

      // 2. Update EquipmentReservation status
      await tx.equipmentReservation.update({
        where: { id: reservationId },
        data: { status: "CHECKED_OUT" },
      });

      // 3. Update InventoryItem status & condition
      await tx.inventoryItem.update({
        where: { id: reservation.itemId },
        data: {
          status: "ON_SHOOT",
          condition,
        },
      });
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      message: "Pre-shoot checkout inspection logged and gear marked ON_SHOOT.",
    };
  } catch (err: any) {
    console.error("logPreShootInspection error:", err);
    return {
      success: false,
      error: "PRE_INSPECTION_FAILED",
      message: err.message || "Failed to log pre-shoot inspection.",
    };
  }
}

/**
 * Post-Shoot Check-In Inspection:
 * Atomically transitions reservation to RETURNED, records checkin condition inspection log,
 * and synchronizes gear item condition & status (AVAILABLE or MAINTENANCE).
 */
export async function logPostShootInspection(input: LogPostShootInspectionInput) {
  try {
    const validated = LogPostShootInspectionSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      reservationId,
      inspectorName,
      condition,
      damageFlag,
      notes,
    } = validated;

    // Verify reservation and tenant ownership
    const reservation = await db.equipmentReservation.findFirst({
      where: {
        id: reservationId,
        project: { tenantId },
      },
      include: {
        item: true,
        inspection: true,
      },
    });

    if (!reservation) {
      return {
        success: false,
        error: "RESERVATION_NOT_FOUND",
        message: "Equipment reservation not found.",
      };
    }

    const checkinConditionText = `Condition: ${condition} | Damage Flag: ${
      damageFlag ? "YES (ATTENTION NEEDED)" : "NO (CLEAN RETURN)"
    }`;

    // Determine target item status
    const isMaintenanceNeeded =
      damageFlag ||
      condition === "MAINTENANCE_NEEDED" ||
      condition === "DAMAGED";

    const nextItemStatus = isMaintenanceNeeded ? "MAINTENANCE" : "AVAILABLE";

    await db.$transaction(async (tx) => {
      // 1. Upsert / Update InspectionLog
      if (reservation.inspection) {
        const existingNotes = reservation.inspection.notes || "";
        const combinedNotes = notes
          ? existingNotes
            ? `${existingNotes}\n[CHECK-IN]: ${notes}`
            : notes
          : existingNotes;

        await tx.inspectionLog.update({
          where: { reservationId },
          data: {
            inspectorName,
            checkinCondition: checkinConditionText,
            notes: combinedNotes,
          },
        });
      } else {
        await tx.inspectionLog.create({
          data: {
            reservationId,
            inspectorName,
            checkoutCondition: "Retroactive check-in log",
            checkinCondition: checkinConditionText,
            notes: notes || null,
          },
        });
      }

      // 2. Update EquipmentReservation status
      await tx.equipmentReservation.update({
        where: { id: reservationId },
        data: { status: "RETURNED" },
      });

      // 3. Update InventoryItem status & condition
      await tx.inventoryItem.update({
        where: { id: reservation.itemId },
        data: {
          status: nextItemStatus,
          condition,
        },
      });
    });

    safeRevalidate(`/${tenantSlug}/admin/inventory`);

    return {
      success: true,
      nextItemStatus,
      message: `Gear check-in complete. Status set to ${nextItemStatus}.`,
    };
  } catch (err: any) {
    console.error("logPostShootInspection error:", err);
    return {
      success: false,
      error: "POST_INSPECTION_FAILED",
      message: err.message || "Failed to log post-shoot inspection.",
    };
  }
}
