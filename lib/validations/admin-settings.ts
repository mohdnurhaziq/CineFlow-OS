import { z } from "zod";
import { normalizeDomain } from "@/lib/domain-name";

/**
 * Settings are saved one tab at a time, so every field is optional: a field left out is left
 * unchanged; a text field sent empty (or null) is cleared.
 */
export const UpdateStudioSettingsSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Current tenant slug is required"),
  name: z.string().trim().min(2, "Studio name must be at least 2 characters").max(100).optional(),
  newSlug: z
    .string()
    .min(2, "The web address must be at least 2 characters")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "The web address can only use lowercase letters, numbers and hyphens")
    .optional(),
  // Stored as a bare lowercase host ("studio.example.com") so the middleware can match it.
  customDomain: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (!v || !v.trim()) return null;
      const domain = normalizeDomain(v);
      if (!domain) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a domain like studio.example.com." });
        return z.NEVER;
      }
      return domain;
    }),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]).optional(),
  tagline: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  brandColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter a colour like #f59e0b").optional(),
  currency: z.enum(["USD", "MYR", "SGD", "EUR", "GBP"]).optional(),
  qrCodeUrl: z.string().optional().nullable(),
  bankDetails: z.string().optional().nullable(),
  // Photo delivery: true releases full-resolution files on upload; false keeps watermarked previews until paid.
  releaseFilesBeforePayment: z.boolean().optional(),
});

export type UpdateStudioSettingsInput = z.input<typeof UpdateStudioSettingsSchema>;
