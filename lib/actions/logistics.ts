"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  ToggleShotCompletionSchema,
  SubmitDigitalReleaseSchema,
  type ToggleShotCompletionInput,
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
