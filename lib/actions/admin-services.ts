"use server";

import { actionErrorMessage } from "@/lib/action-error";
import { sameCategory } from "@/lib/bookings/pricing-shared";
// Prices, and removing what clients book, are the owner's call; staff keep the rest.
import { requireOwner, requireStaff } from "@/lib/auth/guard";

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
    await requireOwner(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to create service package."),
    };
  }
}

export async function updateServicePackage(input: UpdateServicePackageInput) {
  try {
    const validated = UpdateServicePackageSchema.parse(input);
    await requireOwner(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to update service package."),
    };
  }
}

export async function deleteServicePackage(input: DeleteServicePackageInput) {
  try {
    const validated = DeleteServicePackageSchema.parse(input);
    await requireOwner(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to delete service package."),
    };
  }
}

export async function togglePackageFeatured(input: TogglePackageFeaturedInput) {
  try {
    const validated = TogglePackageFeaturedSchema.parse(input);
    await requireStaff(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to toggle package featured status."),
    };
  }
}

// ---------------------------------------------------------------------------
// Campaign Category Actions
// ---------------------------------------------------------------------------

export async function createCampaignCategory(input: CreateCampaignCategoryInput) {
  try {
    const validated = CreateCampaignCategorySchema.parse(input);
    await requireStaff(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to create campaign category."),
    };
  }
}

type CategoryTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Moves every record filed under `from` (matched loosely, as bookings do) to the slug `to`. */
async function renameCategorySlug(tx: CategoryTx, tenantId: string, from: string, to: string) {
  const models = [
    tx.servicePackage,
    tx.bookingSlot,
    tx.clientBooking,
    tx.showcaseItem,
    tx.project,
    tx.proposal,
  ] as unknown as Array<{
    findMany(args: object): Promise<Array<{ category: string }>>;
    updateMany(args: object): Promise<unknown>;
  }>;
  for (const model of models) {
    const used = await model.findMany({ where: { tenantId }, select: { category: true }, distinct: ["category"] });
    const matching = used.map((r) => r.category).filter((c) => sameCategory(c, from));
    if (matching.length > 0) {
      await model.updateMany({ where: { tenantId, category: { in: matching } }, data: { category: to } });
    }
  }
}

export async function updateCampaignCategory(input: UpdateCampaignCategoryInput) {
  try {
    const validated = UpdateCampaignCategorySchema.parse(input);
    await requireStaff(validated.tenantId);
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

    const category = await db.$transaction(async (tx) => {
      const updated = await tx.campaignCategory.update({
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
      // Packages, slots, bookings and the rest store the category as its slug text, so a
      // renamed slug must move them too, or they'd point at a category that no longer exists.
      if (slug !== existing.slug) await renameCategorySlug(tx, tenantId, existing.slug, slug);
      return updated;
    });

    safeRevalidate(`/${tenantSlug}/admin/services`);
    safeRevalidate(`/${tenantSlug}`);
    safeRevalidate(`/${tenantSlug}/book`);

    return { success: true, category };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_CATEGORY_FAILED",
      message: actionErrorMessage(error, "Failed to update campaign category."),
    };
  }
}

export async function deleteCampaignCategory(input: DeleteCampaignCategoryInput) {
  try {
    const validated = DeleteCampaignCategorySchema.parse(input);
    await requireOwner(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to delete campaign category."),
    };
  }
}

export async function toggleCategoryActive(input: ToggleCategoryActiveInput) {
  try {
    const validated = ToggleCategoryActiveSchema.parse(input);
    await requireStaff(validated.tenantId);
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
      message: actionErrorMessage(error, "Failed to toggle category active status."),
    };
  }
}
