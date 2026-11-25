import bcrypt from "bcryptjs";
import type { Login } from "@prisma/client";
import { db } from "@/lib/db";
import { hasSetUp } from "@/lib/auth/set-up";
import { signInBlocked, signInFailed } from "@/lib/auth/sign-in-limits";
import { requestIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { escapeEmailHtml, sendPlatformEmail } from "@/lib/notifications";

/**
 * One login per person across studios (docs/superpowers/specs/2026-11-25-one-login-design.md).
 * A Login exists only for an email that has been proven, and its password is the one typed on the
 * proof page: never copied from an unproven account. Server-only, not a "use server" module.
 */

/** Lowercase and trimmed: how a login's email is stored and looked up. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findLogin(email: string): Promise<Login | null> {
  return db.login.findUnique({ where: { email: normalizeEmail(email) } });
}

/**
 * Whether `password` is the login's password for `email`, for the places that ask for it to join
 * another studio's account (registering, starting a studio, accepting a team invite). Every wrong
 * try counts against the same limit as signing in, so these can't be used to guess a password
 * 8 times at every studio. No login for the email is reported as "NO_LOGIN" and counts for nothing.
 */
export async function verifyLoginPassword(
  email: string,
  password: string
): Promise<{ ok: true; login: Login } | { ok: false; reason: "NO_LOGIN" | "WRONG" | "RATE_LIMITED" }> {
  const normalized = normalizeEmail(email);
  const login = await findLogin(normalized);
  if (!login) return { ok: false, reason: "NO_LOGIN" };
  const ip = await requestIp();
  if (signInBlocked("login", normalized, ip) || (ip && isRateLimited(`login-ip:${ip}`, 30))) return { ok: false, reason: "RATE_LIMITED" };
  if (!login.passwordHash || !bcrypt.compareSync(password, login.passwordHash)) {
    signInFailed("login", normalized, ip);
    return { ok: false, reason: "WRONG" };
  }
  return { ok: true, login };
}

export interface JoinedAccount {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: string;
}

/** What joining does to an account: it now signs in through the login, and nothing else opens it. */
const JOIN_FIELDS = {
  passwordHash: null,
  inviteToken: null,
  inviteTokenExpires: null,
  isQuickCreated: false,
} as const;

/**
 * Creates the login for a proven email, then joins the person's accounts: `takeUpUserId` (the
 * account whose link was just used, even if it isn't set up yet) and every other set-up,
 * not-yet-linked, non-super-admin account with that email. Accounts nobody has taken up stay as
 * they are. Joined accounts lose their own password and have their sessions ended, so a password
 * someone else set on an unproven account stops working. Throws if the email already has a login.
 */
export async function createLoginFromProof(
  email: string,
  passwordHash: string | null,
  opts: { takeUpUserId?: string } = {}
): Promise<{ login: Login; joined: JoinedAccount[] }> {
  const normalized = normalizeEmail(email);
  if (await findLogin(normalized)) throw new Error("A login already exists for this email.");

  // Legacy rows can be mixed case, so match on lower(email).
  const candidates = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE lower(email) = ${normalized} AND role != 'SUPER_ADMIN' AND "loginId" IS NULL AND "tenantId" IS NOT NULL`;
  const users = await db.user.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    include: { tenant: { select: { id: true, name: true } } },
  });
  const toJoin = users.filter((u) => hasSetUp(u) || u.id === opts.takeUpUserId);

  return db.$transaction(async (tx) => {
    const login = await tx.login.create({ data: { email: normalized, passwordHash } });
    const now = new Date();
    for (const u of toJoin) {
      await tx.user.update({ where: { id: u.id }, data: { ...JOIN_FIELDS, loginId: login.id, sessionsValidAfter: now } });
    }
    const joined = toJoin.map((u) => ({ userId: u.id, tenantId: u.tenant!.id, tenantName: u.tenant!.name, role: u.role }));
    return { login, joined };
  });
}

/** Joins one account to an existing login (same changes as when a login is created). */
export async function linkAccountToLogin(userId: string, loginId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { ...JOIN_FIELDS, loginId, sessionsValidAfter: new Date() } });
}

/**
 * Sets the login's password after the person proved their email by a link only their inbox saw (a
 * reset, a client invite or the confirm link). It always ends the login's sessions everywhere, even
 * for the same password: someone who thinks another person is in their account resets to be sure.
 */
export async function setLoginPassword(loginId: string, password: string): Promise<void> {
  await db.login.update({ where: { id: loginId }, data: { passwordHash: await bcrypt.hash(password, 10), sessionsValidAfter: new Date() } });
}

/**
 * The email link was used: `account` is taken up into the person's one login, whose password is
 * the one just typed. Creates the login (joining the person's other set-up accounts, and emailing
 * them which) or joins the account to the login that already exists. Returns the login's id.
 */
export async function proveEmailAndJoin(account: { id: string; email: string; loginId: string | null }, password: string): Promise<string> {
  if (account.loginId) {
    await setLoginPassword(account.loginId, password);
    return account.loginId;
  }
  const existing = await findLogin(account.email);
  if (existing) {
    await linkAccountToLogin(account.id, existing.id);
    await setLoginPassword(existing.id, password);
    return existing.id;
  }
  const { login, joined } = await createLoginFromProof(account.email, await bcrypt.hash(password, 10), { takeUpUserId: account.id });
  await sendJoinedEmail(account.email, joined.filter((j) => j.userId !== account.id));
  return login.id;
}

const roleLabel = (role: string) => (role === "STUDIO_OWNER" ? "Owner" : role === "CLIENT" ? "Client" : "Team");

/**
 * One email to the person listing the studios that were just joined to their login. Nothing is
 * sent for an empty list. Never throws.
 */
export async function sendJoinedEmail(email: string, joined: JoinedAccount[]): Promise<void> {
  if (joined.length === 0) return;
  try {
    const lines = joined.map((j) => `${j.tenantName} (${roleLabel(j.role)})`);
    const closing = "Use the password you just set to sign in at any of them. Your old passwords for these studios no longer work.";
    await sendPlatformEmail({
      to: email,
      subject: "One sign-in for all your CineFlow studios",
      title: "One sign-in for all your studios",
      bodyHtml: `<p>Your CineFlow accounts for this email are now one sign-in:</p><ul>${lines.map((l) => `<li>${escapeEmailHtml(l)}</li>`).join("")}</ul><p>${escapeEmailHtml(closing)}</p>`,
      text: `Your CineFlow accounts for this email are now one sign-in:\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n${closing}`,
    });
  } catch (err) {
    console.error("Joined-accounts email failed:", err);
  }
}
