"use server";

import { requireStaff } from "@/lib/auth/guard";
import { requireRecordAccess } from "@/lib/auth/project-access";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  ToggleShotCompletionSchema,
  CreateShotItemSchema,
  UpdateShotItemSchema,
  DeleteShotItemSchema,
  SubmitDigitalReleaseSchema,
  type ToggleShotCompletionInput,
  type CreateShotItemInput,
  type UpdateShotItemInput,
  type DeleteShotItemInput,
  type SubmitDigitalReleaseInput,
} from "@/lib/validations/logistics";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

/**
 * Toggles or updates the completion status of a ShotItem.
 * Automatically recalculates overall project shot completion metrics.
 */
export async function toggleShotCompletion(input: ToggleShotCompletionInput) {
  try {
    const validated = ToggleShotCompletionSchema.parse(input);
    const { shotId, status, tenantSlug } = validated;

    // 1. Verify ShotItem exists
    const existingShot = await db.shotItem.findUnique({
      where: { id: shotId },
      include: {
        project: {
          include: {
            callSheets: true,
            tenant: true,
          },
        },
      },
    });

    if (!existingShot) {
      return {
        success: false,
        error: "SHOT_NOT_FOUND",
        message: "The specified shot item does not exist.",
      };
    }

    // Only crew/staff of the studio that owns this shot may change it.
    await requireStaff(existingShot.project.tenantId);

    // 2. Update status
    const updatedShot = await db.shotItem.update({
      where: { id: shotId },
      data: { status },
    });

    // 3. Calculate project-wide shot progress metrics
    const allShots = await db.shotItem.findMany({
      where: { projectId: existingShot.projectId },
    });

    const totalShots = allShots.length;
    const completedShots = allShots.filter((s) => s.status === "COMPLETED").length;
    const inProgressShots = allShots.filter((s) => s.status === "IN_PROGRESS").length;
    const pendingShots = allShots.filter((s) => s.status === "PENDING").length;
    const percentage = totalShots > 0 ? Math.round((completedShots / totalShots) * 100) : 0;

    // 4. Revalidate cache
    const slug = tenantSlug || existingShot.project.tenant?.slug;
    if (slug) {
      for (const cs of existingShot.project.callSheets) {
        safeRevalidate(`/${slug}/set-hud/${cs.id}`);
      }
      safeRevalidate(`/${slug}/admin/projects/${existingShot.projectId}`);
      safeRevalidate(`/${slug}/admin`);
    }

    return {
      success: true,
      shot: updatedShot,
      totalShots,
      completedShots,
      inProgressShots,
      pendingShots,
      percentage,
    };
  } catch (err: any) {
    console.error("toggleShotCompletion failed:", err);
    return {
      success: false,
      error: "UPDATE_FAILED",
      message: err.message || "Failed to update shot status.",
    };
  }
}

/**
 * Creates a new ShotItem under a project.
 */
export async function createShotItem(input: CreateShotItemInput) {
  try {
    const validated = CreateShotItemSchema.parse(input);
    const {
      projectId,
      tenantSlug,
      sceneNumber,
      shotNumber,
      framing,
      cameraLens,
      lightingSetup,
      description,
      referenceImageUrl,
      status,
    } = validated;

    // 1. Verify project exists & enforce staff auth
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        callSheets: true,
        tenant: true,
      },
    });

    if (!project) {
      return {
        success: false,
        error: "PROJECT_NOT_FOUND",
        message: "The specified project was not found.",
      };
    }

    await requireStaff(project.tenantId);

    // 2. Determine sortOrder if not provided
    let sortOrder = validated.sortOrder;
    if (sortOrder === undefined) {
      const lastShot = await db.shotItem.findFirst({
        where: { projectId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (lastShot?.sortOrder ?? -1) + 1;
    }

    // 3. Create the shot item
    const shot = await db.shotItem.create({
      data: {
        projectId,
        sceneNumber,
        shotNumber,
        framing,
        cameraLens,
        lightingSetup,
        description,
        referenceImageUrl: referenceImageUrl || null,
        status: status || "PENDING",
        sortOrder,
      },
    });

    // 4. Revalidate cache
    const slug = tenantSlug || project.tenant?.slug;
    if (slug) {
      for (const cs of project.callSheets) {
        safeRevalidate(`/${slug}/set-hud/${cs.id}`);
      }
      safeRevalidate(`/${slug}/admin/projects/${projectId}`);
      safeRevalidate(`/${slug}/admin`);
    }

    return {
      success: true,
      shot,
    };
  } catch (err: any) {
    console.error("createShotItem failed:", err);
    return {
      success: false,
      error: "CREATE_FAILED",
      message: err.message || "Failed to create shot item.",
    };
  }
}

/**
 * Updates an existing ShotItem.
 */
export async function updateShotItem(input: UpdateShotItemInput) {
  try {
    const validated = UpdateShotItemSchema.parse(input);
    const { shotId, tenantSlug, ...updateData } = validated;

    // 1. Verify shot exists & check permissions
    const existingShot = await db.shotItem.findUnique({
      where: { id: shotId },
      include: {
        project: {
          include: {
            callSheets: true,
            tenant: true,
          },
        },
      },
    });

    if (!existingShot) {
      return {
        success: false,
        error: "SHOT_NOT_FOUND",
        message: "The specified shot item does not exist.",
      };
    }

    await requireStaff(existingShot.project.tenantId);

    // 2. Perform update
    const updatedShot = await db.shotItem.update({
      where: { id: shotId },
      data: {
        ...(updateData.sceneNumber !== undefined ? { sceneNumber: updateData.sceneNumber } : {}),
        ...(updateData.shotNumber !== undefined ? { shotNumber: updateData.shotNumber } : {}),
        ...(updateData.framing !== undefined ? { framing: updateData.framing } : {}),
        ...(updateData.cameraLens !== undefined ? { cameraLens: updateData.cameraLens } : {}),
        ...(updateData.lightingSetup !== undefined ? { lightingSetup: updateData.lightingSetup } : {}),
        ...(updateData.description !== undefined ? { description: updateData.description } : {}),
        ...(updateData.referenceImageUrl !== undefined ? { referenceImageUrl: updateData.referenceImageUrl } : {}),
        ...(updateData.status !== undefined ? { status: updateData.status } : {}),
        ...(updateData.sortOrder !== undefined ? { sortOrder: updateData.sortOrder } : {}),
      },
    });

    // 3. Revalidate cache
    const slug = tenantSlug || existingShot.project.tenant?.slug;
    if (slug) {
      for (const cs of existingShot.project.callSheets) {
        safeRevalidate(`/${slug}/set-hud/${cs.id}`);
      }
      safeRevalidate(`/${slug}/admin/projects/${existingShot.projectId}`);
      safeRevalidate(`/${slug}/admin`);
    }

    return {
      success: true,
      shot: updatedShot,
    };
  } catch (err: any) {
    console.error("updateShotItem failed:", err);
    return {
      success: false,
      error: "UPDATE_FAILED",
      message: err.message || "Failed to update shot item.",
    };
  }
}

/**
 * Deletes a ShotItem.
 */
export async function deleteShotItem(input: DeleteShotItemInput) {
  try {
    const validated = DeleteShotItemSchema.parse(input);
    const { shotId, tenantSlug } = validated;

    // 1. Verify shot exists & check permissions
    const existingShot = await db.shotItem.findUnique({
      where: { id: shotId },
      include: {
        project: {
          include: {
            callSheets: true,
            tenant: true,
          },
        },
      },
    });

    if (!existingShot) {
      return {
        success: false,
        error: "SHOT_NOT_FOUND",
        message: "The specified shot item does not exist.",
      };
    }

    await requireStaff(existingShot.project.tenantId);

    // 2. Delete shot
    await db.shotItem.delete({
      where: { id: shotId },
    });

    // 3. Revalidate cache
    const slug = tenantSlug || existingShot.project.tenant?.slug;
    if (slug) {
      for (const cs of existingShot.project.callSheets) {
        safeRevalidate(`/${slug}/set-hud/${cs.id}`);
      }
      safeRevalidate(`/${slug}/admin/projects/${existingShot.projectId}`);
      safeRevalidate(`/${slug}/admin`);
    }

    return {
      success: true,
    };
  } catch (err: any) {
    console.error("deleteShotItem failed:", err);
    return {
      success: false,
      error: "DELETE_FAILED",
      message: err.message || "Failed to delete shot item.",
    };
  }
}

/**
 * Submits an on-set digital release agreement (Talent or Location)
 * with base64 canvas signature data.
 */
export async function submitDigitalRelease(input: SubmitDigitalReleaseInput) {
  try {
    const validated = SubmitDigitalReleaseSchema.parse(input);
    const {
      projectId,
      tenantSlug,
      releaseType,
      signerName,
      signerEmail,
      signerPhone,
      signerRole,
      termsContent,
      signatureDataUrl,
      notes,
    } = validated;

    // 1. Verify project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        tenant: true,
      },
    });

    if (!project) {
      return {
        success: false,
        error: "PROJECT_NOT_FOUND",
        message: "The associated project was not found.",
      };
    }

    // Releases are collected while signed in (studio staff or the project's client) so each one
    // records who took it.
    const collector = await requireRecordAccess(project.tenantId, project.clientId);

    // 2. Insert digital release
    const release = await db.digitalRelease.create({
      data: {
        projectId,
        releaseType,
        signerName,
        signerEmail,
        signerPhone: signerPhone || null,
        signerRole: signerRole || null,
        termsContent,
        signatureDataUrl,
        notes: notes || null,
        signedAt: new Date(),
        collectedById: collector.id,
        collectedByName: collector.name,
      },
    });

    // 3. Revalidate cache
    const slug = tenantSlug || project.tenant.slug;
    if (slug) {
      safeRevalidate(`/${slug}/releases/${projectId}`);
    }

    return {
      success: true,
      releaseId: release.id,
      release,
    };
  } catch (err: any) {
    console.error("submitDigitalRelease failed:", err);
    return {
      success: false,
      error: "SUBMISSION_FAILED",
      message: err.message || "Failed to submit digital release.",
    };
  }
}
