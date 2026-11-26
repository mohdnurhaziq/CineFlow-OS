/**
 * The personal invite a super-admin's approval creates: a single-use link, only for the applicant's
 * email, good for INVITE_DAYS. The database keeps a hash of its token, never the token.
 * Server-only, not a "use server" module.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/domain-name";

export const INVITE_DAYS = 14;

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string): string {
  return new URL(`/create-studio?invite=${token}`, appUrl()).href;
}

/** The approved, unused, unexpired request a link belongs to, or null. */
export async function findUsableInvite(token: unknown, now: Date = new Date()) {
  if (typeof token !== "string" || !token || token.length > 200) return null;
  return db.inviteRequest.findFirst({
    where: { inviteTokenHash: hashInviteToken(token), status: "APPROVED", joinedAt: null, inviteExpiresAt: { gt: now } },
  });
}

/**
 * Whether any account or one sign-in already uses this email (any capitals). If so, an invite never
 * confirms it: confirming an email takes over every account on it, and an invite is easier to pass on
 * than the 60-minute confirm link.
 */
export async function emailAlreadyInUse(email: string): Promise<boolean> {
  const lower = email.trim().toLowerCase();
  const users = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE lower(email) = ${lower} LIMIT 1`;
  return users.length > 0 || (await db.login.count({ where: { email: lower } })) > 0;
}
