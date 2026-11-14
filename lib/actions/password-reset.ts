"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { after } from "next/server";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import {
  PASSWORD_RESET_TTL_MINUTES,
  findStudioAccount,
  issuePasswordReset,
  passwordResetPath,
  resetTokenMatches,
} from "@/lib/auth/password-reset";

/**
 * "Forgot password" for a studio's accounts (clients and staff alike; accounts are per studio).
 * Public actions: no session needed, so both are rate-limited and never reveal whether an
 * email has an account.
 */

const RequestSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(100),
  email: z.string().trim().email("Please enter a valid email address.").max(254),
});

/** The same reply whether or not the email has an account, so the form can't be used to probe. */
const SENT = {
  success: true as const,
  message: "If an account exists for that email, we've sent a link to reset the password. It expires in 1 hour.",
};

/** Runs `task` after the response is sent (so timing doesn't reveal anything), or now outside a request. */
function afterResponse(task: () => Promise<unknown>): Promise<void> {
  try {
    after(task);
    return Promise.resolve();
  } catch {
    // No request scope (scripts, tests): just run it.
    return task().then(() => undefined);
  }
}

export async function requestPasswordReset(
  input: z.input<typeof RequestSchema>
): Promise<{ success: true; message: string } | { success: false; error: string; message: string }> {
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT", message: parsed.error.errors[0]?.message ?? "Please check the form." };
  }
  const email = parsed.data.email.toLowerCase();
  const { tenantSlug } = parsed.data;

  // Per address, and per studio overall (so one person can't flood a studio's inboxes).
  if (isRateLimited(`reset-request:${tenantSlug}:${email}`, 3, 15 * 60_000) || isRateLimited(`reset-request:${tenantSlug}`, 50, 15 * 60_000)) {
    return { success: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a few minutes and try again." };
  }

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, slug: true } });
  if (!tenant) return SENT;
  const account = await findStudioAccount(tenant.id, email);
  if (!account) return SENT;

  await afterResponse(async () => {
    try {
      const token = await issuePasswordReset(account.id);
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
      const res = await sendNotification(
        {
          event: "PASSWORD_RESET",
          studioName: tenant.name,
          studioSlug: tenant.slug,
          clientName: account.name,
          clientEmail: account.email,
          resetUrl: `${appUrl}${passwordResetPath(tenant.slug, account.email, token)}`,
          expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
        },
        "EMAIL"
      );
      if (res.emailDelivery !== "SENT") {
        console.error(`Password reset email for ${tenant.slug} not sent (${res.emailDelivery}): ${res.emailError ?? "no email provider configured"}`);
      }
    } catch (err) {
      console.error("Password reset request failed:", err);
    }
  });
  return SENT;
}

const ResetSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  token: z.string().trim().min(10).max(200),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password cannot exceed 72 characters."),
});

const INVALID_LINK = {
  success: false as const,
  error: "INVALID_LINK",
  message: "This reset link is invalid or has expired. Please request a new one.",
};

/**
 * Sets a new password from a reset link. The link then stops working, any open invite is
 * cancelled, and every existing session for the account is signed out.
 */
export async function resetPassword(
  input: z.input<typeof ResetSchema>
): Promise<{ success: true } | { success: false; error: string; message: string }> {
  const parsed = ResetSchema.safeParse(input);
  if (!parsed.success) {
    const passwordIssue = parsed.error.errors.find((e) => e.path[0] === "password");
    return passwordIssue ? { success: false, error: "WEAK_PASSWORD", message: passwordIssue.message } : INVALID_LINK;
  }
  const { tenantSlug, email, token, password } = parsed.data;

  if (isRateLimited(`reset-password:${tenantSlug}:${email.toLowerCase()}`, 10, 15 * 60_000)) {
    return { success: false, error: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return INVALID_LINK;
  const account = await findStudioAccount(tenant.id, email);
  if (!account || !resetTokenMatches(account, token)) return INVALID_LINK;

  const passwordHash = await bcrypt.hash(password, 10);
  // Single use: only succeeds while the stored token is still the one that was checked.
  const { count } = await db.user.updateMany({
    where: { id: account.id, passwordResetToken: account.passwordResetToken },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      inviteToken: null,
      inviteTokenExpires: null,
      isQuickCreated: false,
      sessionsValidAfter: new Date(),
    },
  });
  if (count === 0) return INVALID_LINK;
  return { success: true };
}
