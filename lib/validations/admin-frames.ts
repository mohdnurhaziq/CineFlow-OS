import { z } from "zod";

export const CreateFrameDesignSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Frame name must be at least 2 characters").max(100),
  material: z.string().min(2, "Material must be specified").max(50),
  moldingWidth: z.coerce.number().positive("Molding width must be greater than 0"),
  frameColor: z.string().min(1, "Frame color is required").max(30),
  previewAsset: z.string().min(1, "Preview asset URL is required"),
  priceOffset: z.coerce.number().min(0, "Price offset cannot be negative").default(0),
  isAvailable: z.boolean().default(true),
});

export type CreateFrameDesignInput = z.infer<typeof CreateFrameDesignSchema>;

export const UpdateFrameDesignSchema = CreateFrameDesignSchema.extend({
  id: z.string().min(1, "Frame ID is required"),
});

export type UpdateFrameDesignInput = z.infer<typeof UpdateFrameDesignSchema>;

export const DeleteFrameDesignSchema = z.object({
  id: z.string().min(1, "Frame ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteFrameDesignInput = z.infer<typeof DeleteFrameDesignSchema>;

export const ToggleFrameAvailabilitySchema = z.object({
  id: z.string().min(1, "Frame ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  isAvailable: z.boolean(),
});

export type ToggleFrameAvailabilityInput = z.infer<typeof ToggleFrameAvailabilitySchema>;

export const CreatePrintSizeSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  code: z.string().min(1, "Size code is required (e.g. 8R)").max(10),
  name: z.string().min(2, "Display name is required (e.g. 8R (8 x 10 in))").max(100),
  widthInches: z.coerce.number().positive("Width in inches must be positive"),
  heightInches: z.coerce.number().positive("Height in inches must be positive"),
  basePrice: z.coerce.number().min(0, "Base price cannot be negative"),
});

export type CreatePrintSizeInput = z.infer<typeof CreatePrintSizeSchema>;

export const UpdatePrintSizeSchema = CreatePrintSizeSchema.extend({
  id: z.string().min(1, "Print size ID is required"),
});

export type UpdatePrintSizeInput = z.infer<typeof UpdatePrintSizeSchema>;

export const DeletePrintSizeSchema = z.object({
  id: z.string().min(1, "Print size ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeletePrintSizeInput = z.infer<typeof DeletePrintSizeSchema>;
