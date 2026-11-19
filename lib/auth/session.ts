"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { requestIp } from "@/lib/client-ip";
import { decodeSessionToken, isSessionRevoked, requestHost, sessionCookieFor, setSessionCookie, type SessionUser } from "./token";

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
    // Signed out everywhere (e.g. password reset) after this cookie was issued.
    if (await isSessionRevoked(decoded.user.id, decoded.issuedAt)) return null;
    return decoded.user;
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
): Promise<{ success: boolean; error?: string; user?: SessionUser }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    // Per email across every studio: a per-studio key let a made-up studio name reset the count
    // (and studio sign-in also accepts the super-admin). Plus a per-visitor limit when the IP is known.
    if (isRateLimited(`login:${normalizedEmail}`, 10)) {
      return { success: false, error: "RATE_LIMITED" };
    }
    const ip = await requestIp();
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

    if (!user || !user.passwordHash) {
      return { success: false, error: "INVALID_CREDENTIALS" };
    }

    const isValidPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!isValidPassword) {
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
    };

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
    if (isRateLimited(`login:platform:${normalizedEmail}`, 10)) {
      return { success: false, error: "RATE_LIMITED" };
    }
    const ip = await requestIp();
    if (ip && isRateLimited(`login-ip:${ip}`, 30)) {
      return { success: false, error: "RATE_LIMITED" };
    }

    const user = await db.user.findFirst({ where: { email: normalizedEmail, role: "SUPER_ADMIN" } });
    if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
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
export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies();
    const cookie = sessionCookieFor(await requestHost());
    // A cookie set for the whole domain is only removed when deleted with that domain.
    if (cookie.domain) cookieStore.delete({ name: cookie.name, domain: cookie.domain, path: "/" });
    else cookieStore.delete(cookie.name);
    return { success: true };
  } catch {
    return { success: false };
  }
}
