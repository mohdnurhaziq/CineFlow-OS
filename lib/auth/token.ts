import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { hostFrom, sessionCookieFor } from "./cookie-name";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

/**
 * Session token primitives.
 *
 * Deliberately NOT a "use server" module: everything exported from a
 * "use server" file is a candidate public server action, and these helpers
 * can mint or accept signed sessions. Keep them server-internal.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
  /** The person's one login, when this account is joined to one. Absent on a stand-alone account. */
  loginId?: string | null;
}

/** One of a person's accounts, as listed in a login session (a hint: the database is the authority). */
export interface SessionAccount {
  tenantSlug: string;
  userId: string;
  role: string;
}

interface TokenPayload extends SessionUser {
  exp: number;
  /** When the token was issued (ms). Missing on tokens issued before it existed: treated as 0. */
  iat?: number;
  /** A login session lists the person's live accounts; the top-level fields are the active one. */
  accounts?: SessionAccount[];
}

export { COOKIE_NAME, SHARED_COOKIE_NAME, sessionCookieFor } from "./cookie-name";

/** The host of the current request, or "" outside one. */
export async function requestHost(): Promise<string> {
  try {
    const h = await headers();
    return hostFrom((name) => h.get(name));
  } catch {
    return "";
  }
}
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSignature(payloadBase64: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(payloadBase64).digest("base64url");
}

/** Creates a signed session token. A login session also lists the person's accounts. */
export async function createSessionToken(user: SessionUser, accounts?: SessionAccount[]): Promise<string> {
  const now = Date.now();
  const payload: TokenPayload = { ...user, ...(accounts ? { accounts } : {}), iat: now, exp: now + SESSION_EXPIRY_MS };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadBase64}.${createSignature(payloadBase64)}`;
}

/** Verifies and parses a signed session token. */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  return (await decodeSessionToken(token))?.user ?? null;
}

/** Like verifySessionToken, plus when the token was issued (0 for tokens from before `iat`) and, for a login session, the person's account list. */
export async function decodeSessionToken(
  token: string
): Promise<{ user: SessionUser; issuedAt: number; accounts: SessionAccount[] | null } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadBase64, providedSignature] = parts;
    if (!payloadBase64 || !providedSignature) return null;

    const expectedSignature = createSignature(payloadBase64);
    const a = Buffer.from(providedSignature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload: TokenPayload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
    if (Date.now() > payload.exp) return null;

    return {
      user: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        tenantId: payload.tenantId,
        tenantSlug: payload.tenantSlug,
        ...(payload.loginId ? { loginId: payload.loginId } : {}),
      },
      issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
      accounts: Array.isArray(payload.accounts) && payload.loginId ? payload.accounts : null,
    };
  } catch {
    return null;
  }
}

// One lookup per request, however many times the session is read while rendering it.
const sessionStateFor = cache(
  async (
    userId: string
  ): Promise<{ validAfter: number | null; removed: boolean; loginId: string | null; loginValidAfter: number | null }> => {
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { sessionsValidAfter: true, deactivatedAt: true, loginId: true, login: { select: { sessionsValidAfter: true } } },
    });
    // An account that no longer exists has no session: its cookie still carries a role, which
    // owner-only checks would otherwise trust.
    if (!row) return { validAfter: null, removed: true, loginId: null, loginValidAfter: null };
    return {
      validAfter: row.sessionsValidAfter?.getTime() ?? null,
      removed: !!row.deactivatedAt,
      loginId: row.loginId,
      loginValidAfter: row.login?.sessionsValidAfter?.getTime() ?? null,
    };
  }
);

/**
 * True when the account was signed out everywhere (password reset, or removed from the team)
 * after this token was issued, is removed from the team right now, or no longer exists.
 * Tokens from before `iat` existed count as issued at 0, so they end only on such a reset.
 * For a login session (`loginId` given) it is also true when the account is no longer joined to
 * that login, or the login was signed out everywhere after the token was issued.
 */
export async function isSessionRevoked(userId: string, issuedAt: number, loginId?: string | null): Promise<boolean> {
  const state = await sessionStateFor(userId);
  if (state.removed || (state.validAfter !== null && issuedAt < state.validAfter)) return true;
  if (loginId) {
    if (state.loginId !== loginId) return true;
    if (state.loginValidAfter !== null && issuedAt < state.loginValidAfter) return true;
  }
  return false;
}

/** A person's accounts that can still be used: not removed, studio not cancelled. By studio name. */
export async function liveAccounts(loginId: string): Promise<(SessionAccount & { tenantName: string; user: SessionUser })[]> {
  const rows = await db.user.findMany({
    where: { loginId, deactivatedAt: null, tenantId: { not: null }, tenant: { subscriptionStatus: { not: "CANCELLED" } } },
    include: { tenant: { select: { slug: true, name: true } } },
    orderBy: { tenant: { name: "asc" } },
  });
  return rows.map((u) => ({
    tenantSlug: u.tenant!.slug,
    tenantName: u.tenant!.name,
    userId: u.id,
    role: u.role,
    user: { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: u.tenant!.slug, loginId },
  }));
}

/** Writes the session cookie for `token`. False outside a request context. */
async function writeSessionCookie(token: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const cookie = sessionCookieFor(await requestHost());
    cookieStore.set(cookie.name, token, {
      ...(cookie.domain ? { domain: cookie.domain } : {}),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRY_MS / 1000,
      path: "/",
    });
    return true;
  } catch {
    // Non-request context fallback (e.g. CLI runner or automated test)
    return false;
  }
}

/** Signs the user in by setting the session cookie. Returns false outside a request context. */
export async function setSessionCookie(user: SessionUser): Promise<boolean> {
  return writeSessionCookie(await createSessionToken(user));
}

/**
 * Signs a person in through their login: the session lists all their live accounts, and
 * `activeUserId` is the active one. False if that account isn't one of them, or outside a request.
 */
export async function setLoginSessionCookie(loginId: string, activeUserId: string): Promise<boolean> {
  const accounts = await liveAccounts(loginId);
  const active = accounts.find((a) => a.userId === activeUserId);
  if (!active) return false;
  const token = await createSessionToken(
    active.user,
    accounts.map(({ tenantSlug, userId, role }) => ({ tenantSlug, userId, role }))
  );
  return writeSessionCookie(token);
}
