"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateFrameDesignSchema,
  UpdateFrameDesignSchema,
  DeleteFrameDesignSchema,
  ToggleFrameAvailabilitySchema,
  CreatePrintSizeSchema,
  UpdatePrintSizeSchema,
  DeletePrintSizeSchema,
  type CreateFrameDesignInput,
  type UpdateFrameDesignInput,
  type DeleteFrameDesignInput,
  type ToggleFrameAvailabilityInput,
  type CreatePrintSizeInput,
  type UpdatePrintSizeInput,
  type DeletePrintSizeInput,
} from "@/lib/validations/admin-frames";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

// ---------------------------------------------------------------------------
// Frame Design Server Actions
// ---------------------------------------------------------------------------

export async function createFrameDesign(input: CreateFrameDesignInput) {
  try {
    const validated = CreateFrameDesignSchema.parse(input);
    const { tenantId, tenantSlug, name, material, moldingWidth, frameColor, previewAsset, priceOffset, isAvailable } = validated;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    const frame = await db.frameDesign.create({
      data: {
        tenantId,
        name,
        material,
        moldingWidth,
        frameColor,
        previewAsset,
        priceOffset,
        isAvailable,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, frame };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_FRAME_FAILED",
      message: error.message || "Failed to create frame design.",
    };
  }
}

export async function updateFrameDesign(input: UpdateFrameDesignInput) {
  try {
    const validated = UpdateFrameDesignSchema.parse(input);
    const { id, tenantId, tenantSlug, name, material, moldingWidth, frameColor, previewAsset, priceOffset, isAvailable } = validated;

    const existing = await db.frameDesign.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "FRAME_NOT_FOUND", message: "Frame design not found or does not belong to studio." };
    }

    const updated = await db.frameDesign.update({
      where: { id },
      data: {
        name,
        material,
        moldingWidth,
        frameColor,
        previewAsset,
        priceOffset,
        isAvailable,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, frame: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_FRAME_FAILED",
      message: error.message || "Failed to update frame design.",
    };
  }
}

export async function deleteFrameDesign(input: DeleteFrameDesignInput) {
  try {
    const validated = DeleteFrameDesignSchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    const existing = await db.frameDesign.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "FRAME_NOT_FOUND", message: "Frame design not found or does not belong to studio." };
    }

    await db.frameDesign.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_FRAME_FAILED",
      message: error.message || "Failed to delete frame design.",
    };
  }
}

export async function toggleFrameAvailability(input: ToggleFrameAvailabilityInput) {
  try {
    const validated = ToggleFrameAvailabilitySchema.parse(input);
    const { id, tenantId, tenantSlug, isAvailable } = validated;

    const existing = await db.frameDesign.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "FRAME_NOT_FOUND", message: "Frame design not found or does not belong to studio." };
    }

    const updated = await db.frameDesign.update({
      where: { id },
      data: { isAvailable },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, frame: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_FRAME_FAILED",
      message: error.message || "Failed to toggle frame availability.",
    };
  }
}

// ---------------------------------------------------------------------------
// Print Size Server Actions
// ---------------------------------------------------------------------------

export async function createPrintSize(input: CreatePrintSizeInput) {
  try {
    const validated = CreatePrintSizeSchema.parse(input);
    const { tenantId, tenantSlug, code, name, widthInches, heightInches, basePrice } = validated;

    const normalizedCode = code.toUpperCase().trim();

    // Check code uniqueness within tenant
    const existing = await db.printSize.findFirst({
      where: { tenantId, code: normalizedCode },
    });
    if (existing) {
      return {
        success: false,
        error: "CODE_EXISTS",
        message: `Print size code '${normalizedCode}' already exists for this studio.`,
      };
    }

    const printSize = await db.printSize.create({
      data: {
        tenantId,
        code: normalizedCode,
        name,
        widthInches,
        heightInches,
        basePrice,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, printSize };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_PRINT_SIZE_FAILED",
      message: error.message || "Failed to create print size.",
    };
  }
}

export async function updatePrintSize(input: UpdatePrintSizeInput) {
  try {
    const validated = UpdatePrintSizeSchema.parse(input);
    const { id, tenantId, tenantSlug, code, name, widthInches, heightInches, basePrice } = validated;

    const existing = await db.printSize.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "PRINT_SIZE_NOT_FOUND", message: "Print size not found or does not belong to studio." };
    }

    const normalizedCode = code.toUpperCase().trim();
    if (normalizedCode !== existing.code) {
      const conflict = await db.printSize.findFirst({
        where: { tenantId, code: normalizedCode, NOT: { id } },
      });
      if (conflict) {
        return {
          success: false,
          error: "CODE_EXISTS",
          message: `Print size code '${normalizedCode}' already exists for this studio.`,
        };
      }
    }

    const updated = await db.printSize.update({
      where: { id },
      data: {
        code: normalizedCode,
        name,
        widthInches,
        heightInches,
        basePrice,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, printSize: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_PRINT_SIZE_FAILED",
      message: error.message || "Failed to update print size.",
    };
  }
}

export async function deletePrintSize(input: DeletePrintSizeInput) {
  try {
    const validated = DeletePrintSizeSchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    const existing = await db.printSize.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "PRINT_SIZE_NOT_FOUND", message: "Print size not found or does not belong to studio." };
    }

    await db.printSize.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/frames`);
    safeRevalidate(`/${tenantSlug}/visualizer`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_PRINT_SIZE_FAILED",
      message: error.message || "Failed to delete print size.",
    };
  }
}
