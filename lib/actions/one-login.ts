"use server";

import { db } from "@/lib/db";
import { getCurrentLogin, getCurrentUser, logoutAction } from "@/lib/auth/session";
import bcrypt from "bcryptjs";
import { findLogin, linkAccountToLogin, normalizeEmail } from "@/lib/auth/login";
import { signInBlocked, signInFailed } from "@/lib/auth/sign-in-limits";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { hasSetUp } from "@/lib/auth/set-up";
import { signInTarget } from "@/lib/auth/sign-in-target";
import { liveAccounts, setLoginSessionCookie } from "@/lib/auth/token";
import { handoffForRequest } from "@/lib/auth/handoff";

/**
 * "Continue as a client of this studio" for a signed-in login with no account there: takes up the
 * client account the studio already made for the email, or creates a linked one (clients can
 * register themselves anyway). Never gives staff access: that only ever comes from an invite.
 */
export async function continueAsClient(
  tenantSlug: string
): Promise<{ success: true; redirectTo: string; name: string; handoffCode?: string } | { success: false; message: string }> {
  const me = await getCurrentLogin();
  if (!me) return { success: false, message: "Please sign in first." };

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, subscriptionStatus: true } });
  if (!tenant || tenant.subscriptionStatus === "CANCELLED") return { success: false, message: "Studio not found." };

  // Legacy rows can be mixed case, so match on lower(email).
  const found = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE "tenantId" = ${tenant.id} AND lower(email) = ${me.email}`;
  const existing = found[0] ? await db.user.findUnique({ where: { id: found[0].id } }) : null;

  let userId: string;
  let name: string;
  if (existing) {
    if (existing.role !== "CLIENT" || existing.deactivatedAt) return { success: false, message: "Ask the studio to invite you." };
    if (existing.loginId !== me.loginId) {
      // An account with its own password was never proven to be this person's.
      if (hasSetUp(existing)) return { success: false, message: "This studio already has an account for this email. Ask the studio to help you sign in." };
      await linkAccountToLogin(existing.id, me.loginId);
    }
    userId = existing.id;
    name = existing.name;
  } else {
    const prior = await db.user.findFirst({ where: { loginId: me.loginId }, orderBy: { createdAt: "desc" }, select: { name: true, phone: true } });
    const created = await db.user.create({
      data: { tenantId: tenant.id, name: prior?.name ?? me.email, email: me.email, phone: prior?.phone ?? null, role: "CLIENT", loginId: me.loginId },
    });
    userId = created.id;
    name = created.name;
  }

  await setLoginSessionCookie(me.loginId, userId);
  const handoffCode = await handoffForRequest(me.loginId, userId);
  return { success: true, redirectTo: signInTarget({ role: "CLIENT", tenantSlug: tenant.slug }), name, ...(handoffCode ? { handoffCode } : {}) };
}

/**
 * Ends every session of the signed-in person, on every device and host, and this browser's too: a
 * login's sessions through `Login.sessionsValidAfter`, a stand-alone account's through its own.
 * For when a phone is lost or someone else may have been in the account. Not for a super-admin.
 */
export async function signOutEverywhere(): Promise<{ success: true } | { success: false; message: string }> {
  const me = await getCurrentLogin();
  if (me) {
    await db.login.update({ where: { id: me.loginId }, data: { sessionsValidAfter: new Date() } });
  } else {
    const user = await getCurrentUser();
    if (!user || user.role === "SUPER_ADMIN") return { success: false, message: "You're not signed in." };
    await db.user.update({ where: { id: user.id }, data: { sessionsValidAfter: new Date() } });
  }
  await logoutAction();
  return { success: true };
}

/** A bcrypt hash of a password nobody knows: compared against when there is no login, so a miss takes as long as a hit. */
const NO_LOGIN_HASH = "$2a$10$2zea66jS4W4aKqs7HzuES.cJiwy9TE21nNag2WO9T4cKeQU9rUuCW";

/**
 * Sign-in on the platform's own page (/login): the person's one login, then "Your studios". Every
 * failure is the same answer (an unknown email, a wrong password, an email with only a stand-alone
 * account, a super-admin's email), and every email is rate-limited alike, with the same limit as a
 * studio's sign-in, so nothing here tells anyone whether an email has a login.
 */
export async function loginToPlatform(
  email: string,
  password: string
): Promise<{ success: true; redirectTo: "/studios" } | { success: false; error: "INVALID_CREDENTIALS" | "RATE_LIMITED" }> {
  const normalized = normalizeEmail(email);
  const ip = await requestIp();
  if (signInBlocked("login", normalized, ip) || (ip && isRateLimited(`login-ip:${ip}`, 30))) return { success: false, error: "RATE_LIMITED" };

  const login = await findLogin(normalized);
  const matches = bcrypt.compareSync(password, login?.passwordHash ?? NO_LOGIN_HASH) && !!login?.passwordHash;
  const first = login && matches ? (await liveAccounts(login.id))[0] : undefined;
  if (!login || !first) {
    signInFailed("login", normalized, ip);
    return { success: false, error: "INVALID_CREDENTIALS" };
  }
  await setLoginSessionCookie(login.id, first.userId);
  return { success: true, redirectTo: "/studios" };
}

