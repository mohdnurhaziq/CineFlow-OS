"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Login } from "@prisma/client";
import { verifyLoginPassword } from "@/lib/auth/login";
import { sendStudioWelcome } from "@/lib/onboarding/welcome";
import { googleConfigured } from "@/lib/auth/google";
import { SIGNUP_TICKET, SIGNUP_TICKET_COOKIE, isSuperAdminEmail, loginForGoogle, type SignupTicket } from "@/lib/auth/google-flow";
import { cookies } from "next/headers";
import { openBlob } from "@/lib/auth/signed-blob";
import { setLoginSessionCookie, setSessionCookie } from "@/lib/auth/token";
import {
  OnboardStudioSchema,
  CheckSlugSchema,
  RESERVED_SLUGS,
  type OnboardStudioInput,
} from "@/lib/validations/onboarding";
import { errorMessageOf } from "@/lib/action-error";
import { createHash, timingSafeEqual } from "node:crypto";
import { appEnvFrom } from "@/lib/app-env";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited, attemptCount, countAttempt } from "@/lib/rate-limit";
import { studioUrl } from "@/lib/domain-name";
import { TRIAL_DAYS } from "@/lib/billing/state";

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

/**
 * Who may create a studio. With STUDIO_SIGNUP_CODE set, anyone who has the code (the beta's invite
 * code). Without it: nobody in production (sign-up closed), anyone in dev and staging.
 */
export async function studioSignupStatus(): Promise<{ open: boolean; needsCode: boolean }> {
  if (process.env.STUDIO_SIGNUP_CODE?.trim()) return { open: true, needsCode: true };
  return { open: appEnvFrom() !== "production", needsCode: false };
}

/** Whether `given` is the invite code (compared in constant time). */
function signupCodeMatches(given: string | undefined): boolean {
  const expected = createHash("sha256").update(process.env.STUDIO_SIGNUP_CODE?.trim() ?? "").digest();
  const actual = createHash("sha256").update((given ?? "").trim()).digest();
  return timingSafeEqual(expected, actual);
}

/**
 * Checks the invite code on the form's first step, so a wrong one is caught before the rest is filled
 * in. Limited per visitor (10 an hour) so the code can't be guessed; onboardStudio checks it again.
 */
export async function checkSignupCode(code: string): Promise<{ valid: boolean; message?: string }> {
  const status = await studioSignupStatus();
  if (!status.needsCode) return { valid: true };
  const ip = await requestIp();
  if (ip && isRateLimited(`studio-signup-code:${ip}`, 10, 60 * 60 * 1000)) {
    return { valid: false, message: "Too many tries from here. Please try again later." };
  }
  return signupCodeMatches(code)
    ? { valid: true }
    : { valid: false, message: "That invite code isn't right. Check it and try again." };
}

/** What sign-up answers. `field` names the answer to fix, so the wizard can show the problem beside it. */
export interface OnboardStudioResult {
  success: boolean;
  /** Set when the studio was made. */
  tenantId?: string;
  slug?: string;
  redirectUrl?: string;
  /** Set when it wasn't: why, and which answer to fix. */
  error?: string;
  field?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

const SIGNUP_HOUR = 60 * 60 * 1000;
const TOO_MANY_SIGNUPS = "Too many tries from here. Please try again later.";

export async function onboardStudio(formData: OnboardStudioInput): Promise<OnboardStudioResult> {
  const status = await studioSignupStatus();
  if (!status.open) {
    return { success: false, error: "Studio sign-up is closed during the beta. Ask us for an invite." };
  }
  // Honest people make mistakes (a taken address, a typo), so what is tightly limited is what can be
  // abused: new studios and wrong invite codes (5 an hour each from one visitor; the first step's
  // own check has its separate limit). All attempts together have a generous ceiling.
  const ip = await requestIp();
  if (ip && (isRateLimited(`studio-signup:${ip}`, 30, SIGNUP_HOUR) || attemptCount(`studio-created:${ip}`) >= 5)) {
    return { success: false, error: TOO_MANY_SIGNUPS };
  }
  if (status.needsCode) {
    if (ip && attemptCount(`studio-signup-wrong-code:${ip}`) >= 5) return { success: false, error: TOO_MANY_SIGNUPS };
    if (!signupCodeMatches(formData.signupCode)) {
      if (ip) countAttempt(`studio-signup-wrong-code:${ip}`, SIGNUP_HOUR);
      return { success: false, error: "That invite code isn't right. Check it and try again.", field: "signupCode" };
    }
  }

  const validated = OnboardStudioSchema.safeParse(formData);
  if (!validated.success) {
    const firstErrorMessage = validated.error.errors[0]?.message || "Validation failed";
    const firstField = validated.error.errors[0]?.path[0];
    return {
      success: false,
      error: firstErrorMessage,
      field: typeof firstField === "string" ? firstField : undefined,
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const data = validated.data;

  // Server-side Defense-in-Depth against Reserved Slugs
  if (RESERVED_SLUGS.has(data.slug.toLowerCase())) {
    return {
      success: false,
      error: "Studio URL slug is reserved for platform operations.",
      field: "slug",
    };
  }

  // Signed in with Google: the ticket (from this browser's own cookie) proves the email, and it is the ticket's, whatever was typed.
  let ticket: SignupTicket | null = null;
  if (data.googleSignup) {
    ticket = await ticketFromCookie();
    if (!ticket) {
      return { success: false, error: "Your Google sign-in expired. Please continue with Google again.", field: "ownerEmail" };
    }
  } else if (!data.password) {
    return { success: false, error: "Password must be at least 8 characters", field: "password" };
  }
  const ownerEmail = ticket ? ticket.email : data.ownerEmail;

  let login: Login | null = null;
  if (ticket) {
    if (await isSuperAdminEmail(ticket.email)) return { success: false, error: "An account with this email already exists.", field: "ownerEmail" };
    const found = await loginForGoogle({ sub: ticket.sub, email: ticket.email, emailVerified: true, name: ticket.name });
    if ("error" in found) {
      return {
        success: false,
        field: "ownerEmail",
        error: found.error === "linked_other" ? "This email is already linked to a different Google account." : "Google sign-in didn't work. Please try again.",
      };
    }
    login = found.login;
  } else {
    // An email that already has a CineFlow sign-in starts a studio with that sign-in: its password is the
    // proof, so the new owner account joins it. Otherwise it is a stand-alone account, as ever.
    const check = await verifyLoginPassword(data.ownerEmail, data.password ?? "");
    if (!check.ok && check.reason === "RATE_LIMITED") {
      return { success: false, error: "Too many attempts. Please wait a few minutes and try again.", field: "password" };
    }
    if (!check.ok && check.reason === "WRONG") {
      return { success: false, error: "This email already has a CineFlow sign-in. Use its password.", field: "password" };
    }
    login = check.ok ? check.login : null;
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

      // The same person may own a studio and work elsewhere (one login), but a platform super-admin's
      // email is never a studio owner's.
      const existingUser = await tx.user.findFirst({
        where: { role: "SUPER_ADMIN", email: { in: Array.from(new Set([ownerEmail, ownerEmail.toLowerCase()])) } },
      });
      if (existingUser) {
        throw new Error("EMAIL_ALREADY_TAKEN");
      }

      // 2. Hash Password
      const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;

      // 3. Create Tenant Record
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          discipline: data.discipline,
          currency: data.currency,
          tagline: data.tagline?.trim() || null,
          // Left blank, the public page shows no bio: never made-up words under the studio's name.
          bio: data.bio?.trim() || null,
          brandColor: data.brandColor || "#f59e0b",
          logoUrl: data.logoUrl || null,
          offersPrints: data.offersPrints,
          subscriptionTier: data.subscriptionTier,
          subscriptionStatus: "ACTIVE",
          // A free trial with everything open; the chosen plan applies after it.
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        },
      });

      // 4. Create Studio Owner User
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.ownerName,
          email: ownerEmail,
          phone: data.ownerPhone || null,
          role: "STUDIO_OWNER",
          // Joined to the person's login: it holds the password, the account keeps none of its own.
          ...(login ? { loginId: login.id } : { passwordHash }),
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
      // A studio that sells no framed prints starts with none to switch off.
      if (data.offersPrints) {
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
      }

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

      // 8. A sample package to edit. Switched off, so clients never see a price the owner didn't set.
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
          isActive: false,
        },
      });

      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        ownerId: owner.id,
        ownerEmail: owner.email,
        ownerName: owner.name,
        studioName: tenant.name,
        trialEndsAt: tenant.trialEndsAt!,
      };
    });

    // Automatically authenticate the new studio owner
    if (login) {
      await setLoginSessionCookie(login.id, result.ownerId);
      // A Google ticket is good for one studio.
      if (ticket) (await cookies()).delete(SIGNUP_TICKET_COOKIE);
    } else {
      await setSessionCookie({
        id: result.ownerId,
        email: result.ownerEmail,
        name: result.ownerName,
        role: "STUDIO_OWNER",
        tenantId: result.tenantId,
        tenantSlug: result.slug,
      });
    }

    if (ip) countAttempt(`studio-created:${ip}`, SIGNUP_HOUR);

    // Never fails the sign-up. A stand-alone account's email isn't proven yet, so it gets the link.
    await sendStudioWelcome(
      { id: result.ownerId, email: result.ownerEmail, name: result.ownerName },
      { name: result.studioName, slug: result.slug, trialEndsAt: result.trialEndsAt },
      { confirmEmail: !login }
    );

    return {
      success: true,
      tenantId: result.tenantId,
      slug: result.slug,
      redirectUrl: studioUrl(result.slug, "/admin"),
    };
  } catch (error) {
    console.error("Onboarding transaction error:", error);
    if (errorMessageOf(error) === "RESERVED_SLUG") {
      return { success: false, error: "Studio URL slug is reserved for platform operations.", field: "slug" };
    }
    if (errorMessageOf(error) === "SLUG_ALREADY_TAKEN") {
      return { success: false, error: "Studio URL slug is already taken. Please choose another.", field: "slug" };
    }
    if (errorMessageOf(error) === "EMAIL_ALREADY_TAKEN") {
      return { success: false, error: "An account with this email already exists.", field: "ownerEmail" };
    }
    return { success: false, error: "Failed to create studio workspace. Please try again." };
  }
}

/** Whether "Continue with Google" is set up, for the sign-up wizard (a client page) to show the button. */
export async function googleAvailable(): Promise<boolean> {
  return googleConfigured();
}

/** This browser's sign-up ticket from Google: only a good, current one, from its own cookie. */
async function ticketFromCookie(): Promise<SignupTicket | null> {
  const raw = (await cookies()).get(SIGNUP_TICKET_COOKIE)?.value;
  const t = raw ? openBlob<SignupTicket>(raw) : null;
  return t && t.kind === SIGNUP_TICKET ? t : null;
}

/**
 * What the sign-up wizard is handed after Google: the email Google confirmed and the person's name, from
 * the ticket in this browser's own cookie. Null when there is no good, current ticket.
 */
export async function readGoogleTicket(): Promise<{ email: string; name: string | null } | null> {
  const t = await ticketFromCookie();
  return t ? { email: t.email, name: t.name } : null;
}

