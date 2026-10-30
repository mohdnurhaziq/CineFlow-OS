"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  CreateProposalAddOnTemplateSchema,
  UpdateProposalAddOnTemplateSchema,
  DeleteProposalAddOnTemplateSchema,
  ToggleTemplateActiveSchema,
  ToggleTemplateDefaultSchema,
  type CreateProposalAddOnTemplateInput,
  type UpdateProposalAddOnTemplateInput,
  type DeleteProposalAddOnTemplateInput,
  type ToggleTemplateActiveInput,
  type ToggleTemplateDefaultInput,
} from "@/lib/validations/proposal-templates";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function createProposalAddOnTemplate(input: CreateProposalAddOnTemplateInput) {
  try {
    const validated = CreateProposalAddOnTemplateSchema.parse(input);
    const { tenantId, tenantSlug, name, description, price, unit, isDefault, isActive } = validated;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio tenant not found." };
    }

    const template = await db.proposalAddOnTemplate.create({
      data: {
        tenantId,
        name,
        description,
        price,
        unit,
        isDefault,
        isActive,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/proposals`);

    return { success: true, template };
  } catch (error: any) {
    return {
      success: false,
      error: "CREATE_TEMPLATE_FAILED",
      message: error.message || "Failed to create proposal add-on template.",
    };
  }
}

export async function updateProposalAddOnTemplate(input: UpdateProposalAddOnTemplateInput) {
  try {
    const validated = UpdateProposalAddOnTemplateSchema.parse(input);
    const { id, tenantId, tenantSlug, name, description, price, unit, isDefault, isActive } = validated;

    const existing = await db.proposalAddOnTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "TEMPLATE_NOT_FOUND", message: "Add-on template not found or does not belong to studio." };
    }

    const updated = await db.proposalAddOnTemplate.update({
      where: { id },
      data: {
        name,
        description,
        price,
        unit,
        isDefault,
        isActive,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/proposals`);

    return { success: true, template: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "UPDATE_TEMPLATE_FAILED",
      message: error.message || "Failed to update proposal add-on template.",
    };
  }
}

export async function deleteProposalAddOnTemplate(input: DeleteProposalAddOnTemplateInput) {
  try {
    const validated = DeleteProposalAddOnTemplateSchema.parse(input);
    const { id, tenantId, tenantSlug } = validated;

    const existing = await db.proposalAddOnTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "TEMPLATE_NOT_FOUND", message: "Add-on template not found or does not belong to studio." };
    }

    await db.proposalAddOnTemplate.delete({
      where: { id },
    });

    safeRevalidate(`/${tenantSlug}/admin/proposals`);

    return { success: true, deletedId: id };
  } catch (error: any) {
    return {
      success: false,
      error: "DELETE_TEMPLATE_FAILED",
      message: error.message || "Failed to delete proposal add-on template.",
    };
  }
}

export async function toggleAddOnTemplateDefault(input: ToggleTemplateDefaultInput) {
  try {
    const validated = ToggleTemplateDefaultSchema.parse(input);
    const { id, tenantId, tenantSlug, isDefault } = validated;

    const existing = await db.proposalAddOnTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "TEMPLATE_NOT_FOUND", message: "Add-on template not found or does not belong to studio." };
    }

    const updated = await db.proposalAddOnTemplate.update({
      where: { id },
      data: { isDefault },
    });

    safeRevalidate(`/${tenantSlug}/admin/proposals`);

    return { success: true, template: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_DEFAULT_FAILED",
      message: error.message || "Failed to toggle template default status.",
    };
  }
}

export async function toggleAddOnTemplateActive(input: ToggleTemplateActiveInput) {
  try {
    const validated = ToggleTemplateActiveSchema.parse(input);
    const { id, tenantId, tenantSlug, isActive } = validated;

    const existing = await db.proposalAddOnTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return { success: false, error: "TEMPLATE_NOT_FOUND", message: "Add-on template not found or does not belong to studio." };
    }

    const updated = await db.proposalAddOnTemplate.update({
      where: { id },
      data: { isActive },
    });

    safeRevalidate(`/${tenantSlug}/admin/proposals`);

    return { success: true, template: updated };
  } catch (error: any) {
    return {
      success: false,
      error: "TOGGLE_ACTIVE_FAILED",
      message: error.message || "Failed to toggle template active status.",
    };
  }
}
