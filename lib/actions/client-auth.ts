"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { setSessionCookie, type SessionUser } from "@/lib/auth/token";

/**
 * Quick client account creation: Name, Email, Phone, Password.
 *
 * If a guest booking already created a passwordless account for this email at
 * this studio, the person must prove they own it by supplying a tracking code
 * from one of that account's bookings before a password can be set. This stops
 * anyone from claiming someone else's email and seeing their bookings.
 */

const RegisterSchema = z.object({
  tenantSlug: z.string().min(1),
  name: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z.string().trim().min(6, "Please enter a valid mobile number.").max(30),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password cannot exceed 72 characters."),
  claimCode: z.string().trim().max(40).optional(),
});

export type RegisterClientInput = z.input<typeof RegisterSchema>;

export type RegisterClientResult =
  | { success: true; user: SessionUser }
  | {
      success: false;
      error:
        | "INVALID_INPUT"
        | "TENANT_NOT_FOUND"
        | "EMAIL_EXISTS"
        | "CLAIM_REQUIRED"
        | "CLAIM_INVALID"
        | "RATE_LIMITED"
        | "INTERNAL_ERROR";
      message: string;
    };

export async function registerClient(input: RegisterClientInput): Promise<RegisterClientResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Please check your details.",
    };
  }

  const { tenantSlug, name, phone, password, claimCode } = parsed.data;
  const rawEmail = parsed.data.email;
  const email = rawEmail.toLowerCase();

  if (isRateLimited(`register:${tenantSlug}:${email}`, 8)) {
    return {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true, subscriptionStatus: true },
    });
    if (!tenant || tenant.subscriptionStatus === "CANCELLED") {
      return { success: false, error: "TENANT_NOT_FOUND", message: "Studio not found." };
    }

    const reserved = await db.user.findFirst({
      where: { role: "SUPER_ADMIN", email: { in: Array.from(new Set([email, rawEmail])) } },
      select: { id: true },
    });
    if (reserved) {
      return {
        success: false,
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      };
    }

    const existing = await db.user.findFirst({
      where: { tenantId: tenant.id, email: { in: Array.from(new Set([email, rawEmail])) } },
    });

    const passwordHash = await bcrypt.hash(password, 10);
    let user;

    if (!existing) {
      user = await db.user.create({
        data: { tenantId: tenant.id, name, email, phone, role: "CLIENT", passwordHash },
      });
    } else if (existing.role !== "CLIENT" || existing.passwordHash) {
      return {
        success: false,
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      };
    } else {
      // Passwordless account created by an earlier guest booking: require proof of ownership.
      if (!claimCode) {
        return {
          success: false,
          error: "CLAIM_REQUIRED",
          message:
            "This email already has a booking with us. Enter the tracking code from that booking to claim it and set your password.",
        };
      }
      const owned = await db.clientBooking.findFirst({
        where: {
          tenantId: tenant.id,
          userId: existing.id,
          trackingCode: claimCode.toUpperCase(),
        },
        select: { id: true },
      });
      if (!owned) {
        return {
          success: false,
          error: "CLAIM_INVALID",
          message: "That tracking code doesn't match a booking for this email.",
        };
      }
      user = await db.user.update({
        where: { id: existing.id },
        data: { name, phone, passwordHash, isQuickCreated: false },
      });
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
    };
    await setSessionCookie(sessionUser);

    return { success: true, user: sessionUser };
  } catch (err) {
    console.error("registerClient error:", err);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "We couldn't create your account. Please try again shortly.",
    };
  }
}
