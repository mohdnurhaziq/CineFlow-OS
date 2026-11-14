import { z } from "zod";
import { normalizeDomain } from "@/lib/domain-name";

export const UpdateStudioSettingsSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Current tenant slug is required"),
  name: z.string().min(2, "Studio name must be at least 2 characters").max(100),
  newSlug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  // Stored as a bare lowercase host ("studio.example.com") so the middleware can match it.
  customDomain: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const domain = normalizeDomain(v);
      if (!domain) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a domain like studio.example.com." });
        return z.NEVER;
      }
      return domain;
    }),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]),
  tagline: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  brandColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Valid hex color code required"),
  currency: z.enum(["USD", "MYR", "SGD", "EUR", "GBP"]),
  qrCodeUrl: z.string().optional().nullable(),
  bankDetails: z.string().optional().nullable(),
  // Photo delivery: true releases full-resolution files on upload; false keeps watermarked previews until paid.
  // Left out: unchanged.
  releaseFilesBeforePayment: z.boolean().optional(),
});

export type UpdateStudioSettingsInput = z.input<typeof UpdateStudioSettingsSchema>;
