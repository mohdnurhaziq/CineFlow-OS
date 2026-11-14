/**
 * Tier 19: Forgot password
 * - The request never reveals whether an email has an account, and is rate-limited
 * - The emailed link resets the password once, within an hour, for that studio only
 * - Resetting signs the account out everywhere and clears open invites
 * - The reset email is not kept in the notification log
 * - The reset page tells an expired link apart before showing the form
 */

import { db } from "@/lib/db";
import nodemailer, { type Transporter } from "nodemailer";
import { TestHarness } from "./test-harness";
import { withRequest, COOKIE_NAME } from "./mocks/session";
import { findProp, provideReactGlobal } from "./react-tree";
import { requestPasswordReset, resetPassword } from "@/lib/actions/password-reset";
import { getCurrentUser, loginWithCredentials } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { getNotificationHistory } from "@/lib/notifications";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import ResetPasswordPage from "@/app/[tenantSlug]/reset-password/page";
import bcrypt from "bcryptjs";

const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;

export async function runTier19PasswordResetTests(harness: TestHarness) {
  harness.setSuite("Tier 19", "Forgot Password");
  await provideReactGlobal();

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants are required for Tier 19");

  // Route email through nodemailer's jsonTransport (nothing leaves the machine) and keep what was sent.
  const savedSmtp = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
  const originalError = console.error;
  harness.registerTeardown(async () => {
    setSmtpTransportForTests(null);
    console.error = originalError;
    for (const k of SMTP_KEYS) {
      if (savedSmtp[k] === undefined) delete process.env[k];
      else process.env[k] = savedSmtp[k];
    }
    await db.user.deleteMany({ where: { email: { startsWith: "t19-" } } });
  });
  process.env.SMTP_HOST = "mailpit";
  process.env.SMTP_PORT = "1025";
  const inbox: { to: string; subject: string; html: string }[] = [];
  const json = nodemailer.createTransport({ jsonTransport: true });
  setSmtpTransportForTests({
    sendMail: async (mail: { to: string; subject: string; html: string }) => {
      inbox.push(mail);
      return json.sendMail(mail);
    },
  } as unknown as Transporter);
  const lastLink = () => {
    const html = inbox[inbox.length - 1]?.html ?? "";
    const href = (html.match(/href="([^"]*reset-password\?[^"]+)"/) ?? [])[1]?.replace(/&amp;/g, "&") ?? "";
    const url = new URL(href || "http://x/");
    return { href, token: url.searchParams.get("token") ?? "", email: url.searchParams.get("email") ?? "" };
  };

  const run = Date.now().toString(36);
  const oldPassword = "Old-pass-123";
  const newPassword = "New-pass-456";
  const mkUser = async (label: string, role = "CLIENT", tenantId = lumina.id) =>
    db.user.create({
      data: {
        tenantId,
        name: `T19 ${label}`,
        email: `t19-${label}-${run}@example.test`,
        role,
        passwordHash: await bcrypt.hash(oldPassword, 4),
        inviteToken: `t19-open-invite-${label}-${run}`,
        inviteTokenExpires: new Date(Date.now() + 86_400_000),
      },
    });
  const client = await mkUser("client");
  const staff = await mkUser("staff", "PHOTOGRAPHER");

  await harness.test("T19-REQ-01: a known and an unknown email get the very same reply", async () => {
    const known = await requestPasswordReset({ tenantSlug: "lumina-cine", email: client.email.toUpperCase() });
    const unknown = await requestPasswordReset({ tenantSlug: "lumina-cine", email: `t19-nobody-${run}@example.test` });
    harness.assertEqual(known.success, true, "Known email: success");
    harness.assertDeepEqual(unknown, known, "Unknown email: identical reply");
    harness.assertEqual(inbox.length, 1, "Only the real account got an email");
    harness.assertEqual(inbox[0]?.to, client.email, "Sent to the account's address");
    harness.assert((inbox[0]?.subject ?? "").includes("Reset your Lumina CineWorks password"), "Subject names the studio", inbox[0]?.subject);
  });

  await harness.test("T19-REQ-02: only a hash of the token is stored, and the link expires in an hour", async () => {
    const { token, email } = lastLink();
    harness.assert(token.length >= 40, "The email carries a long random token");
    harness.assertEqual(email, client.email, "The link names the account's email");
    const row = await db.user.findUniqueOrThrow({ where: { id: client.id } });
    harness.assert(!!row.passwordResetToken && row.passwordResetToken !== token, "Stored value is not the token itself");
    const minutes = ((row.passwordResetExpires?.getTime() ?? 0) - Date.now()) / 60_000;
    harness.assert(minutes > 55 && minutes <= 60, "Expires in about 60 minutes", `${minutes.toFixed(1)} min`);
  });

  await harness.test("T19-REQ-03: the reset email is not kept in the notification log", async () => {
    const entry = getNotificationHistory(5).find((n) => n.event === "PASSWORD_RESET");
    harness.assert(!!entry, "The send is logged");
    harness.assert(!(entry?.emailHtml ?? "").includes("reset-password?"), "Without the link", entry?.emailHtml);
    harness.assertEqual(entry?.whatsappUrl, undefined, "No WhatsApp link for a reset");
  });

  await harness.test("T19-REQ-04: requests are rate-limited per address", async () => {
    const email = `t19-flood-${run}@example.test`;
    const replies = [];
    for (let i = 0; i < 4; i++) replies.push(await requestPasswordReset({ tenantSlug: "lumina-cine", email }));
    harness.assertEqual(replies[2]?.success, true, "Third request still accepted");
    harness.assertEqual(replies[3]?.success, false, "Fourth within 15 minutes refused");
    harness.assertEqual(!replies[3]?.success && replies[3]?.error, "RATE_LIMITED", "As rate-limited");
  });

  await harness.test("T19-RESET-01: a wrong token, another studio, or a weak password change nothing", async () => {
    const { token } = lastLink();
    const wrong = await resetPassword({ tenantSlug: "lumina-cine", email: client.email, token: "x".repeat(43), password: newPassword });
    harness.assertEqual(!wrong.success && wrong.error, "INVALID_LINK", "Wrong token: invalid link");
    const elsewhere = await resetPassword({ tenantSlug: "apex-media", email: client.email, token, password: newPassword });
    harness.assertEqual(!elsewhere.success && elsewhere.error, "INVALID_LINK", "Another studio's page: invalid link");
    const weak = await resetPassword({ tenantSlug: "lumina-cine", email: client.email, token, password: "short" });
    harness.assertEqual(!weak.success && weak.error, "WEAK_PASSWORD", "Short password refused");
    const row = await db.user.findUniqueOrThrow({ where: { id: client.id } });
    harness.assert(!!row.passwordResetToken, "The link is still usable after those attempts");
    harness.assert(await bcrypt.compare(oldPassword, row.passwordHash ?? ""), "Password unchanged");
  });

  await harness.test("T19-RESET-02: the link sets the new password once and signs the account out everywhere", async () => {
    const { token } = lastLink();
    // A session from before the reset, e.g. on another device.
    const oldCookie = await createSessionToken({ id: client.id, email: client.email, name: client.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" });
    const before = await withRequest(async (jar) => {
      jar.set(COOKIE_NAME, oldCookie);
      return getCurrentUser();
    });
    harness.assertEqual(before?.id, client.id, "The old session works before the reset");
    await new Promise((r) => setTimeout(r, 5)); // the reset time must come after the old cookie

    const res = await resetPassword({ tenantSlug: "lumina-cine", email: client.email, token, password: newPassword });
    harness.assertEqual(res.success, true, "Reset succeeds", JSON.stringify(res));

    const after = await withRequest(async (jar) => {
      jar.set(COOKIE_NAME, oldCookie);
      return getCurrentUser();
    });
    harness.assertEqual(after, null, "The old session is signed out");

    const again = await resetPassword({ tenantSlug: "lumina-cine", email: client.email, token, password: "Another-pass-789" });
    harness.assertEqual(!again.success && again.error, "INVALID_LINK", "The link works only once");

    const row = await db.user.findUniqueOrThrow({ where: { id: client.id } });
    harness.assertEqual(row.passwordResetToken, null, "Token cleared");
    harness.assertEqual(row.inviteToken, null, "Open invite cancelled");
    const oldLogin = await loginWithCredentials(client.email, oldPassword, "lumina-cine");
    harness.assertEqual(oldLogin.success, false, "Old password no longer works");
    const newLogin = await loginWithCredentials(client.email, newPassword, "lumina-cine");
    harness.assertEqual(newLogin.success, true, "New password works");
    const fresh = await createSessionToken({ id: client.id, email: client.email, name: client.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" });
    const signedIn = await withRequest(async (jar) => {
      jar.set(COOKIE_NAME, fresh);
      return getCurrentUser();
    });
    harness.assertEqual(signedIn?.id, client.id, "A session started after the reset works");
  });

  await harness.test("T19-RESET-03: an expired link is refused", async () => {
    await requestPasswordReset({ tenantSlug: "lumina-cine", email: staff.email });
    const { token } = lastLink();
    await db.user.update({ where: { id: staff.id }, data: { passwordResetExpires: new Date(Date.now() - 1000) } });
    const res = await resetPassword({ tenantSlug: "lumina-cine", email: staff.email, token, password: newPassword });
    harness.assertEqual(!res.success && res.error, "INVALID_LINK", "Expired: invalid link");
  });

  await harness.test("T19-RESET-04: studio staff can reset their password the same way", async () => {
    await db.user.update({ where: { id: staff.id }, data: { passwordResetExpires: null, passwordResetToken: null } });
    await requestPasswordReset({ tenantSlug: "lumina-cine", email: staff.email });
    const { token } = lastLink();
    const res = await resetPassword({ tenantSlug: "lumina-cine", email: staff.email, token, password: newPassword });
    harness.assertEqual(res.success, true, "Staff reset succeeds", JSON.stringify(res));
    const login = await loginWithCredentials(staff.email, newPassword, "lumina-cine");
    harness.assertEqual(login.success, true, "Staff sign in with the new password");
  });

  await harness.test("T19-PAGE-01: the reset page shows the form for a live link and 'expired' otherwise", async () => {
    const page = (search: { token?: string; email?: string }) =>
      ResetPasswordPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve(search) });
    console.error = () => {};
    try {
      await requestPasswordReset({ tenantSlug: "lumina-cine", email: client.email });
    } finally {
      console.error = originalError;
    }
    const { token } = lastLink();
    const live = await page({ token, email: client.email });
    harness.assertEqual(findProp(live, "token"), token, "Live link: the form, with its token");
    const dead = await page({ token: "x".repeat(43), email: client.email });
    harness.assertEqual(findProp(dead, "token"), undefined, "Bad link: no form");
    const missing = await page({});
    harness.assertEqual(findProp(missing, "token"), undefined, "No token: no form");
  });
}
