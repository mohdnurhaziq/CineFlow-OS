import { z } from "zod";

export const CreateShowcaseItemSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  title: z.string().min(2, "Title must be at least 2 characters"),
  clientName: z.string().min(2, "Client name must be at least 2 characters"),
  category: z.string().min(1, "Category is required"),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]),
  coverImageUrl: z.string().min(1, "Cover image URL is required"),
  videoEmbedUrl: z.string().optional().nullable(),
  galleryImages: z.string().optional().nullable(), // JSON string or comma-separated URLs
  servicePackageId: z.string().optional().nullable(),
  isFeatured: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export type CreateShowcaseItemInput = z.infer<typeof CreateShowcaseItemSchema>;

export const UpdateShowcaseItemSchema = CreateShowcaseItemSchema.extend({
  id: z.string().min(1, "Showcase item ID is required"),
});

export type UpdateShowcaseItemInput = z.infer<typeof UpdateShowcaseItemSchema>;

export const DeleteShowcaseItemSchema = z.object({
  id: z.string().min(1, "Showcase item ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteShowcaseItemInput = z.infer<typeof DeleteShowcaseItemSchema>;

export const ToggleShowcaseFeaturedSchema = z.object({
  id: z.string().min(1, "Showcase item ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isFeatured: z.boolean(),
});

export type ToggleShowcaseFeaturedInput = z.infer<typeof ToggleShowcaseFeaturedSchema>;
