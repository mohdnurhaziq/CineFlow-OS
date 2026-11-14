import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
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
}

interface TokenPayload extends SessionUser {
  exp: number;
  /** When the token was issued (ms). Missing on tokens issued before it existed: treated as 0. */
  iat?: number;
}

export const COOKIE_NAME = "cineflow_session";
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSignature(payloadBase64: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(payloadBase64).digest("base64url");
}

/** Creates a signed session token. */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const now = Date.now();
  const payload: TokenPayload = { ...user, iat: now, exp: now + SESSION_EXPIRY_MS };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadBase64}.${createSignature(payloadBase64)}`;
}

/** Verifies and parses a signed session token. */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  return (await decodeSessionToken(token))?.user ?? null;
}

/** Like verifySessionToken, plus when the token was issued (0 for tokens from before `iat`). */
export async function decodeSessionToken(token: string): Promise<{ user: SessionUser; issuedAt: number } | null> {
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
      },
      issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}

// One lookup per request, however many times the session is read while rendering it.
const sessionsValidAfterFor = cache(async (userId: string): Promise<number | null> => {
  const row = await db.user.findUnique({ where: { id: userId }, select: { sessionsValidAfter: true } });
  return row?.sessionsValidAfter?.getTime() ?? null;
});

/**
 * True when the account was signed out everywhere (password reset) after this token was issued.
 * Tokens from before `iat` existed count as issued at 0, so they end only on such a reset.
 */
export async function isSessionRevoked(userId: string, issuedAt: number): Promise<boolean> {
  const validAfter = await sessionsValidAfterFor(userId);
  return validAfter !== null && issuedAt < validAfter;
}

/** Signs the user in by setting the session cookie. Returns false outside a request context. */
export async function setSessionCookie(user: SessionUser): Promise<boolean> {
  const token = await createSessionToken(user);
  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
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
