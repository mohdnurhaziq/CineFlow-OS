"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateServicePackageSchema,
  UpdateServicePackageSchema,
  DeleteServicePackageSchema,
  TogglePackageFeaturedSchema,
  CreateCampaignCategorySchema,
  UpdateCampaignCategorySchema,
  DeleteCampaignCategorySchema,
  ToggleCategoryActiveSchema,
  type CreateServicePackageInput,
  type UpdateServicePackageInput,
  type DeleteServicePackageInput,
  type TogglePackageFeaturedInput,
  type CreateCampaignCategoryInput,
  type UpdateCampaignCategoryInput,
  type DeleteCampaignCategoryInput,
  type ToggleCategoryActiveInput,
} from "@/lib/validations/services";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

// ---------------------------------------------------------------------------
// Service Package Actions
// ---------------------------------------------------------------------------

export async function createServicePackage(input: CreateServicePackageInput) {
  try {
    const validated = CreateServicePackageSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      name,
      category,
      discipline,
      price,
      depositPrice,
      turnaround,
      description,
      deliverables,
      isFeatured,
    } = validated;

    // Verify tenant exists
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    const newPackage = await db.servicePackage.create({
      data: {
        tenantId,
        name,
        category,
        discipline,
        price,
        depositPrice,
        turnaround,
        description,
        deliverables,
        isFeatured,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, package: newPackage };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_PACKAGE_FAILED",
      message: error.message || "Failed to create service package.",
    };
  }
}

export async function updateServicePackage(input: UpdateServicePackageInput) {
  try {
    const validated = UpdateServicePackageSchema.parse(input);
    const {
      id,
      tenantId,
      tenantSlug,
      name,
      category,
      discipline,
      price,
      depositPrice,
      turnaround,
      description,
      deliverables,
      isFeatured,
    } = validated;

    // Check ownership
    const existing = await db.servicePackage.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "PACKAGE_NOT_FOUND", message: "Service package not found or does not belong to studio." };
    }

    const updatedPackage = await db.servicePackage.update({
      where: { id },
      data: {
        name,
        category,
        discipline,
        price,
        depositPrice,
        turnaround,
        description,
        deliverables,
        isFeatured,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, package: updatedPackage };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_PACKAGE_FAILED",
      message: error.message || "Failed to update service package.",
    };
  }
}

export async function deleteServicePackage(input: DeleteServicePackageInput) {
  try {
    const validated = DeleteServicePackageSchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    // Check ownership
    const existing = await db.servicePackage.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "PACKAGE_NOT_FOUND", message: "Service package not found or does not belong to studio." };
    }

    // Cascade safety: nullify any ShowcaseItem referencing this package before deleting
    await db.$transaction(async (tx) => {
      await tx.showcaseItem.updateMany({
        where: { servicePackageId: id },
        data: { servicePackageId: null },
      });

      await tx.servicePackage.delete({
        where: { id },
      });
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_PACKAGE_FAILED",
      message: error.message || "Failed to delete service package.",
    };
  }
}

export async function togglePackageFeatured(input: TogglePackageFeaturedInput) {
  try {
    const validated = TogglePackageFeaturedSchema.parse(input);
    const { id, tenantId, tenantSlug, isFeatured } = validated;

    const existing = await db.servicePackage.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "PACKAGE_NOT_FOUND", message: "Service package not found or does not belong to studio." };
    }

    const updated = await db.servicePackage.update({
      where: { id },
      data: { isFeatured },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, package: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_FEATURED_FAILED",
      message: error.message || "Failed to toggle package featured status.",
    };
  }
}

// ---------------------------------------------------------------------------
// Campaign Category Actions
// ---------------------------------------------------------------------------

export async function createCampaignCategory(input: CreateCampaignCategoryInput) {
  try {
    const validated = CreateCampaignCategorySchema.parse(input);
    const { tenantId, tenantSlug, name, slug, badgeIcon, description, sortOrder, isActive } = validated;

    // Check slug uniqueness within tenant
    const existing = await db.campaignCategory.findFirst({
      where: { tenantId, slug },
    });
    if (existing) {
      return { success: false, error: "SLUG_EXISTS", message: `A category with slug '${slug}' already exists for this studio.` };
    }

    const category = await db.campaignCategory.create({
      data: {
        tenantId,
        name,
        slug,
        badgeIcon: badgeIcon || null,
        description: description || null,
        sortOrder,
        isActive,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, category };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_CATEGORY_FAILED",
      message: error.message || "Failed to create campaign category.",
    };
  }
}

export async function updateCampaignCategory(input: UpdateCampaignCategoryInput) {
  try {
    const validated = UpdateCampaignCategorySchema.parse(input);
    const { id, tenantId, tenantSlug, name, slug, badgeIcon, description, sortOrder, isActive } = validated;

    // Check category ownership
    const existing = await db.campaignCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "CATEGORY_NOT_FOUND", message: "Category not found or does not belong to studio." };
    }

    // Check slug conflict if slug is changed
    if (slug !== existing.slug) {
      const conflict = await db.campaignCategory.findFirst({
        where: { tenantId, slug, NOT: { id } },
      });
      if (conflict) {
        return { success: false, error: "SLUG_EXISTS", message: `A category with slug '${slug}' already exists.` };
      }
    }

    const category = await db.campaignCategory.update({
      where: { id },
      data: {
        name,
        slug,
        badgeIcon: badgeIcon || null,
        description: description || null,
        sortOrder,
        isActive,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, category };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_CATEGORY_FAILED",
      message: error.message || "Failed to update campaign category.",
    };
  }
}

export async function deleteCampaignCategory(input: DeleteCampaignCategoryInput) {
  try {
    const validated = DeleteCampaignCategorySchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    // Check category ownership
    const existing = await db.campaignCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "CATEGORY_NOT_FOUND", message: "Category not found or does not belong to studio." };
    }

    // Dependency Guard: Check if packages use this category slug
    const packagesUsingCategory = await db.servicePackage.count({
      where: {
        tenantId,
        category: existing.slug,
      },
    });

    if (packagesUsingCategory > 0) {
      return {
        success: false,
        error: "CATEGORY_IN_USE",
        message: `Cannot delete category '${existing.name}': it is currently assigned to ${packagesUsingCategory} service package(s). Reassign or delete those packages first.`,
      };
    }

    await db.campaignCategory.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_CATEGORY_FAILED",
      message: error.message || "Failed to delete campaign category.",
    };
  }
}

export async function toggleCategoryActive(input: ToggleCategoryActiveInput) {
  try {
    const validated = ToggleCategoryActiveSchema.parse(input);
    const { id, tenantId, tenantSlug, isActive } = validated;

    const existing = await db.campaignCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "CATEGORY_NOT_FOUND", message: "Category not found or does not belong to studio." };
    }

    const updated = await db.campaignCategory.update({
      where: { id },
      data: { isActive },
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, category: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_CATEGORY_ACTIVE_FAILED",
      message: error.message || "Failed to toggle category active status.",
    };
  }
}
