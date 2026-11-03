import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Authenticated encryption (AES-256-GCM) for third-party credentials stored in
 * the database, e.g. a studio's payment-gateway secret key. The key is derived
 * from AUTH_SECRET, so rotating AUTH_SECRET invalidates stored secrets (studios
 * would need to re-enter them).
 *
 * Not a "use server" module: nothing here may be callable from the browser.
 */

const VERSION = "v1";

function key(): Buffer {
  return crypto.createHash("sha256").update(`cineflow-secret-box:${env.AUTH_SECRET}`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null if the value is malformed, tampered with, or encrypted under a different key. */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [version, iv, tag, data] = payload.split(".");
    if (version !== VERSION || !iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
