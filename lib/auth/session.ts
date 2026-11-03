"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { COOKIE_NAME, setSessionCookie, verifySessionToken, type SessionUser } from "./token";

// NOTE: this is a "use server" module, so every export is a public server
// action. Token minting/verification lives in ./token (not an action module).
export type { SessionUser } from "./token";

/**
 * Retrieves the authenticated user from the active session cookie.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (!sessionCookie?.value) return null;

    return await verifySessionToken(sessionCookie.value);
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

    if (isRateLimited(`login:${tenantSlug ?? "*"}:${normalizedEmail}`, 10)) {
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
  } catch (err: any) {
    console.error("Login authentication error:", err);
    return { success: false, error: "INTERNAL_ERROR" };
  }
}

/**
 * Destroys the active session cookie.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    return { success: true };
  } catch {
    return { success: false };
  }
}
