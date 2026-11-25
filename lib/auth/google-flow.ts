import type { Login } from "@prisma/client";
import { db } from "@/lib/db";
import { createLoginFromProof, findLogin, sendJoinedEmail, takeUpClientAccount } from "@/lib/auth/login";
import { liveAccounts, setLoginSessionCookie } from "@/lib/auth/token";
import { accountHref } from "@/lib/auth/switcher";
import { platformUrl, studioUrl } from "@/lib/domain-name";
import { findStudioAccount, passwordResetPath, resetTokenMatches } from "@/lib/auth/password-reset";
import { hasSetUp } from "@/lib/auth/set-up";
import { linkAccountToLogin } from "@/lib/auth/login";
import { signBlob } from "@/lib/auth/signed-blob";
import { cookies } from "next/headers";
import type { GoogleClaims, GoogleErrorCode } from "@/lib/auth/google";

/**
 * What "Continue with Google" does once Google has said who the person is. The routes in
 * app/auth/google only carry the browser to Google and back; every decision about accounts is here.
 * Server-only, not a "use server" module.
 */

/** The short-lived signed cookie that ties a Google sign-in to the browser that started it. */
export const FLOW_COOKIE = "cineflow_google_flow";

/** What the sign-up wizard is handed after Google: the confirmed email, name and Google account, signed. */
export const SIGNUP_TICKET = "signup-ticket";
export const SIGNUP_TICKET_SECONDS = 900;
/** Where the ticket lives: an httpOnly cookie in the browser that came back from Google, never the address. */
export const SIGNUP_TICKET_COOKIE = "cineflow_google_ticket";
export interface SignupTicket {
  kind: typeof SIGNUP_TICKET;
  email: string;
  name: string | null;
  sub: string;
}

/** Why the person is signing in, kept in the flow cookie (never in Google's address). */
export type FlowIntent =
  | { kind: "signin"; studio: string | null }
  | { kind: "invite"; studio: string; email: string; token: string }
  | { kind: "signup" };

export interface FlowBlob {
  state: string;
  verifier: string;
  nonce: string;
  intent: FlowIntent;
  /** Begun on a studio's own domain: where to come back to, and a hash of that browser's nonce. */
  ret?: { to: string; nonceHash: string };
}

type Done = { ok: true; redirectTo: string; loginId?: string; userId?: string } | { ok: false; code: GoogleErrorCode; redirectTo: string };

/** One of our own sign-in pages, with the reason Google sign-in didn't finish. */
export function signInPageFor(studio: string | null, code: GoogleErrorCode): string {
  return studio ? studioUrl(studio, `/login?google=${code}`) : platformUrl(`/login?google=${code}`);
}

/**
 * Where to send someone when Google sign-in didn't finish, by what they were doing: back to the page
 * they started on (a studio's or the platform's sign-in, or the invite page they came from), with the reason.
 */
export function intentBackUrl(intent: FlowIntent, code: GoogleErrorCode): string {
  if (intent.kind === "signup") return platformUrl(`/create-studio?google=${code}`);
  if (intent.kind === "invite") return studioUrl(intent.studio, `${passwordResetPath(intent.email, intent.token)}&welcome=1&google=${code}`);
  return signInPageFor(intent.kind === "signin" ? intent.studio : null, code);
}

/**
 * The login for a Google identity: found by its Google account, else by the verified email (which
 * gains the Google account), else created, which joins the person's set-up accounts exactly as any
 * proof of the email does. A login that already has a different Google account is refused.
 */
export async function loginForGoogle(claims: GoogleClaims): Promise<{ login: Login } | { error: GoogleErrorCode }> {
  const bySub = await db.login.findUnique({ where: { googleSub: claims.sub } });
  if (bySub) return { login: bySub };
  try {
    const byEmail = await findLogin(claims.email);
    if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== claims.sub) return { error: "linked_other" };
      return { login: await db.login.update({ where: { id: byEmail.id }, data: { googleSub: claims.sub } }) };
    }
    const { login, joined } = await createLoginFromProof(claims.email, null);
    const withGoogle = await db.login.update({ where: { id: login.id }, data: { googleSub: claims.sub } });
    await sendJoinedEmail(claims.email, joined);
    return { login: withGoogle };
  } catch {
    // Lost a race for the same Google account or email.
    return { error: "linked_other" };
  }
}

/** Whether any account anywhere (a studio's, not a platform admin's) uses this email. */
async function hasAnyAccount(email: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE lower(email) = ${email} AND "tenantId" IS NOT NULL LIMIT 1`;
  return rows.length > 0;
}

/**
 * Finishes a Google sign-in for the intent: finds or creates the person's login, signs them in (a
 * login session), and says where to go. Failures say where to go too: one of our own sign-in pages
 * with a reason. A Google-verified email is proof of the email, so it may create a login; it never
 * gives staff access without an invite, and never signs a platform super-admin in.
 */
export async function completeGoogleFlow(intent: FlowIntent, claims: GoogleClaims): Promise<Done> {
  if (intent.kind === "invite") return completeInvite(intent, claims);
  if (intent.kind === "signup") {
    // Nothing is created yet: the person finishes the wizard, and the ticket proves the email to onboardStudio.
    if (await isSuperAdminEmail(claims.email)) return { ok: false, code: "failed", redirectTo: intentBackUrl(intent, "failed") };
    const ticket = signBlob({ kind: SIGNUP_TICKET, email: claims.email, name: claims.name, sub: claims.sub }, SIGNUP_TICKET_SECONDS);
    (await cookies()).set(SIGNUP_TICKET_COOKIE, ticket, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SIGNUP_TICKET_SECONDS,
    });
    return { ok: true, redirectTo: platformUrl("/create-studio?google=ready") };
  }
  const back = (code: GoogleErrorCode): Done => ({ ok: false, code, redirectTo: intentBackUrl(intent, code) });

  const studio = intent.studio
    ? await db.tenant.findUnique({ where: { slug: intent.studio }, select: { id: true, slug: true, subscriptionStatus: true } })
    : null;
  if (intent.studio && (!studio || studio.subscriptionStatus === "CANCELLED")) return back("closed");

  // A platform super-admin signs in on its own page only.
  const admin = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND lower(email) = ${claims.email} LIMIT 1`;
  if (admin.length > 0) return back("failed");

  // On the platform page, an email nobody has an account or login for creates nothing.
  if (!studio) {
    const known = (await db.login.findUnique({ where: { googleSub: claims.sub } })) ?? (await findLogin(claims.email));
    if (!known && !(await hasAnyAccount(claims.email))) return back("no_studio");
  }

  const found = await loginForGoogle(claims);
  if ("error" in found) return back(found.error);
  const { login } = found;
  const accounts = await liveAccounts(login.id);

  if (!studio) {
    const first = accounts[0];
    if (!first) return back("no_studio");
    await setLoginSessionCookie(login.id, first.userId);
    return { ok: true, redirectTo: platformUrl("/studios"), loginId: login.id, userId: first.userId };
  }

  const here = accounts.find((a) => a.tenantSlug === studio.slug);
  if (here) {
    await setLoginSessionCookie(login.id, here.userId);
    return { ok: true, redirectTo: accountHref(studio.slug, here.role), loginId: login.id, userId: here.userId };
  }
  const taken = await takeUpClientAccount({ id: login.id, email: login.email }, studio, { name: claims.name });
  if (!taken.ok) return back("needs_invite");
  await setLoginSessionCookie(login.id, taken.userId);
  return { ok: true, redirectTo: accountHref(studio.slug, "CLIENT"), loginId: login.id, userId: taken.userId };
}

/** Whether a platform super-admin uses this email (they sign in on their own page only). */
export async function isSuperAdminEmail(email: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND lower(email) = ${email} LIMIT 1`;
  return rows.length > 0;
}

/**
 * Accepting a team invite with Google. The invite link is shown to the studio, so it proves nothing
 * about the email: Google does. The Google email must be the one the invite was sent to, the invite
 * must still be good, and then the pending staff account joins the person's login (found or created).
 * The invite link is used up. Staff access comes from the invite and nothing else.
 */
async function completeInvite(intent: Extract<FlowIntent, { kind: "invite" }>, claims: GoogleClaims): Promise<Done> {
  const back = (code: GoogleErrorCode): Done => ({ ok: false, code, redirectTo: intentBackUrl(intent, code) });
  const studio = await db.tenant.findUnique({ where: { slug: intent.studio }, select: { id: true, slug: true, subscriptionStatus: true } });
  if (!studio || studio.subscriptionStatus === "CANCELLED") return back("closed");
  if (claims.email !== intent.email.trim().toLowerCase()) return back("mismatch");
  if (await isSuperAdminEmail(claims.email)) return back("failed");

  const account = await findStudioAccount(studio.id, intent.email);
  const pendingStaff = !!account && !account.deactivatedAt && !hasSetUp(account) && account.role !== "CLIENT" && account.role !== "STUDIO_OWNER" && account.role !== "SUPER_ADMIN";
  if (!account || !pendingStaff || !resetTokenMatches(account, intent.token)) return back("failed");

  const found = await loginForGoogle(claims);
  if ("error" in found) return back(found.error);
  await linkAccountToLogin(account.id, found.login.id);
  await db.user.update({ where: { id: account.id }, data: { passwordResetToken: null, passwordResetExpires: null } });
  await setLoginSessionCookie(found.login.id, account.id);
  return { ok: true, redirectTo: accountHref(studio.slug, account.role), loginId: found.login.id, userId: account.id };
}

