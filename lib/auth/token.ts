import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

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
}

export const COOKIE_NAME = "cineflow_session";
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSignature(payloadBase64: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(payloadBase64).digest("base64url");
}

/** Creates a signed session token. */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload: TokenPayload = { ...user, exp: Date.now() + SESSION_EXPIRY_MS };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadBase64}.${createSignature(payloadBase64)}`;
}

/** Verifies and parses a signed session token. */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
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
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
    };
  } catch {
    return null;
  }
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
