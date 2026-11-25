"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { signInBlocked, signInFailed } from "@/lib/auth/sign-in-limits";

import { requestIp } from "@/lib/client-ip";
import { decodeSessionToken, isSessionRevoked, liveAccounts, requestHost, sessionCookieFor, setLoginSessionCookie, setSessionCookie, type SessionAccount, type SessionUser } from "./token";
import { requestStudioSlug } from "./request-studio";
import { findLogin } from "@/lib/auth/login";
import { hasSetUp } from "@/lib/auth/set-up";
import { handoffForRequest, isCustomDomainHost } from "@/lib/auth/handoff";
import { platformUrl } from "@/lib/domain-name";

// NOTE: this is a "use server" module, so every export is a public server
// action. Token minting/verification lives in ./token (not an action module).
export type { SessionUser } from "./token";

/**
 * Retrieves the authenticated user from the active session cookie.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(sessionCookieFor(await requestHost()).name);
    if (!sessionCookie?.value) return null;

    const decoded = await decodeSessionToken(sessionCookie.value);
    if (!decoded) return null;
    const loginId = decoded.user.loginId ?? null;

    // A stand-alone account (or a token from before logins): the one account, as ever.
    // Signed out everywhere (e.g. password reset) after this cookie was issued.
    if (!loginId || !decoded.accounts) {
      if (await isSessionRevoked(decoded.user.id, decoded.issuedAt)) return null;
      return decoded.user;
    }

    // A login session holds the person: the account is the one for the studio being visited, so
    // two studios open in two tabs each stay signed in as their own account. Where no studio is
    // known (the platform's pages) it is the account the person signed in with.
    const slug = await requestStudioSlug();
    const entry = slug ? decoded.accounts.find((a) => a.tenantSlug === slug) : decoded.accounts.find((a) => a.userId === decoded.user.id);
    if (!entry) return null;
    if (await isSessionRevoked(entry.userId, decoded.issuedAt, loginId)) return null;
    // The list in the token is a hint: the account must still be joined, usable and in a live studio.
    const row = await db.user.findUnique({ where: { id: entry.userId }, include: { tenant: { select: { slug: true, subscriptionStatus: true } } } });
    if (!row || row.loginId !== loginId || row.deactivatedAt || !row.tenant || row.tenant.subscriptionStatus === "CANCELLED") return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role, tenantId: row.tenantId, tenantSlug: row.tenant.slug, loginId };
  } catch {
    return null;
  }
}

/**
 * The signed-in person, as a login: their accounts across studios (for the platform's pages and
 * the switcher). Null for a stand-alone account, a super-admin, or no session.
 */
export async function getCurrentLogin(): Promise<{ loginId: string; email: string; accounts: SessionAccount[] } | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(sessionCookieFor(await requestHost()).name);
    if (!sessionCookie?.value) return null;
    const decoded = await decodeSessionToken(sessionCookie.value);
    const loginId = decoded?.user.loginId ?? null;
    if (!decoded || !decoded.accounts || !loginId) return null;
    if (await isSessionRevoked(decoded.user.id, decoded.issuedAt, loginId)) return null;
    const login = await db.login.findUnique({ where: { id: loginId }, select: { email: true } });
    if (!login) return null;
    const accounts = (await liveAccounts(loginId)).map(({ tenantSlug, userId, role }) => ({ tenantSlug, userId, role }));
    return { loginId, email: login.email, accounts };
  } catch {
    return null;
  }
}

/**
 * Authenticates user credentials and sets the session cookie.
 *
 * Accounts are unique per (studio, email), so when a studio slug is given the
 * lookup is scoped to that studio; platform super-admins can sign in anywhere.
 */
export async function loginWithCredentials(
  email: string,
  password: string,
  tenantSlug?: string
): Promise<{ success: boolean; error?: string; user?: SessionUser; handoffCode?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    // Per email across every studio (a per-studio key let a made-up studio name reset the count, and
    // studio sign-in also accepts the super-admin), counted per visitor when the IP is known so that
    // someone failing on purpose can't lock the real owner out.
    const ip = await requestIp();
    if (signInBlocked("login", normalizedEmail, ip)) {
      return { success: false, error: "RATE_LIMITED" };
    }
    if (ip && isRateLimited(`login-ip:${ip}`, 30)) {
      return { success: false, error: "RATE_LIMITED" };
    }

    const user = tenantSlug
      ? ((await db.user.findFirst({
          where: { email: normalizedEmail, tenant: { slug: tenantSlug } },
          include: { tenant: true },
        })) ??
        (await db.user.findFirst({
          where: { email: normalizedEmail, role: "SUPER_ADMIN" },
          include: { tenant: true },
        })))
      : await db.user.findFirst({ where: { email: normalizedEmail }, include: { tenant: true } });

    // No account here, but the email has a login and this is its password: the person is signed in
    // to their other studios and offered "Continue as a client" of this one (never any staff access).
    // A client account the studio made for the email that nobody has taken up yet counts as no account.
    const pendingClient = !!user && user.role === "CLIENT" && !hasSetUp(user) && !user.deactivatedAt;
    if ((!user || pendingClient) && tenantSlug) {
      const studio = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { subscriptionStatus: true } });
      const theirs = studio && studio.subscriptionStatus !== "CANCELLED" ? await findLogin(normalizedEmail) : null;
      if (theirs?.passwordHash && bcrypt.compareSync(password, theirs.passwordHash)) {
        const first = (await liveAccounts(theirs.id))[0];
        if (first) {
          await setLoginSessionCookie(theirs.id, first.userId);
          return { success: false, error: "NO_ACCOUNT_HERE" };
        }
      }
    }

    // An account joined to the person's one login signs in with the login's password.
    const login = user?.loginId ? await db.login.findUnique({ where: { id: user.loginId } }) : null;
    const passwordHash = user?.loginId ? (login?.passwordHash ?? null) : (user?.passwordHash ?? null);
    if (!user || !passwordHash || !bcrypt.compareSync(password, passwordHash)) {
      signInFailed("login", normalizedEmail, ip);
      return { success: false, error: "INVALID_CREDENTIALS" };
    }

    // Role and Tenant authorization check
    if (user.role !== "SUPER_ADMIN" && tenantSlug && user.tenant?.slug !== tenantSlug) {
      return { success: false, error: "TENANT_MISMATCH" };
    }

    // Removed by the studio. Said only after the password checks out, so it reveals nothing about which emails exist.
    if (user.deactivatedAt) {
      return { success: false, error: "ACCOUNT_REMOVED" };
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: user.tenant?.slug ?? null,
      ...(user.loginId ? { loginId: user.loginId } : {}),
    };

    if (user.loginId) {
      await setLoginSessionCookie(user.loginId, user.id);
      // On a studio's own domain the browser carries the sign-in over to the platform host too.
      const handoffCode = await handoffForRequest(user.loginId, user.id);
      return { success: true, user: sessionUser, ...(handoffCode ? { handoffCode } : {}) };
    }
    await setSessionCookie(sessionUser);

    return { success: true, user: sessionUser };
  } catch (err) {
    console.error("Login authentication error:", err);
    return { success: false, error: "INTERNAL_ERROR" };
  }
}

/**
 * Signs in the platform super-admin on its own page (/super-admin/login), so it works before
 * any studio exists. Only super-admin accounts: a studio account's right password is refused
 * like a wrong one, so this page reveals nothing about studio accounts.
 */
export async function loginPlatformAdmin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "ACCOUNT_REMOVED" | "INTERNAL_ERROR"; user?: SessionUser }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    // As for studio sign-in: counted per visitor, so a stranger's failures can't lock the admin out.
    const ip = await requestIp();
    if (signInBlocked("login:platform", normalizedEmail, ip)) {
      return { success: false, error: "RATE_LIMITED" };
    }
    if (ip && isRateLimited(`login-ip:${ip}`, 30)) {
      return { success: false, error: "RATE_LIMITED" };
    }

    const user = await db.user.findFirst({ where: { email: normalizedEmail, role: "SUPER_ADMIN" } });
    if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      signInFailed("login:platform", normalizedEmail, ip);
      return { success: false, error: "INVALID_CREDENTIALS" };
    }
    if (user.deactivatedAt) return { success: false, error: "ACCOUNT_REMOVED" };

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: null,
    };
    await setSessionCookie(sessionUser);
    return { success: true, user: sessionUser };
  } catch (err) {
    console.error("Platform sign-in error:", err);
    return { success: false, error: "INTERNAL_ERROR" };
  }
}

/**
 * Destroys the active session cookie.
 */
export async function logoutAction(): Promise<{ success: boolean; via?: string }> {
  try {
    const cookieStore = await cookies();
    const host = await requestHost();
    const cookie = sessionCookieFor(host);
    // A cookie set for the whole domain is only removed when deleted with that domain.
    if (cookie.domain) cookieStore.delete({ name: cookie.name, domain: cookie.domain, path: "/" });
    else cookieStore.delete(cookie.name);
    // On a studio's own domain only that host's cookie is gone: the browser then goes through the
    // platform to clear its shared cookie too.
    return { success: true, ...((await isCustomDomainHost(host)) ? { via: platformUrl("/auth/sign-out") } : {}) };
  } catch {
    return { success: false };
  }
}
