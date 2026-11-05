import { z } from "zod";

const ServicePackageFields = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Package name must be at least 2 characters"),
  category: z.string().min(1, "Category is required"),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  depositPrice: z.coerce.number().min(0, "Deposit price must be non-negative"),
  turnaround: z.string().min(1, "Turnaround duration is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  deliverables: z.string().min(3, "Deliverables scope must be specified"),
  isFeatured: z.boolean().default(false),
});

/** A deposit is part of the price, so it can never be larger than it. */
const depositWithinPrice = (data: { price: number; depositPrice: number }) => data.depositPrice <= data.price;
const depositWithinPriceError = {
  message: "The deposit can't be more than the package price.",
  path: ["depositPrice"],
};

export const CreateServicePackageSchema = ServicePackageFields.refine(depositWithinPrice, depositWithinPriceError);

export type CreateServicePackageInput = z.infer<typeof CreateServicePackageSchema>;

export const UpdateServicePackageSchema = ServicePackageFields.extend({
  id: z.string().min(1, "Package ID is required"),
}).refine(depositWithinPrice, depositWithinPriceError);

export type UpdateServicePackageInput = z.infer<typeof UpdateServicePackageSchema>;

export const DeleteServicePackageSchema = z.object({
  id: z.string().min(1, "Package ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteServicePackageInput = z.infer<typeof DeleteServicePackageSchema>;

export const TogglePackageFeaturedSchema = z.object({
  id: z.string().min(1, "Package ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isFeatured: z.boolean(),
});

export type TogglePackageFeaturedInput = z.infer<typeof TogglePackageFeaturedSchema>;

export const CreateCampaignCategorySchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Category name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Category slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  badgeIcon: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  autoCreateProject: z.boolean().optional().default(false),
});

export type CreateCampaignCategoryInput = z.input<typeof CreateCampaignCategorySchema>;

export const UpdateCampaignCategorySchema = CreateCampaignCategorySchema.extend({
  id: z.string().min(1, "Category ID is required"),
});

export type UpdateCampaignCategoryInput = z.input<typeof UpdateCampaignCategorySchema>;

export const DeleteCampaignCategorySchema = z.object({
  id: z.string().min(1, "Category ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteCampaignCategoryInput = z.infer<typeof DeleteCampaignCategorySchema>;

export const ToggleCategoryActiveSchema = z.object({
  id: z.string().min(1, "Category ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isActive: z.boolean(),
});

export type ToggleCategoryActiveInput = z.infer<typeof ToggleCategoryActiveSchema>;
