import { z } from "zod";

export const StudioDisciplineEnum = z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]);
export const CurrencyEnum = z.enum(["USD", "MYR", "EUR", "GBP"]);
export const SubscriptionTierEnum = z.enum(["STARTER", "PRO", "STUDIO_UNLIMITED"]);

export const RESERVED_SLUGS = new Set([
  "super-admin",
  "create-studio",
  "api",
  "admin",
  "login",
  "auth",
  "public",
  "uploads",
  "_next",
  "favicon.ico",
  "settings",
  "dashboard",
]);

export const SlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug cannot exceed 50 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug may only contain lowercase letters, numbers, and hyphens without leading or trailing hyphens"
  )
  .refine((slug) => !RESERVED_SLUGS.has(slug.toLowerCase()), {
    message: "This slug is reserved for platform operations",
  });

export const CheckSlugSchema = z.object({
  slug: SlugSchema,
});

export const OnboardStudioSchema = z.object({
  // Step 1: Identity & Discipline
  name: z.string().min(2, "Studio name must be at least 2 characters").max(100),
  slug: SlugSchema,
  discipline: StudioDisciplineEnum.default("HYBRID"),
  currency: CurrencyEnum.default("USD"),

  // Step 2: Brand Styling
  tagline: z.string().max(200).optional(),
  bio: z.string().max(1000).optional(),
  brandColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/, "Invalid hex color format")
    .default("#f59e0b"),
  logoUrl: z.string().optional(),

  // Step 3: Studio Owner Credentials
  ownerName: z.string().min(2, "Owner name must be at least 2 characters"),
  ownerEmail: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  ownerPhone: z.string().optional(),

  // Step 4: Plan Selection
  subscriptionTier: SubscriptionTierEnum.default("PRO"),
});

export type OnboardStudioInput = z.input<typeof OnboardStudioSchema>;
export type OnboardStudioOutput = z.output<typeof OnboardStudioSchema>;
