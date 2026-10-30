"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateShowcaseItemSchema,
  UpdateShowcaseItemSchema,
  DeleteShowcaseItemSchema,
  ToggleShowcaseFeaturedSchema,
  type CreateShowcaseItemInput,
  type UpdateShowcaseItemInput,
  type DeleteShowcaseItemInput,
  type ToggleShowcaseFeaturedInput,
} from "@/lib/validations/admin-cms";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function createShowcaseItem(input: CreateShowcaseItemInput) {
  try {
    const validated = CreateShowcaseItemSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      title,
      clientName,
      category,
      discipline,
      coverImageUrl,
      videoEmbedUrl,
      galleryImages,
      servicePackageId,
      isFeatured,
      sortOrder,
    } = validated;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    const item = await db.showcaseItem.create({
      data: {
        tenantId,
        title,
        clientName,
        category,
        discipline,
        coverImageUrl,
        videoEmbedUrl: videoEmbedUrl || null,
        galleryImages: galleryImages || null,
        servicePackageId: servicePackageId || null,
        isFeatured,
        sortOrder,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/cms`);
    safeRevalidate(`/${tenantSlug}`);

    return { success: true, item };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_SHOWCASE_FAILED",
      message: error.message || "Failed to create showcase item.",
    };
  }
}

export async function updateShowcaseItem(input: UpdateShowcaseItemInput) {
  try {
    const validated = UpdateShowcaseItemSchema.parse(input);
    const {
      id,
      tenantId,
      tenantSlug,
      title,
      clientName,
      category,
      discipline,
      coverImageUrl,
      videoEmbedUrl,
      galleryImages,
      servicePackageId,
      isFeatured,
      sortOrder,
    } = validated;

    const existing = await db.showcaseItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "ITEM_NOT_FOUND", message: "Showcase item not found or does not belong to studio." };
    }

    const updated = await db.showcaseItem.update({
      where: { id },
      data: {
        title,
        clientName,
        category,
        discipline,
        coverImageUrl,
        videoEmbedUrl: videoEmbedUrl || null,
        galleryImages: galleryImages || null,
        servicePackageId: servicePackageId || null,
        isFeatured,
        sortOrder,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/cms`);
    safeRevalidate(`/${tenantSlug}`);

    return { success: true, item: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_SHOWCASE_FAILED",
      message: error.message || "Failed to update showcase item.",
    };
  }
}

export async function deleteShowcaseItem(input: DeleteShowcaseItemInput) {
  try {
    const validated = DeleteShowcaseItemSchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    const existing = await db.showcaseItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "ITEM_NOT_FOUND", message: "Showcase item not found or does not belong to studio." };
    }

    await db.showcaseItem.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/cms`);
    safeRevalidate(`/${tenantSlug}`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_SHOWCASE_FAILED",
      message: error.message || "Failed to delete showcase item.",
    };
  }
}

export async function toggleShowcaseFeatured(input: ToggleShowcaseFeaturedInput) {
  try {
    const validated = ToggleShowcaseFeaturedSchema.parse(input);
    const { id, tenantId, tenantSlug, isFeatured } = validated;

    const existing = await db.showcaseItem.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "ITEM_NOT_FOUND", message: "Showcase item not found or does not belong to studio." };
    }

    const updated = await db.showcaseItem.update({
      where: { id },
      data: { isFeatured },
    });

    safeRevalidate(`/${tenantSlug}/admin/cms`);
    safeRevalidate(`/${tenantSlug}`);

    return { success: true, item: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_FEATURED_FAILED",
      message: error.message || "Failed to toggle featured status.",
    };
  }
}
