"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import {
  OnboardStudioSchema,
  CheckSlugSchema,
  RESERVED_SLUGS,
  type OnboardStudioInput,
} from "@/lib/validations/onboarding";

export async function checkSlugAvailability(rawSlug: string): Promise<{ available: boolean; error?: string }> {
  const parsed = CheckSlugSchema.safeParse({ slug: rawSlug });
  if (!parsed.success) {
    return { available: false, error: parsed.error.errors[0]?.message };
  }

  // Defense-in-depth: check against reserved platform slugs
  if (RESERVED_SLUGS.has(parsed.data.slug.toLowerCase())) {
    return { available: false, error: "This slug is reserved for platform operations" };
  }

  const existing = await db.tenant.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });

  return { available: !existing };
}

export async function onboardStudio(formData: OnboardStudioInput) {
  const validated = OnboardStudioSchema.safeParse(formData);
  if (!validated.success) {
    const firstErrorMessage = validated.error.errors[0]?.message || "Validation failed";
    return {
      success: false,
      error: firstErrorMessage,
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const data = validated.data;

  // Server-side Defense-in-Depth against Reserved Slugs
  if (RESERVED_SLUGS.has(data.slug.toLowerCase())) {
    return {
      success: false,
      error: "Studio URL slug is reserved for platform operations.",
    };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 0. Explicit Transaction Guard: Reject reserved platform slugs
      if (RESERVED_SLUGS.has(data.slug.toLowerCase())) {
        throw new Error("RESERVED_SLUG");
      }

      // 1. Uniqueness Checks
      const existingTenant = await tx.tenant.findUnique({ where: { slug: data.slug } });
      if (existingTenant) {
        throw new Error("SLUG_ALREADY_TAKEN");
      }

      const existingUser = await tx.user.findUnique({ where: { email: data.ownerEmail } });
      if (existingUser) {
        throw new Error("EMAIL_ALREADY_TAKEN");
      }

      // 2. Hash Password
      const passwordHash = await bcrypt.hash(data.password, 10);

      // 3. Create Tenant Record
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          discipline: data.discipline,
          currency: data.currency,
          tagline: data.tagline || `${data.name} — Creative Production Studio`,
          bio: data.bio || "Crafting cinematic visuals, authentic emotion, and timeless milestone imagery.",
          brandColor: data.brandColor || "#f59e0b",
          logoUrl: data.logoUrl || null,
          subscriptionTier: data.subscriptionTier,
          subscriptionStatus: "ACTIVE",
        },
      });

      // 4. Create Studio Owner User
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.ownerName,
          email: data.ownerEmail,
          phone: data.ownerPhone || null,
          role: "STUDIO_OWNER",
          passwordHash,
        },
      });

      // 5. Seed Standard Campaign Categories
      await tx.campaignCategory.createMany({
        data: [
          {
            tenantId: tenant.id,
            name: "Convocation",
            slug: "convocation",
            badgeIcon: "🎓",
            description: "Academic & graduation milestone portraits",
            sortOrder: 1,
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "Hari Raya Festive Special",
            slug: "hari-raya",
            badgeIcon: "🌙",
            description: "Eid celebration & family heirloom portraiture",
            sortOrder: 2,
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "Weddings & Ceremonies",
            slug: "wedding",
            badgeIcon: "💍",
            description: "Cinematic wedding films & emotional bridal captures",
            sortOrder: 3,
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "Commercial & Brand",
            slug: "commercial",
            badgeIcon: "🎬",
            description: "Commercial advertising, fashion editorials & corporate productions",
            sortOrder: 4,
            isActive: true,
          },
        ],
      });

      // 6. Seed Default Print Sizes & Frame Designs (for Wall Visualizer)
      await tx.printSize.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: "8R",
            name: "8R (8 x 10 in)",
            widthInches: 8.0,
            heightInches: 10.0,
            basePrice: data.currency === "MYR" ? 180.0 : 45.0,
          },
          {
            tenantId: tenant.id,
            code: "12R",
            name: "12R (12 x 15 in)",
            widthInches: 12.0,
            heightInches: 15.0,
            basePrice: data.currency === "MYR" ? 350.0 : 85.0,
          },
          {
            tenantId: tenant.id,
            code: "16R",
            name: "16R (16 x 20 in)",
            widthInches: 16.0,
            heightInches: 20.0,
            basePrice: data.currency === "MYR" ? 580.0 : 140.0,
          },
        ],
      });

      await tx.frameDesign.createMany({
        data: [
          {
            tenantId: tenant.id,
            name: "Matte Black Minimalist",
            material: "Aluminum",
            moldingWidth: 1.25,
            frameColor: "#18181b",
            previewAsset: "/uploads/frames/matte_black.jpg",
            priceOffset: 0.0,
            isAvailable: true,
          },
          {
            tenantId: tenant.id,
            name: "Warm Walnut Shadowbox",
            material: "Solid Wood",
            moldingWidth: 1.75,
            frameColor: "#5c3a21",
            previewAsset: "/uploads/frames/walnut.jpg",
            priceOffset: data.currency === "MYR" ? 150.0 : 35.0,
            isAvailable: true,
          },
          {
            tenantId: tenant.id,
            name: "Champagne Gold Gallery",
            material: "Anodized Metal",
            moldingWidth: 1.5,
            frameColor: "#d4af37",
            previewAsset: "/uploads/frames/gold.jpg",
            priceOffset: data.currency === "MYR" ? 220.0 : 50.0,
            isAvailable: true,
          },
        ],
      });

      // 7. Seed Default Proposal Add-On Templates
      await tx.proposalAddOnTemplate.createMany({
        data: [
          {
            tenantId: tenant.id,
            name: "Drone 4K Aerial Coverage",
            description: "Licensed aerial cinematography with full safety clearance",
            price: data.currency === "MYR" ? 1200.0 : 350.0,
            unit: "fixed",
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "RAW Footage / Stills SSD Drive",
            description: "Delivered 2TB NVMe SSD containing all uncompressed camera rushes",
            price: data.currency === "MYR" ? 950.0 : 250.0,
            unit: "fixed",
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "Second Cinematographer / Shooter",
            description: "Additional multi-angle coverage for live ceremonies",
            price: data.currency === "MYR" ? 1800.0 : 500.0,
            unit: "per_day",
            isActive: true,
          },
          {
            tenantId: tenant.id,
            name: "Extra Production Studio Hour",
            description: "Overtime hour for studio lights, cast & crew",
            price: data.currency === "MYR" ? 500.0 : 150.0,
            unit: "per_hour",
            isActive: true,
          },
        ],
      });

      // 8. Seed Default Starter Service Package
      await tx.servicePackage.create({
        data: {
          tenantId: tenant.id,
          name: data.discipline === "VIDEOGRAPHY" ? "Cinematic Brand Story" : "Signature Milestone Session",
          category: "commercial",
          discipline: data.discipline,
          price: data.currency === "MYR" ? 2400.0 : 850.0,
          depositPrice: data.currency === "MYR" ? 1200.0 : 425.0,
          description: "High-impact creative production session with full color grading and private gallery vault delivery.",
          deliverables: "High-resolution edited masters, private deliverables vault, 50% milestone paywall protection.",
          turnaround: "7 business days",
          isFeatured: true,
        },
      });

      return { tenantId: tenant.id, slug: tenant.slug, ownerId: owner.id };
    });

    return {
      success: true,
      tenantId: result.tenantId,
      slug: result.slug,
      redirectUrl: `/${result.slug}`,
    };
  } catch (error: any) {
    console.error("Onboarding transaction error:", error);
    if (error.message === "RESERVED_SLUG") {
      return { success: false, error: "Studio URL slug is reserved for platform operations." };
    }
    if (error.message === "SLUG_ALREADY_TAKEN") {
      return { success: false, error: "Studio URL slug is already taken. Please choose another." };
    }
    if (error.message === "EMAIL_ALREADY_TAKEN") {
      return { success: false, error: "An account with this email already exists." };
    }
    return { success: false, error: "Failed to create studio workspace. Please try again." };
  }
}
