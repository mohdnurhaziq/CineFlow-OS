"use server";

import { actionErrorMessage } from "@/lib/action-error";
import { requireOwner } from "@/lib/auth/guard";

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
    await requireOwner(validated.tenantId);
    const { tenantId, tenantSlug, newSlug, customDomain } = validated;

    // Check tenant exists
    const currentTenant = await db.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!currentTenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    // Slug conflict check
    if (newSlug !== undefined && newSlug !== currentTenant.slug) {
      const slugConflict = await db.tenant.findUnique({
        where: { slug: newSlug },
      });
      if (slugConflict) {
        return {
          success: false,
          error: "SLUG_EXISTS",
          message: `The web address '${newSlug}' is already taken by another studio.`,
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

    // Only what this save sent: each settings tab saves its own fields.
    const text = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        name: validated.name,
        slug: newSlug,
        customDomain,
        discipline: validated.discipline,
        tagline: text(validated.tagline),
        bio: text(validated.bio),
        logoUrl: text(validated.logoUrl),
        brandColor: validated.brandColor,
        currency: validated.currency,
        qrCodeUrl: text(validated.qrCodeUrl),
        bankDetails: text(validated.bankDetails),
        releaseFilesBeforePayment: validated.releaseFilesBeforePayment,
      },
    });

    // Never hand the encrypted gateway secret back to the browser.
    const { toyyibpaySecretEnc: _secret, ...publicTenant } = updated;

    safeRevalidate(`/${tenantSlug}/admin/settings`);
    safeRevalidate(`/${updated.slug}/admin/settings`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${updated.slug}`);
    safeRevalidate(`/${tenantSlug}/checkout`);
    safeRevalidate(`/${updated.slug}/checkout`);

    return {
      success: true,
      slugChanged: updated.slug !== tenantSlug,
      newSlug: updated.slug,
      tenant: publicTenant,
    };
  } catch (error) {
    return {
      success: false,
      error: "UPDATE_SETTINGS_FAILED",
      message: actionErrorMessage(error, "Failed to update studio settings."),
    };
  }
}
