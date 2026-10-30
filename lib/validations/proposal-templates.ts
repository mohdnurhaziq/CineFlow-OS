import { z } from "zod";

export const CreateProposalAddOnTemplateSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Add-on name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  unit: z.enum(["fixed", "per_hour", "per_day"]).default("fixed"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type CreateProposalAddOnTemplateInput = z.infer<typeof CreateProposalAddOnTemplateSchema>;

export const UpdateProposalAddOnTemplateSchema = CreateProposalAddOnTemplateSchema.extend({
  id: z.string().min(1, "Template ID is required"),
});

export type UpdateProposalAddOnTemplateInput = z.infer<typeof UpdateProposalAddOnTemplateSchema>;

export const DeleteProposalAddOnTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteProposalAddOnTemplateInput = z.infer<typeof DeleteProposalAddOnTemplateSchema>;

export const ToggleTemplateActiveSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isActive: z.boolean(),
});

export type ToggleTemplateActiveInput = z.infer<typeof ToggleTemplateActiveSchema>;

export const ToggleTemplateDefaultSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isDefault: z.boolean(),
});

export type ToggleTemplateDefaultInput = z.infer<typeof ToggleTemplateDefaultSchema>;
