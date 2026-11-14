import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * "Forgot password" tokens. A reset link carries a random token; only its SHA-256 is stored,
 * with a short expiry, and it works once. Server-only, not a "use server" module.
 */

export const PASSWORD_RESET_TTL_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a fresh reset token for `userId` (replacing any earlier one) and returns the raw token. */
export async function issuePasswordReset(userId: string, now: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: hashToken(token),
      passwordResetExpires: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });
  return token;
}

/** True when `token` is the user's current, unexpired reset token. */
export function resetTokenMatches(
  user: { passwordResetToken: string | null; passwordResetExpires: Date | null },
  token: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!token || !user.passwordResetToken || !user.passwordResetExpires) return false;
  if (user.passwordResetExpires.getTime() < now.getTime()) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(user.passwordResetToken, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A studio's account for `email` (case-insensitive for legacy mixed-case rows), or null. */
export async function findStudioAccount(tenantId: string, email: string) {
  const raw = email.trim();
  return db.user.findFirst({
    where: { tenantId, email: { in: Array.from(new Set([raw.toLowerCase(), raw])) } },
    select: { id: true, name: true, email: true, role: true, passwordResetToken: true, passwordResetExpires: true },
  });
}

/** Link to the studio's reset page for this token. */
export function passwordResetPath(tenantSlug: string, email: string, token: string): string {
  return `/${tenantSlug}/reset-password?${new URLSearchParams({ token, email }).toString()}`;
}
