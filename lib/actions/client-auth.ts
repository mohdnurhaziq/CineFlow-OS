"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { setLoginSessionCookie, setSessionCookie, type SessionUser } from "@/lib/auth/token";
import { clientInvitePath, inviteMatches, issueClientInvite } from "@/lib/auth/invite";
import { hasSetUp } from "@/lib/auth/set-up";
import { findLogin, proveEmailAndJoin } from "@/lib/auth/login";
import { emailOneLoginLink } from "@/lib/auth/one-login-link";
import { sendNotification } from "@/lib/notifications";
import { isStudioPath, studioPath, studioUrl } from "@/lib/domain-name";

/**
 * Quick client account creation: Name, Email, Phone, Password.
 *
 * If this studio already has a passwordless account for the email (a guest booking, or a client
 * the studio added), only the invite link emailed to that address can set its password. Anything
 * else (such as a booking's tracking code, which whoever made the booking was shown) is no proof:
 * the address is sent a fresh link instead, so only its owner can get in.
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
  inviteToken: z.string().trim().max(100).optional(),
  /** The page they were on (their checkout): where the set-password email brings them back. */
  next: z.string().trim().max(500).optional(),
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
        | "CHECK_EMAIL"
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

  const { tenantSlug, name, phone, password, inviteToken, next } = parsed.data;
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
      select: { id: true, slug: true, name: true, subscriptionStatus: true },
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
    let standAlone = false;

    if (!existing) {
      // An email that already has a CineFlow sign-in joins it: the login's password is the proof.
      const theirs = await findLogin(email);
      if (theirs) {
        if (!theirs.passwordHash || !bcrypt.compareSync(password, theirs.passwordHash)) {
          return {
            success: false,
            error: "EMAIL_EXISTS",
            message: "This email already has a CineFlow sign-in. Use its password, or reset it.",
          };
        }
        user = await db.user.create({ data: { tenantId: tenant.id, name, email, phone, role: "CLIENT", loginId: theirs.id } });
      } else {
        user = await db.user.create({
          data: { tenantId: tenant.id, name, email, phone, role: "CLIENT", passwordHash },
        });
        standAlone = true;
      }
    } else if (existing.role !== "CLIENT" || hasSetUp(existing)) {
      return {
        success: false,
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      };
    } else if (inviteMatches(existing, inviteToken)) {
      // Passwordless account the studio created and invited by email: the invite is the proof of the
      // email, so the password typed here becomes the person's one login password.
      await proveEmailAndJoin(existing, password);
      user = await db.user.update({
        where: { id: existing.id },
        data: { name, phone, isQuickCreated: false, inviteToken: null, inviteTokenExpires: null },
      });
    } else {
      // Passwordless account and no valid invite: email its owner a fresh link to set the password.
      // Three an hour. Past that, say so rather than claim another email went out.
      if (isRateLimited(`invite-email:${tenant.id}:${email}`, 3, 60 * 60 * 1000)) {
        return {
          success: false,
          error: "CHECK_EMAIL",
          message:
            "This email already has an account with us, and we've already emailed you a link to set your password. Check your inbox (and spam folder). You can ask for a new link in an hour.",
        };
      }
      {
        const token = await issueClientInvite(existing.id);
        // Back to the page they were on (their checkout) if it's one of this studio's own; else their account.
        const back = next && isStudioPath(tenant.slug, next) ? next : studioPath(tenant.slug, "/account");
        const link = clientInvitePath(existing.email, token, back);
        sendNotification({
          event: "STUDIO_UPDATE",
          studioName: tenant.name,
          studioSlug: tenant.slug,
          clientName: existing.name,
          clientEmail: existing.email,
          headline: "Set your password",
          message: `Someone asked to set a password for your ${tenant.name} account. If it was you, use the link below. If not, you can ignore this email.`,
          linkUrl: studioUrl(tenant.slug, link),
          linkLabel: "Set your password",
        }).catch((e) => console.error("Set-password email failed:", e));
      }
      return {
        success: false,
        error: "CHECK_EMAIL",
        message: "This email already has an account with us. We've emailed you a link to set your password.",
      };
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: tenant.slug,
      ...(user.loginId ? { loginId: user.loginId } : {}),
    };
    if (user.loginId) await setLoginSessionCookie(user.loginId, user.id);
    else await setSessionCookie(sessionUser);
    // A brand-new account works straight away; this invites them to use one sign-in for every studio.
    if (standAlone) await emailOneLoginLink({ id: user.id, email: user.email, name: user.name }, { name: tenant.name, slug: tenant.slug });

    return { success: true, user: sessionUser };
  } catch (err) {
    // Lost a race with a concurrent registration of the same (studio, email).
    if ((err as { code?: string })?.code === "P2002") {
      return {
        success: false,
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      };
    }
    console.error("registerClient error:", err);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "We couldn't create your account. Please try again shortly.",
    };
  }
}
