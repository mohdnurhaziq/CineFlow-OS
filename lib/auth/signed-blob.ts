import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * A small signed, expiring piece of JSON for short hops between our own pages (the Google sign-in's
 * flow cookie, a sign-up ticket). HMAC-SHA256 with AUTH_SECRET, under its own prefix so a session
 * token's signature can never be passed off as one. Server-only, not a "use server" module.
 */

const sign = (body: string) => createHmac("sha256", env.AUTH_SECRET).update(`blob:${body}`).digest("base64url");

export function signBlob(payload: object, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The payload, or null when the signature is wrong, it is malformed, or it has expired. */
export function openBlob<T>(blob: string): T | null {
  try {
    const parts = blob.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = Buffer.from(sign(parts[0]));
    const given = Buffer.from(parts[1]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8")) as T & { exp?: number };
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
