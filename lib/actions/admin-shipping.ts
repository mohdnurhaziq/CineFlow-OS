"use server";

import { requireStaff } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import { SaveShippingZonesSchema, type SaveShippingZonesInput } from "@/lib/validations/admin-shipping";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

/** Replaces every shipping zone of the studio in one transaction. Zero zones means pickup only. */
export async function saveShippingZones(input: SaveShippingZonesInput) {
  try {
    const validated = SaveShippingZonesSchema.parse(input);
    await requireStaff(validated.tenantId);
    const { tenantId, tenantSlug, zones } = validated;

    await db.$transaction([
      db.shippingZone.deleteMany({ where: { tenantId } }),
      ...zones.map((z, i) =>
        db.shippingZone.create({
          data: { tenantId, name: z.name, fee: z.fee, statesJson: JSON.stringify(z.states), sortOrder: i },
        })
      ),
    ]);

    safeRevalidate(`/${tenantSlug}/admin/settings`);
    safeRevalidate(`/${tenantSlug}/visualizer`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: "SAVE_SHIPPING_ZONES_FAILED",
      message: actionErrorMessage(error, "Failed to save shipping zones."),
    };
  }
}
