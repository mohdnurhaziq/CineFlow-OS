"use server";

import { z } from "zod";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { proveEmailAndJoin } from "@/lib/auth/login";
import { isRateLimited } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import {
  PASSWORD_RESET_TTL_MINUTES,
  findStudioAccount,
  issuePasswordReset,
  passwordResetPath,
  resetTokenMatches,
} from "@/lib/auth/password-reset";
import { studioUrl } from "@/lib/domain-name";

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
  // A removed team member gets no link, and the same reply as an unknown email.
  if (!account || account.deactivatedAt) return SENT;

  await afterResponse(async () => {
    try {
      const token = await issuePasswordReset(account.id);
      const res = await sendNotification(
        {
          event: "PASSWORD_RESET",
          studioName: tenant.name,
          studioSlug: tenant.slug,
          clientName: account.name,
          clientEmail: account.email,
          resetUrl: studioUrl(tenant.slug, passwordResetPath(account.email, token)),
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
  if (!account || account.deactivatedAt || !resetTokenMatches(account, token)) return INVALID_LINK;

  // Single use: only succeeds while the stored token is still the one that was checked. The link
  // proves the email, so the password typed here becomes the person's one login password. The
  // account never keeps a password of its own (an unproven account's password must never carry over).
  const { count } = await db.user.updateMany({
    where: { id: account.id, passwordResetToken: account.passwordResetToken, deactivatedAt: null },
    data: {
      passwordResetToken: null,
      passwordResetExpires: null,
      inviteToken: null,
      inviteTokenExpires: null,
      isQuickCreated: false,
    },
  });
  if (count === 0) return INVALID_LINK;
  await proveEmailAndJoin(account, password);
  return { success: true };
}

/**
 * For the signed-in person on a stand-alone account: emails them a link to "use one sign-in for all
 * your studios". The page it opens asks for one password for every studio, and proves the email.
 */
export async function sendOneLoginLink(): Promise<{ success: true } | { success: false; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.loginId || user.role === "SUPER_ADMIN" || !user.tenantSlug) {
    return { success: false, message: "There is nothing to confirm for this account." };
  }
  if (isRateLimited(`one-login-link:${user.id}`, 3, 60 * 60_000)) {
    return { success: false, message: "We already sent you a link. Check your inbox, or try again in an hour." };
  }
  const tenant = await db.tenant.findUnique({ where: { slug: user.tenantSlug }, select: { name: true, slug: true } });
  if (!tenant) return { success: false, message: "There is nothing to confirm for this account." };
  const token = await issuePasswordReset(user.id);
  const res = await sendNotification(
    {
      event: "ONE_LOGIN_CONFIRM",
      studioName: tenant.name,
      studioSlug: tenant.slug,
      clientName: user.name,
      clientEmail: user.email,
      confirmUrl: `${studioUrl(tenant.slug, passwordResetPath(user.email, token))}&join=1`,
      expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
    },
    "EMAIL"
  );
  if (res.emailDelivery !== "SENT") console.error(`One-sign-in email for ${tenant.slug} not sent (${res.emailDelivery}): ${res.emailError ?? "no email provider configured"}`);
  return { success: true };
}
