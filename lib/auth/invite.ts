import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * "Set your password" invites for client accounts a studio creates on the client's behalf
 * (e.g. when sending a proposal). Proposals, vaults and call sheets need a signed-in client,
 * and such an account has no password and no booking to claim it with, so the email carries
 * a one-time invite instead.
 *
 * Only a SHA-256 of the token is stored. Not a "use server" module.
 */

const INVITE_TTL_MS = 30 * 24 * 3600 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a fresh invite for `userId` (replacing any earlier one) and returns the raw token for the link. */
export async function issueClientInvite(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.user.update({
    where: { id: userId },
    data: { inviteToken: hashToken(token), inviteTokenExpires: new Date(Date.now() + INVITE_TTL_MS) },
  });
  return token;
}

/** True when `token` is the user's current, unexpired invite. */
export function inviteMatches(
  user: { inviteToken: string | null; inviteTokenExpires: Date | null },
  token: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!token || !user.inviteToken || !user.inviteTokenExpires) return false;
  if (user.inviteTokenExpires.getTime() < now.getTime()) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(user.inviteToken, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Link to the studio's sign-up page that claims the account with `token`, then continues to `next`. */
export function clientInvitePath(tenantSlug: string, email: string, token: string, next: string): string {
  const q = new URLSearchParams({ invite: token, email, next });
  return `/${tenantSlug}/register?${q.toString()}`;
}
