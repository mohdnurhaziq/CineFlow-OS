/**
 * Tier 41: one login across studios (docs/superpowers/specs/2026-11-25-one-login-design.md).
 * Part 1: the login layer. A Login exists only for a proven email, and joins that person's
 * set-up accounts in every studio.
 */

import bcrypt from "bcryptjs";
import nodemailer, { type Transporter } from "nodemailer";
import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { hasSetUp } from "@/lib/auth/set-up";
import { createLoginFromProof, findLogin, sendJoinedEmail, type JoinedAccount } from "@/lib/auth/login";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { COOKIE_NAME, createSessionToken, liveAccounts } from "@/lib/auth/token";
import { getCurrentLogin, getCurrentUser } from "@/lib/auth/session";
import { withLoginSession, withSession, withStudio } from "./mocks/session";

const STAMP = Date.now().toString(36);
let counter = 0;
const emailFor = (label: string) => `t41-${label}-${STAMP}-${++counter}@example.test`;

export async function runTier41OneLoginTests(harness: TestHarness) {
  harness.setSuite("Tier 41", "One login");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants lumina-cine and apex-media are required");

  const createdEmails = new Set<string>();
  const createdStudios: string[] = [];

  /** A throwaway studio. */
  const makeStudio = async (label: string) => {
    const t = await db.tenant.create({ data: { name: `T41 ${label} ${STAMP}`, slug: `t41-${label}-${STAMP}-${++counter}` } });
    createdStudios.push(t.id);
    return t;
  };
  /** An account in a studio, with an optional password and a pending invite. */
  const makeUser = async (
    tenantId: string,
    email: string,
    role: string,
    opts: { password?: string; inviteToken?: string } = {}
  ) => {
    createdEmails.add(email.toLowerCase());
    return db.user.create({
      data: {
        tenantId,
        name: `T41 ${role}`,
        email,
        role,
        passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : null,
        ...(opts.inviteToken ? { inviteToken: opts.inviteToken, inviteTokenExpires: new Date(Date.now() + 86_400_000) } : {}),
      },
    });
  };
  const cleanUp = async () => {
    const emails = [...createdEmails];
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.login.deleteMany({ where: { email: { in: emails } } });
    await db.tenant.deleteMany({ where: { id: { in: createdStudios } } });
    createdEmails.clear();
    createdStudios.length = 0;
  };
  harness.registerTeardown(cleanUp);

  type Mail = { to: string; subject: string; html: string; text: string };
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;
  const withInbox = async (fn: (inbox: Mail[]) => Promise<void>) => {
    const saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    const inbox: Mail[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({
      sendMail: async (mail: Mail) => {
        inbox.push(mail);
        return json.sendMail(mail);
      },
    } as unknown as Transporter);
    try {
      await fn(inbox);
    } finally {
      setSmtpTransportForTests(json);
      for (const k of SMTP_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  await harness.test("T41-JOIN-01: creating a login links the person's set-up accounts and leaves pending ones alone", async () => {
    const email = emailFor("join1");
    try {
      const third = await makeStudio("third");
      const a = await makeUser(lumina.id, email, "CLIENT", { password: "old-pass-1" });
      const b = await makeUser(apex.id, email.replace("t41-", "T41-"), "PHOTOGRAPHER", { password: "old-pass-2" });
      const c = await makeUser(third.id, email, "CLIENT", { inviteToken: "pending-invite-hash" });
      const s = await makeUser(null as unknown as string, email, "SUPER_ADMIN", { password: "super-pass-1" });
      const { login, joined } = await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
      harness.assertEqual(login.email, email.toLowerCase(), "The login's email is stored lowercase");
      const [a2, b2, c2, s2] = await Promise.all([a, b, c, s].map((u) => db.user.findUniqueOrThrow({ where: { id: u.id } })));
      harness.assert(a2!.loginId === login.id && a2!.passwordHash === null && a2!.sessionsValidAfter !== null, "A set-up client is linked, its own password cleared and its sessions ended");
      harness.assert(b2!.loginId === login.id && b2!.passwordHash === null, "A set-up team account is linked, even with the email in another case");
      harness.assert(c2!.loginId === null && c2!.inviteToken === "pending-invite-hash", "A pending invite is left alone");
      harness.assert(s2!.loginId === null && s2!.passwordHash !== null, "The super-admin is never linked");
      harness.assertEqual(joined.length, 2, "Two accounts were joined");
      harness.assert(joined.some((j) => j.tenantName === lumina.name && j.role === "CLIENT"), "…and says which studio and role");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-JOIN-02: a password set on an unproven account stops working once the email is proven", async () => {
    const email = emailFor("join2");
    try {
      const a = await makeUser(lumina.id, email, "CLIENT", { password: "attacker-pass" });
      const { login } = await createLoginFromProof(email, await bcrypt.hash("owner-pass-123", 4));
      const a2 = await db.user.findUniqueOrThrow({ where: { id: a.id } });
      harness.assertEqual(a2.passwordHash, null, "The attacker's password is gone from the account");
      harness.assert(bcrypt.compareSync("owner-pass-123", login.passwordHash!), "The login has the password typed on the proof page");
      harness.assert(!bcrypt.compareSync("attacker-pass", login.passwordHash!), "…and never the attacker's");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-JOIN-03: takeUpUserId links an account that isn't set up yet", async () => {
    const email = emailFor("join3");
    try {
      const c = await makeUser(lumina.id, email, "CLIENT", { inviteToken: "invite-hash" });
      const { login, joined } = await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4), { takeUpUserId: c.id });
      const c2 = await db.user.findUniqueOrThrow({ where: { id: c.id } });
      harness.assert(c2.loginId === login.id && c2.inviteToken === null && c2.inviteTokenExpires === null, "The invite's account is taken up and its invite cleared");
      harness.assert(joined.some((j) => j.userId === c.id), "It is in the joined list");
      harness.assertEqual(c2.isQuickCreated, false, "It no longer counts as quick-created");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-JOIN-04: hasSetUp is a password or a login", async () => {
    harness.assertEqual(hasSetUp({ passwordHash: null, loginId: null }), false, "Neither");
    harness.assertEqual(hasSetUp({ passwordHash: null }), false, "No loginId field at all");
    harness.assertEqual(hasSetUp({ passwordHash: "x", loginId: null }), true, "A password");
    harness.assertEqual(hasSetUp({ passwordHash: null, loginId: "l1" }), true, "A login");
  });

  await harness.test("T41-JOIN-05: a second login for the same email is refused, and findLogin ignores case", async () => {
    const email = emailFor("join5");
    try {
      const { login } = await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
      createdEmails.add(email);
      let refused = false;
      try {
        await createLoginFromProof(email.toUpperCase(), null);
      } catch {
        refused = true;
      }
      harness.assert(refused, "The second one is refused");
      harness.assertEqual((await findLogin(email.toUpperCase()))?.id, login.id, "findLogin finds it whatever the case");
      harness.assertEqual(await findLogin(emailFor("nobody")), null, "No login for another email");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-JOIN-06: sendJoinedEmail sends one email naming the studios, and nothing for an empty list", async () => {
    const email = emailFor("join6");
    await withInbox(async (inbox) => {
      await sendJoinedEmail(email, []);
      harness.assertEqual(inbox.length, 0, "Nothing joined, nothing sent");
      const joined: JoinedAccount[] = [
        { userId: "u1", tenantId: lumina.id, tenantName: "Lumina CineWorks", role: "CLIENT" },
        { userId: "u2", tenantId: apex.id, tenantName: "Apex Media", role: "PHOTOGRAPHER" },
      ];
      await sendJoinedEmail(email, joined);
      harness.assertEqual(inbox.length, 1, "One email");
      const mail = inbox[0]!;
      harness.assertEqual(mail.to, email, "To the person");
      harness.assertEqual(mail.subject, "One sign-in for all your CineFlow studios", "The subject");
      harness.assert(/Lumina CineWorks/.test(mail.text) && /Apex Media/.test(mail.text), "It names each studio");
      harness.assert(/Your old passwords for these studios no longer work\./.test(mail.text), "It says the old passwords no longer work");
    });
  });

  // ── Task 2: a session that holds the person ─────────────────────────────────────────────
  /** A login with a team account at lumina-cine and a client account at apex-media, both joined. */
  const makeLoginWithTwoAccounts = async (label: string) => {
    const email = emailFor(label);
    const team = await makeUser(lumina.id, email, "PHOTOGRAPHER", { password: "old-pass-1" });
    const client = await makeUser(apex.id, email, "CLIENT", { password: "old-pass-2" });
    const { login } = await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
    return { email, team, client, login };
  };

  await harness.test("T41-SESSION-01: the account follows the studio being visited", async () => {
    try {
      const { team, client, login } = await makeLoginWithTwoAccounts("s1");
      await withLoginSession(login.id, team.id, async () => {
        const atApex = await withStudio("apex-media", getCurrentUser);
        harness.assert(atApex?.id === client.id && atApex.role === "CLIENT" && atApex.tenantSlug === "apex-media", "At apex: the client account");
        const atLumina = await withStudio("lumina-cine", getCurrentUser);
        harness.assert(atLumina?.id === team.id && atLumina.role === "PHOTOGRAPHER" && atLumina.tenantSlug === "lumina-cine", "At lumina: the team account");
        harness.assertEqual(await withStudio("some-other-studio", getCurrentUser), null, "A studio with no account for the person: nobody");
        harness.assertEqual((await getCurrentUser())?.id, team.id, "No studio known (platform): the active account");
        harness.assertEqual(atApex?.loginId, login.id, "The account carries its login");
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SESSION-02: two studios in two tabs don't push each other out", async () => {
    try {
      const { team, client, login } = await makeLoginWithTwoAccounts("s2");
      await withLoginSession(login.id, team.id, async () => {
        for (let i = 0; i < 3; i++) {
          harness.assertEqual((await withStudio("lumina-cine", getCurrentUser))?.id, team.id, `Round ${i + 1}: lumina is still the team account`);
          harness.assertEqual((await withStudio("apex-media", getCurrentUser))?.id, client.id, `Round ${i + 1}: apex is still the client account`);
        }
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SESSION-03: the middleware lets each account into /admin of its own studio only, and reports the studio", async () => {
    try {
      const { team, login } = await makeLoginWithTwoAccounts("s3");
      const accounts = await liveAccounts(login.id);
      const active = accounts.find((a) => a.userId === team.id)!;
      const token = await createSessionToken(active.user, accounts.map(({ tenantSlug, userId, role }) => ({ tenantSlug, userId, role })));
      const mw = (path: string, extra: Record<string, string> = {}) =>
        middleware(new NextRequest(`http://localhost:3000${path}`, { headers: { host: "localhost:3000", cookie: `${COOKIE_NAME}=${token}`, ...extra } }));
      const own = await mw("/lumina-cine/admin");
      harness.assert(!own.headers.get("location"), "The team account gets into its own studio's admin", own.headers.get("location") ?? "");
      const asClient = await mw("/apex-media/admin");
      harness.assert((asClient.headers.get("location") ?? "").endsWith("/apex-media/account"), "At the studio where it is a client: sent to the account page", asClient.headers.get("location") ?? "");
      const elsewhere = await mw("/third-studio/admin");
      harness.assert((elsewhere.headers.get("location") ?? "").includes("/third-studio/login"), "A studio with no account: sent to its sign-in", elsewhere.headers.get("location") ?? "");
      const page = await mw("/lumina-cine/book");
      harness.assertEqual(page.headers.get("x-middleware-request-x-cineflow-studio"), "lumina-cine", "A studio page tells the server which studio it is");
      const spoof = await mw("/create-studio", { "x-cineflow-studio": "lumina-cine" });
      harness.assert(!(spoof.headers.get("x-middleware-override-headers") ?? "").split(",").includes("x-cineflow-studio"), "A made-up header on a platform page is dropped");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SESSION-04: a removed account or a cancelled studio ends access there, nowhere else", async () => {
    try {
      const { team, client, login } = await makeLoginWithTwoAccounts("s4");
      await withLoginSession(login.id, team.id, async () => {
        await db.user.update({ where: { id: team.id }, data: { deactivatedAt: new Date() } });
        harness.assertEqual(await withStudio("lumina-cine", getCurrentUser), null, "Removed at lumina: nobody there");
        harness.assertEqual((await withStudio("apex-media", getCurrentUser))?.id, client.id, "Apex still works");
        await db.user.update({ where: { id: team.id }, data: { deactivatedAt: null } });
        await db.tenant.update({ where: { id: apex.id }, data: { subscriptionStatus: "CANCELLED" } });
        try {
          harness.assertEqual(await withStudio("apex-media", getCurrentUser), null, "A cancelled studio: nobody there");
          harness.assertEqual((await withStudio("lumina-cine", getCurrentUser))?.id, team.id, "Lumina still works");
        } finally {
          await db.tenant.update({ where: { id: apex.id }, data: { subscriptionStatus: apex.subscriptionStatus } });
        }
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SESSION-05: signing the login out everywhere ends the session", async () => {
    try {
      const { team, login } = await makeLoginWithTwoAccounts("s5");
      await withLoginSession(login.id, team.id, async () => {
        harness.assert((await getCurrentLogin()) !== null, "Signed in before");
        await db.login.update({ where: { id: login.id }, data: { sessionsValidAfter: new Date(Date.now() + 1000) } });
        harness.assertEqual(await withStudio("lumina-cine", getCurrentUser), null, "No account after sign-out-everywhere");
        harness.assertEqual(await getCurrentLogin(), null, "No login either");
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SESSION-06: getCurrentLogin lists the person's live accounts; old one-account tokens still work", async () => {
    try {
      const { team, client, login } = await makeLoginWithTwoAccounts("s6");
      await withLoginSession(login.id, team.id, async () => {
        const me = await getCurrentLogin();
        harness.assertEqual(me?.loginId, login.id, "The login");
        harness.assertEqual(me?.email, login.email, "Its email");
        harness.assertEqual(me?.accounts.map((a) => a.userId).sort().join(), [team.id, client.id].sort().join(), "Both accounts");
      });
      const owner = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
      const old = { id: owner.id, email: owner.email, name: owner.name, role: owner.role, tenantId: owner.tenantId, tenantSlug: "lumina-cine" };
      harness.assertEqual((await withSession(old, () => withStudio("lumina-cine", getCurrentUser)))?.id, owner.id, "A token without a login works as before");
      harness.assertEqual(await withSession(old, getCurrentLogin), null, "…and is not a login session");
    } finally {
      await cleanUp();
    }
  });
}
