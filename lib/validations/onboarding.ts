import { z } from "zod";
import { LOGO_URL_MESSAGE, isOwnLogoPath } from "@/lib/validations/logo-url";

export const StudioDisciplineEnum = z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]);
export const CurrencyEnum = z.enum(["USD", "MYR", "EUR", "GBP"]);
export const SubscriptionTierEnum = z.enum(["STARTER", "PRO", "STUDIO_UNLIMITED"]);

export const RESERVED_SLUGS = new Set([
  "super-admin",
  "create-studio",
  "studios",
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
  // Real addresses on the platform domain, which a studio subdomain would clash with.
  "www", "app", "staging", "mail", "email", "send", "smtp", "imap", "pop", "ftp", "cdn", "static", "assets",
  "status", "help", "support", "docs", "blog", "dev", "test", "ns1", "ns2", "autoconfig", "autodiscover",
  // A studio's own pages: on its subdomain the path no longer carries the slug, so a studio with
  // one of these names would break that page.
  "account", "book", "checkout", "forgot-password", "my-booking", "proposals", "register", "releases",
  "reset-password", "set-hud", "vault", "visualizer",
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
  // The beta's invite code (STUDIO_SIGNUP_CODE), when sign-up needs one: checked before this schema.
  signupCode: z.string().max(100).optional(),
  // Step 1: Identity & Discipline
  name: z.string().min(2, "Studio name must be at least 2 characters").max(100),
  slug: SlugSchema,
  discipline: StudioDisciplineEnum.default("HYBRID"),
  // Ringgit for now: the product is sold in Malaysia first.
  currency: CurrencyEnum.default("MYR"),

  // Step 2: Brand Styling
  tagline: z.string().max(200).optional(),
  bio: z.string().max(1000).optional(),
  brandColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/, "Invalid hex color format")
    .default("#f59e0b"),
  // Only a logo uploaded during sign-up (/uploads/logos/…): never a link to another site.
  logoUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isOwnLogoPath(v, ["logos"]), LOGO_URL_MESSAGE)
    .optional(),

  // Step 3: Studio Owner Credentials
  ownerName: z.string().min(2, "Owner name must be at least 2 characters"),
  ownerEmail: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  ownerPhone: z.string().optional(),

  // Step 4: Plan Selection
  subscriptionTier: SubscriptionTierEnum.default("PRO"),
  // false: the studio sells no framed prints, so none are set up and clients never see Wall Art.
  offersPrints: z.boolean().default(true),
});

export type OnboardStudioInput = z.input<typeof OnboardStudioSchema>;
export type OnboardStudioOutput = z.output<typeof OnboardStudioSchema>;
