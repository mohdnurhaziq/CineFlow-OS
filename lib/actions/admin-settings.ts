"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  UpdateStudioSettingsSchema,
  type UpdateStudioSettingsInput,
} from "@/lib/validations/admin-settings";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function updateStudioSettings(input: UpdateStudioSettingsInput) {
  try {
    const validated = UpdateStudioSettingsSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      name,
      newSlug,
      customDomain,
      discipline,
      tagline,
      bio,
      logoUrl,
      brandColor,
      currency,
      qrCodeUrl,
      bankDetails,
    } = validated;

    // Check tenant exists
    const currentTenant = await db.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!currentTenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    // Slug conflict check
    if (newSlug !== currentTenant.slug) {
      const slugConflict = await db.tenant.findUnique({
        where: { slug: newSlug },
      });
      if (slugConflict) {
        return {
          success: false,
          error: "SLUG_EXISTS",
          message: `Studio URL slug '${newSlug}' is already claimed by another tenant.`,
        };
      }
    }

    // Custom domain conflict check
    if (customDomain && customDomain !== currentTenant.customDomain) {
      const domainConflict = await db.tenant.findUnique({
        where: { customDomain },
      });
      if (domainConflict && domainConflict.id !== tenantId) {
        return {
          success: false,
          error: "DOMAIN_EXISTS",
          message: `Custom domain '${customDomain}' is already claimed by another tenant.`,
        };
      }
    }

    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        name,
        slug: newSlug,
        customDomain: customDomain || null,
        discipline,
        tagline: tagline || null,
        bio: bio || null,
        logoUrl: logoUrl || null,
        brandColor,
        currency,
        qrCodeUrl: qrCodeUrl || null,
        bankDetails: bankDetails || null,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/settings`);
    safeRevalidate(`/${newSlug}/admin/settings`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${newSlug}`);
    safeRevalidate(`/${tenantSlug}/checkout`);
    safeRevalidate(`/${newSlug}/checkout`);

    return {
      success: true,
      slugChanged: newSlug !== tenantSlug,
      newSlug,
      tenant: updated,
    };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_SETTINGS_FAILED",
      message: error.message || "Failed to update studio settings.",
    };
  }
}
