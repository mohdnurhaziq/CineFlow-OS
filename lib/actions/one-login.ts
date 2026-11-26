"use server";

import { db } from "@/lib/db";
import { getCurrentLogin, getCurrentUser, logoutAction } from "@/lib/auth/session";
import bcrypt from "bcryptjs";
import { findLogin, normalizeEmail, takeUpClientAccount } from "@/lib/auth/login";
import { signInBlocked, signInFailed } from "@/lib/auth/sign-in-limits";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { hasSetUp } from "@/lib/auth/set-up";
import { signInTarget } from "@/lib/auth/sign-in-target";
import { liveAccounts, requestHost, setLoginSessionCookie, setSessionCookie } from "@/lib/auth/token";
import { accountHref } from "@/lib/auth/switcher";
import { GOOGLE_NONCE_COOKIE, bareHost, handoffForRequest, isCustomDomainHost } from "@/lib/auth/handoff";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

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

  const taken = await takeUpClientAccount({ id: me.loginId, email: me.email }, tenant, { name: null });
  if (!taken.ok) {
    return {
      success: false,
      message: taken.reason === "staff" ? "Ask the studio to invite you." : "This studio already has an account for this email. Ask the studio to help you sign in.",
    };
  }
  const { userId, name } = taken;

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
 * How many stand-alone accounts a password is tried against. A refusal always does exactly this many
 * checks, padded with a dummy, so how long it takes says nothing about the email.
 */
const STAND_ALONE_CHECKS = 4;

/**
 * The email's stand-alone accounts that this password opens: exactly those it would open on their
 * studio's own sign-in page, and never a removed one, one in a closed studio, or the super-admin.
 * Owners come first, then team, then client accounts, newest first (a person with more than
 * STAND_ALONE_CHECKS of them signs in to the rest on the studio's own page).
 */
async function standAloneAccountsFor(email: string, password: string) {
  const rows = await db.user.findMany({
    where: {
      email,
      loginId: null,
      passwordHash: { not: null },
      deactivatedAt: null,
      tenantId: { not: null },
      role: { not: "SUPER_ADMIN" },
      tenant: { subscriptionStatus: { not: "CANCELLED" } },
    },
    include: { tenant: { select: { slug: true, name: true } }, teamRole: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rank = (role: string) => (role === "STUDIO_OWNER" ? 0 : role === "CLIENT" ? 2 : 1);
  rows.sort((a, b) => rank(a.role) - rank(b.role));
  const opened: typeof rows = [];
  for (let i = 0; i < STAND_ALONE_CHECKS; i++) {
    const row = rows[i];
    if (bcrypt.compareSync(password, row?.passwordHash ?? NO_LOGIN_HASH) && row) opened.push(row);
  }
  return opened;
}

export interface StudioChoice {
  slug: string;
  name: string;
  role: string;
}

export type PlatformSignInResult =
  | { success: true; redirectTo: string }
  | { success: false; error: "INVALID_CREDENTIALS" | "RATE_LIMITED" }
  | { success: false; error: "CHOOSE_STUDIO"; studios: StudioChoice[] };

/**
 * Sign-in on the platform's own page (/login). The person's one login goes to "Your studios". An
 * account that has no one login yet (a new studio owner, say) signs in with its own password and goes
 * straight to its studio, as if signed in on that studio's page: a stand-alone session, with no login
 * made, because nothing here proves the email. If the password opens several, the person chooses
 * (`studioSlug`). Every failure is the same answer (an unknown email, a wrong password, a
 * super-admin's email), and every email is rate-limited alike, with the same limit as a studio's
 * sign-in, so nothing here tells anyone whether an email has an account.
 */
export async function loginToPlatform(email: string, password: string, studioSlug?: string): Promise<PlatformSignInResult> {
  const normalized = normalizeEmail(email);
  const ip = await requestIp();
  if (signInBlocked("login", normalized, ip) || (ip && isRateLimited(`login-ip:${ip}`, 30))) return { success: false, error: "RATE_LIMITED" };

  const login = await findLogin(normalized);
  const matches = bcrypt.compareSync(password, login?.passwordHash ?? NO_LOGIN_HASH) && !!login?.passwordHash;
  const first = login && matches ? (await liveAccounts(login.id))[0] : undefined;
  if (login && first) {
    await setLoginSessionCookie(login.id, first.userId);
    return { success: true, redirectTo: "/studios" };
  }

  let opened = await standAloneAccountsFor(normalized, password);
  if (studioSlug) opened = opened.filter((u) => u.tenant!.slug === studioSlug);
  const [account, another] = opened;
  if (!account) {
    signInFailed("login", normalized, ip);
    return { success: false, error: "INVALID_CREDENTIALS" };
  }
  if (another) {
    return {
      success: false,
      error: "CHOOSE_STUDIO",
      studios: opened.map((u) => ({
        slug: u.tenant!.slug,
        name: u.tenant!.name,
        role: u.role === "STUDIO_OWNER" ? "Owner" : u.role === "CLIENT" ? "Client" : (u.teamRole?.name ?? "Team"),
      })),
    };
  }
  await setSessionCookie({
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    tenantId: account.tenantId,
    tenantSlug: account.tenant!.slug,
  });
  return { success: true, redirectTo: accountHref(account.tenant!.slug, account.role) };
}

/**
 * For "Continue with Google" on a studio's own domain only: sets a one-time nonce in a cookie on this
 * domain and returns it with this domain's address. The platform keeps only a hash of it, so only this
 * browser can use the code that brings the sign-in back here. Null on every other host.
 */
export async function beginGoogleReturn(): Promise<{ returnTo: string; nonce: string } | null> {
  const host = bareHost(await requestHost());
  if (!(await isCustomDomainHost(host))) return null;
  const nonce = randomBytes(24).toString("base64url");
  (await cookies()).set(GOOGLE_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
  return { returnTo: `https://${host}/`, nonce };
}
