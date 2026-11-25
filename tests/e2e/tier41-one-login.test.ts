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
import { readFile } from "node:fs/promises";
import { teamMemberStatus } from "@/lib/team/status";
import { loadTeamMembers } from "@/lib/team/members";
import { clientAccountStatus } from "@/lib/client-directory";
import { ensureStudioRoles } from "@/lib/auth/access";
import { assignTeamMember } from "@/lib/actions/admin-assignments";
import { inviteTeamMember, resendTeamInvite } from "@/lib/actions/admin-team";
import { resetPassword, sendOneLoginLink } from "@/lib/actions/password-reset";
import { issuePasswordReset } from "@/lib/auth/password-reset";
import { issueClientInvite } from "@/lib/auth/invite";
import { registerClient } from "@/lib/actions/client-auth";
import { loginWithCredentials } from "@/lib/auth/session";
import { decodeSessionToken } from "@/lib/auth/token";
import { withRequest } from "./mocks/session";
import { continueAsClient } from "@/lib/actions/one-login";
import { onboardStudio } from "@/lib/actions/onboarding";
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

  // ── Task 3: "set up" means a password or a login ────────────────────────────────────────
  const luminaOwnerRow = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  const luminaOwner = { id: luminaOwnerRow.id, email: luminaOwnerRow.email, name: luminaOwnerRow.name, role: luminaOwnerRow.role, tenantId: luminaOwnerRow.tenantId, tenantSlug: "lumina-cine" };
  const roleIdAtLumina = async () => {
    await ensureStudioRoles(lumina.id);
    return (await db.teamRole.findFirstOrThrow({ where: { tenantId: lumina.id }, orderBy: { sortOrder: "asc" } })).id;
  };
  const bookingIds: string[] = [];
  const makeBooking = async () => {
    const b = await db.clientBooking.create({
      data: {
        tenantId: lumina.id,
        trackingCode: `T41-${STAMP}-${++counter}`,
        clientName: "T41 Client",
        clientEmail: "t41-client@example.test",
        clientPhone: "000",
        discipline: "PHOTOGRAPHY",
        serviceTier: "T41",
        status: "CONFIRMED",
        packageName: "Family Portrait",
        creativeBrief: "Golden hour",
      },
    });
    bookingIds.push(b.id);
    return b;
  };
  harness.registerTeardown(async () => {
    await db.bookingAssignment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await db.clientBooking.deleteMany({ where: { id: { in: bookingIds } } });
  });

  await harness.test("T41-SETUP-01: a joined team member stays Active and assignable, and can't be re-invited", async () => {
    try {
      const email = emailFor("setup1");
      const member = await makeUser(lumina.id, email, "TEAM_MEMBER", { password: "old-pass-1" });
      await db.user.update({ where: { id: member.id }, data: { teamRoleId: await roleIdAtLumina() } });
      await makeUser(apex.id, email, "CLIENT", { password: "old-pass-2" });
      await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
      const row = await db.user.findUniqueOrThrow({ where: { id: member.id } });
      harness.assert(row.passwordHash === null && row.loginId !== null, "Joined: no password of its own, a login");
      harness.assertEqual(teamMemberStatus(row), "ACTIVE", "The status is Active");
      const listed = (await loadTeamMembers(lumina.id)).find((m) => m.id === member.id);
      harness.assertEqual(listed?.status, "ACTIVE", "The Team screen shows Active");
      const booking = await makeBooking();
      const assigned = (await withSession(luminaOwner, () => assignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingIds: [booking.id], userId: member.id }))) as { success: boolean; error?: string };
      harness.assert(assigned.success === true, "They can be assigned to a shoot", JSON.stringify(assigned));
      const resend = (await withSession(luminaOwner, () => resendTeamInvite({ tenantId: lumina.id, tenantSlug: "lumina-cine", userId: member.id }))) as { success: boolean; error?: string };
      harness.assert(resend.success === false && resend.error === "ALREADY_ACTIVE", "Resending an invite is refused: already active", JSON.stringify(resend));
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SETUP-02: a pending invite to an email that has a login still looks like any invite", async () => {
    try {
      const email = emailFor("setup2");
      await makeUser(apex.id, email, "CLIENT", { password: "old-pass-2" });
      await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
      const roleId = await roleIdAtLumina();
      const invited = (await withSession(luminaOwner, () => inviteTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", name: "T41 Invitee", email, roleId }))) as { success: boolean; error?: string };
      harness.assert(invited.success === true, "The studio can invite them", JSON.stringify(invited));
      createdEmails.add(email);
      const account = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, email } });
      harness.assert(account.loginId === null && account.passwordHash === null, "Not linked until the person accepts");
      const listed = (await loadTeamMembers(lumina.id)).find((m) => m.id === account.id);
      harness.assertEqual(listed?.status, "INVITED", "The studio sees Invited, like for anyone");
      const booking = await makeBooking();
      const assigned = (await withSession(luminaOwner, () => assignTeamMember({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingIds: [booking.id], userId: account.id }))) as { success: boolean };
      harness.assertEqual(assigned.success, false, "They can't be assigned yet");
      const resend = (await withSession(luminaOwner, () => resendTeamInvite({ tenantId: lumina.id, tenantSlug: "lumina-cine", userId: account.id }))) as { success: boolean };
      harness.assertEqual(resend.success, true, "The studio can resend the invite");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SETUP-03: a joined client is Registered, and the emails treat them as signed up", async () => {
    harness.assertEqual(clientAccountStatus({ passwordHash: null, inviteToken: null, loginId: "x" }), "REGISTERED", "Joined: Registered");
    harness.assertEqual(clientAccountStatus({ passwordHash: null, inviteToken: "t", loginId: null }), "INVITED", "Pending invite: Invited");
    harness.assertEqual(clientAccountStatus({ passwordHash: null, inviteToken: null }), "GUEST", "Nothing: Guest");
    const confirmation = await readFile("lib/bookings/confirmation-email.ts", "utf8");
    harness.assert(/hasSetUp\(account\)/.test(confirmation) && /loginId: true/.test(confirmation), "The booking email checks 'set up', not just a password");
    const projects = await readFile("lib/actions/admin-projects.ts", "utf8");
    harness.assert(/hasSetUp\(client\)/.test(projects), "The proposal email does too");
    const noPasswordChecks = ["lib/bookings/confirmation-email.ts", "lib/actions/admin-projects.ts", "lib/actions/admin-team.ts", "lib/client-directory.ts", "lib/team/status.ts"];
    for (const f of noPasswordChecks) {
      harness.assert(!/(?:if \(|\? |&& |! ?)(?:member|account|client|user)\.passwordHash\b/.test(await readFile(f, "utf8")), `${f} no longer reads a bare passwordHash as 'set up'`);
    }
  });

  // ── Task 4: proof links create or update the login ──────────────────────────────────────
  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
  const loginRow = (email: string) => db.login.findUnique({ where: { email: email.toLowerCase() } });

  await harness.test("T41-PROOF-01: a reset link on a stand-alone account creates the login and joins the rest", async () => {
    try {
      const email = emailFor("proof1");
      const client = await makeUser(lumina.id, email, "CLIENT", { password: "old-pass-1" });
      const other = await makeUser(apex.id, email, "TEAM_MEMBER", { password: "old-pass-2" });
      await withInbox(async (inbox) => {
        const token = await issuePasswordReset(client.id);
        const res = await resetPassword({ tenantSlug: "lumina-cine", email, token, password: "new-pass-123" });
        harness.assert(res.success === true, "The reset works", JSON.stringify(res));
        const login = await loginRow(email);
        harness.assert(login !== null && bcrypt.compareSync("new-pass-123", login.passwordHash ?? ""), "A login exists with the new password");
        const [c2, o2] = await Promise.all([client, other].map((u) => db.user.findUniqueOrThrow({ where: { id: u.id } })));
        harness.assert(c2!.loginId === login!.id && c2!.passwordHash === null, "The account whose link was used is joined");
        harness.assert(o2!.loginId === login!.id && o2!.passwordHash === null, "The person's account at the other studio is joined too");
        harness.assert(c2!.passwordResetToken === null, "The link is used up");
        harness.assertEqual(inbox.length, 1, "One email about the joined studios");
        harness.assert(inbox[0]!.to === email && /Apex Media|apex/i.test(inbox[0]!.text), "…to the person, naming the other studio", inbox[0]?.text.slice(0, 200) ?? "");
        const signedIn = await withRequest(() => loginWithCredentials(email, "new-pass-123", "lumina-cine"));
        harness.assert(signedIn.success === true, "They can sign in with the new password", JSON.stringify(signedIn));
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-02: a reset on a linked account changes the login's password and ends its sessions", async () => {
    try {
      const { team, login, email } = await makeLoginWithTwoAccounts("proof2");
      const token = await issuePasswordReset(team.id);
      harness.assertEqual((await loginRow(email))?.sessionsValidAfter, null, "No sign-out yet");
      const res = await resetPassword({ tenantSlug: "lumina-cine", email, token, password: "other-pass-123" });
      harness.assert(res.success === true, "The reset works", JSON.stringify(res));
      const after = await loginRow(email);
      harness.assert(bcrypt.compareSync("other-pass-123", after!.passwordHash ?? ""), "The login has the new password");
      harness.assert(after!.sessionsValidAfter !== null, "Its sessions everywhere are ended");
      harness.assertEqual((await db.user.findUniqueOrThrow({ where: { id: team.id } })).passwordHash, null, "The account still has no password of its own");
      harness.assertEqual(login.id, after!.id, "Still the same login");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-03: the attacker's password never reaches the login", async () => {
    try {
      const email = emailFor("proof3");
      const victim = await makeUser(lumina.id, email, "CLIENT", { password: "victim-old-1" });
      const reg = await registerClient({ tenantSlug: "apex-media", name: "Attacker", email, phone: "0123456789", password: "attacker-pass1" });
      harness.assert(reg.success === true, "Anyone can register with an email at a studio, as today", JSON.stringify(reg));
      const token = await issuePasswordReset(victim.id);
      const res = await resetPassword({ tenantSlug: "lumina-cine", email, token, password: "victim-pass-1" });
      harness.assert(res.success === true, "The real owner proves the email", JSON.stringify(res));
      const login = await loginRow(email);
      harness.assert(bcrypt.compareSync("victim-pass-1", login!.passwordHash ?? "") && !bcrypt.compareSync("attacker-pass1", login!.passwordHash ?? ""), "The login has the owner's password");
      const attackerAccount = await db.user.findFirstOrThrow({ where: { tenantId: apex.id, email } });
      harness.assert(attackerAccount.passwordHash === null && attackerAccount.loginId === login!.id, "The attacker's account lost its own password");
      const attempt = await withRequest(() => loginWithCredentials(email, "attacker-pass1", "apex-media"));
      harness.assertEqual(attempt.success, false, "The attacker's password opens nothing");
      const owner = await withRequest(() => loginWithCredentials(email, "victim-pass-1", "lumina-cine"));
      harness.assertEqual(owner.success, true, "The owner's password works");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-04: a team invite link to someone with a login links the new account", async () => {
    try {
      const { email, login } = await makeLoginWithTwoAccounts("proof4");
      // The person's accounts are at lumina and apex; invite them to a third studio.
      const third = await makeStudio("invite");
      await ensureStudioRoles(third.id);
      const roleId = (await db.teamRole.findFirstOrThrow({ where: { tenantId: third.id } })).id;
      const owner = await makeUser(third.id, emailFor("proof4-owner"), "STUDIO_OWNER", { password: "owner-pass-1" });
      const invited = (await withSession({ id: owner.id, email: owner.email, name: owner.name, role: "STUDIO_OWNER", tenantId: third.id, tenantSlug: third.slug }, () =>
        inviteTeamMember({ tenantId: third.id, tenantSlug: third.slug, name: "T41 Invitee", email, roleId })
      )) as { success: boolean; inviteUrl?: string };
      harness.assert(invited.success === true && !!invited.inviteUrl, "Invited", JSON.stringify(invited));
      const res = await resetPassword({ tenantSlug: third.slug, email, token: tokenOf(invited.inviteUrl!), password: "new-pass-123" });
      harness.assert(res.success === true, "Accepted with the login's current password", JSON.stringify(res));
      const account = await db.user.findFirstOrThrow({ where: { tenantId: third.id, email } });
      harness.assert(account.loginId === login.id && account.passwordHash === null, "The new team account is linked to the login");
      harness.assertEqual(teamMemberStatus(account), "ACTIVE", "…and Active");
      harness.assertEqual((await loginRow(email))?.sessionsValidAfter, null, "The same password ends nobody's session");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-05: a client invite link proves the email and creates the login", async () => {
    try {
      const email = emailFor("proof5");
      const client = await makeUser(lumina.id, email, "CLIENT");
      const invite = await issueClientInvite(client.id);
      const reg = await withRequest(async (jar) => {
        const r = await registerClient({ tenantSlug: "lumina-cine", name: "T41 Client", email, phone: "0123456789", password: "client-pass-1", inviteToken: invite });
        return { r, cookie: jar.get(COOKIE_NAME) };
      });
      harness.assert(reg.r.success === true, "Registered through the invite", JSON.stringify(reg.r));
      const login = await loginRow(email);
      harness.assert(login !== null && bcrypt.compareSync("client-pass-1", login.passwordHash ?? ""), "A login exists with the typed password");
      const account = await db.user.findUniqueOrThrow({ where: { id: client.id } });
      harness.assert(account.loginId === login!.id && account.passwordHash === null && account.inviteToken === null, "The account is joined and the invite used up");
      const decoded = await decodeSessionToken(reg.cookie ?? "");
      harness.assert(decoded?.user.loginId === login!.id && decoded.accounts?.some((a) => a.userId === client.id) === true, "They are signed in as a login session");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-06: sendOneLoginLink emails a confirm link to a stand-alone account, and refuses a linked one", async () => {
    try {
      const email = emailFor("proof6");
      const client = await makeUser(lumina.id, email, "CLIENT", { password: "old-pass-1" });
      const asClient = { id: client.id, email, name: client.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" };
      await withInbox(async (inbox) => {
        const sent = await withSession(asClient, () => sendOneLoginLink());
        harness.assert(sent.success === true, "Sent", JSON.stringify(sent));
        const mail = inbox.find((m) => m.to === email);
        harness.assert(!!mail && /join=1/.test(mail.html) && /reset-password\?/.test(mail.html), "The email links to the reset page with join=1", mail?.html.slice(0, 300) ?? "no mail");
        const row = await db.user.findUniqueOrThrow({ where: { id: client.id } });
        harness.assert(row.passwordResetToken !== null && row.passwordHash !== null, "A token was issued; the account is untouched");
      });
      const { team } = await makeLoginWithTwoAccounts("proof6b");
      const linked = await db.user.findUniqueOrThrow({ where: { id: team.id } });
      const asLinked = { id: linked.id, email: linked.email, name: linked.name, role: linked.role, tenantId: linked.tenantId, tenantSlug: "lumina-cine", loginId: linked.loginId };
      const refused = await withSession(asLinked, () => sendOneLoginLink());
      harness.assertEqual(refused.success, false, "A linked account has nothing to confirm");
      const nobody = await withSession(null, () => sendOneLoginLink());
      harness.assertEqual(nobody.success, false, "Nobody signed in: refused");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-PROOF-07: the reset page words itself for one sign-in, and for someone who already has one", async () => {
    const page = await readFile("app/[tenantSlug]/reset-password/page.tsx", "utf8");
    harness.assert(/joinParam === "1"/.test(page) && /join=\{join\} hasLogin=\{hasLogin\}/.test(page), "The page passes join and hasLogin to the form");
    const form = await readFile("components/auth/reset-password-form.tsx", "utf8");
    harness.assert(/Use one sign-in for all your studios/.test(form), "The form has the one sign-in heading");
    harness.assert(/You already have a CineFlow sign-in\. Enter its password, or choose a new one\./.test(form), "…and the line for someone who already has a login");
  });

  // ── Task 5: signing in, registering and starting a studio with one login ────────────────
  await harness.test("T41-SIGNIN-01: a linked account signs in with the login's password, as a login session", async () => {
    try {
      const { email, team, client } = await makeLoginWithTwoAccounts("in1");
      const out = await withRequest(async (jar) => ({ res: await loginWithCredentials(email, "new-pass-123", "lumina-cine"), cookie: jar.get(COOKIE_NAME) }));
      harness.assert(out.res.success === true && out.res.user?.id === team.id, "Signed in to the studio's account", JSON.stringify(out.res));
      const decoded = await decodeSessionToken(out.cookie ?? "");
      harness.assertEqual(decoded?.accounts?.map((a) => a.userId).sort().join(), [team.id, client.id].sort().join(), "The session covers both studios");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SIGNIN-02: a removed linked account is refused", async () => {
    try {
      const { email, team } = await makeLoginWithTwoAccounts("in2");
      await db.user.update({ where: { id: team.id }, data: { deactivatedAt: new Date() } });
      const res = await withRequest(() => loginWithCredentials(email, "new-pass-123", "lumina-cine"));
      harness.assert(res.success === false && res.error === "ACCOUNT_REMOVED", "Removed", JSON.stringify(res));
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SIGNIN-03: a login without an account here is offered 'Continue as a client'", async () => {
    try {
      const { email } = await makeLoginWithTwoAccounts("in3");
      const third = await makeStudio("signin");
      await withRequest(async (jar) => {
        const wrong = await loginWithCredentials(email, "not-the-password", third.slug);
        harness.assert(wrong.success === false && wrong.error === "INVALID_CREDENTIALS" && !jar.has(COOKIE_NAME), "A wrong password: refused, no session");
        const res = await loginWithCredentials(email, "new-pass-123", third.slug);
        harness.assert(res.success === false && res.error === "NO_ACCOUNT_HERE", "Right password, no account here", JSON.stringify(res));
        harness.assert(jar.has(COOKIE_NAME), "…but a login session starts, so the person can continue");
        const cont = await continueAsClient(third.slug);
        harness.assert(cont.success === true && cont.redirectTo.endsWith("/account"), "Continue as a client works", JSON.stringify(cont));
        const account = await db.user.findFirstOrThrow({ where: { tenantId: third.id, email } });
        harness.assert(account.role === "CLIENT" && account.loginId !== null && account.passwordHash === null, "A linked client account was created");
        const me = await getCurrentLogin();
        harness.assert(me?.accounts.some((a) => a.tenantSlug === third.slug) === true, "The session now lists that studio");
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SIGNIN-04: an old studio password stops working after joining", async () => {
    try {
      const { email } = await makeLoginWithTwoAccounts("in4");
      const old = await withRequest(() => loginWithCredentials(email, "old-pass-1", "lumina-cine"));
      harness.assert(old.success === false && old.error === "INVALID_CREDENTIALS", "The old password fails with the normal message", JSON.stringify(old));
      const fresh = await withRequest(() => loginWithCredentials(email, "new-pass-123", "lumina-cine"));
      harness.assertEqual(fresh.success, true, "The login's password works");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SIGNIN-05: continueAsClient never grants staff access", async () => {
    try {
      const { login, team, email } = await makeLoginWithTwoAccounts("in5");
      const third = await makeStudio("staffonly");
      await makeUser(third.id, email, "TEAM_MEMBER", { inviteToken: "pending-hash" });
      const res = await withLoginSession(login.id, team.id, () => continueAsClient(third.slug));
      harness.assert(res.success === false && /invite you/.test(res.message), "Refused: the studio has to invite them", JSON.stringify(res));
      const account = await db.user.findFirstOrThrow({ where: { tenantId: third.id, email } });
      harness.assert(account.loginId === null && account.role === "TEAM_MEMBER", "The pending invite was not taken up");
      const nobody = await withSession(null, () => continueAsClient(third.slug));
      harness.assertEqual(nobody.success, false, "No session: refused");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-SIGNIN-06: continueAsClient takes up a client account the studio made for the email", async () => {
    try {
      const { login, team, email } = await makeLoginWithTwoAccounts("in6");
      const third = await makeStudio("quickmade");
      const quick = await makeUser(third.id, email, "CLIENT", { inviteToken: "pending-hash" });
      const res = await withLoginSession(login.id, team.id, () => continueAsClient(third.slug));
      harness.assert(res.success === true, "Continued", JSON.stringify(res));
      const account = await db.user.findUniqueOrThrow({ where: { id: quick.id } });
      harness.assert(account.loginId === login.id && account.inviteToken === null, "The studio's client account is now theirs");
      harness.assertEqual(await db.user.count({ where: { tenantId: third.id, email } }), 1, "No duplicate account");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-REG-01: registering at a new studio with a login needs the login's password", async () => {
    try {
      const { email } = await makeLoginWithTwoAccounts("reg1");
      const third = await makeStudio("register");
      const input = { tenantSlug: third.slug, name: "T41 Client", email, phone: "0123456789" };
      const wrong = await registerClient({ ...input, password: "some-other-pass" });
      harness.assert(wrong.success === false && wrong.error === "EMAIL_EXISTS" && wrong.message === "This email already has a CineFlow sign-in. Use its password, or reset it.", "Wrong password: the exact message", JSON.stringify(wrong));
      harness.assertEqual(await db.user.count({ where: { tenantId: third.id, email } }), 0, "…and nothing was created");
      const right = await withRequest(async (jar) => ({ res: await registerClient({ ...input, password: "new-pass-123" }), cookie: jar.get(COOKIE_NAME) }));
      harness.assert(right.res.success === true, "The login's password registers them", JSON.stringify(right.res));
      const account = await db.user.findFirstOrThrow({ where: { tenantId: third.id, email } });
      harness.assert(account.role === "CLIENT" && account.loginId !== null && account.passwordHash === null, "A linked client account");
      harness.assertEqual((await decodeSessionToken(right.cookie ?? ""))?.user.id, account.id, "Signed in to it");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-REG-02: a brand-new client registers straight away, and is invited to use one sign-in", async () => {
    try {
      const email = emailFor("reg2");
      createdEmails.add(email);
      await withInbox(async (inbox) => {
        const res = await registerClient({ tenantSlug: "lumina-cine", name: "T41 New", email, phone: "0123456789", password: "brand-new-1" });
        harness.assert(res.success === true, "Registered", JSON.stringify(res));
        const account = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, email } });
        harness.assert(account.passwordHash !== null && account.loginId === null, "A stand-alone account that works straight away");
        const mail = inbox.find((m) => m.to === email && /one sign-in/i.test(m.subject));
        harness.assert(!!mail && /join=1/.test(mail.html), "One 'use one sign-in' email with the confirm link", inbox.map((m) => m.subject).join(" | "));
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T41-REG-03: studio sign-up with an email that already has a login, or a staff account elsewhere", async () => {
    const saved = process.env.STUDIO_SIGNUP_CODE;
    delete process.env.STUDIO_SIGNUP_CODE;
    const slugs: string[] = [];
    const input = (slug: string, email: string, password: string) => ({ name: `T41 ${slug}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T41 Owner", ownerEmail: email, password });
    try {
      const { email } = await makeLoginWithTwoAccounts("reg3");
      const wrongSlug = `t41-own-w-${STAMP}`;
      const wrong = (await withRequest(() => onboardStudio(input(wrongSlug, email, "not-the-password-1") as never))) as { success?: boolean; error?: string };
      harness.assert(wrong.success !== true && /already has a CineFlow sign-in/.test(wrong.error ?? ""), "A wrong password is refused with the sign-in message", JSON.stringify(wrong));
      harness.assertEqual(await db.tenant.count({ where: { slug: wrongSlug } }), 0, "…and no studio was created");
      const rightSlug = `t41-own-r-${STAMP}`;
      slugs.push(rightSlug);
      const right = (await withRequest(() => onboardStudio(input(rightSlug, email, "new-pass-123") as never))) as { success?: boolean; error?: string };
      harness.assert(right.success === true, "The login's password starts a studio", JSON.stringify(right));
      const owner = await db.user.findFirstOrThrow({ where: { email, role: "STUDIO_OWNER" } });
      harness.assert(owner.loginId !== null && owner.passwordHash === null, "The owner account is joined to the login");

      // A photographer elsewhere with no login can start their own studio.
      const staffEmail = emailFor("reg3b");
      await makeUser(lumina.id, staffEmail, "TEAM_MEMBER", { password: "staff-pass-1" });
      const staffSlug = `t41-own-s-${STAMP}`;
      slugs.push(staffSlug);
      const staff = (await withRequest(() => onboardStudio(input(staffSlug, staffEmail, "staff-pass-2") as never))) as { success?: boolean; error?: string };
      harness.assert(staff.success === true, "A team member elsewhere can sign up their own studio", JSON.stringify(staff));
      // …but not with a platform super-admin's email.
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const superSlug = `t41-own-x-${STAMP}`;
      const blocked = (await withRequest(() => onboardStudio(input(superSlug, superRow.email, "super-pass-123") as never))) as { success?: boolean };
      harness.assert(blocked.success !== true, "A super-admin's email can't be used");
    } finally {
      if (saved === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = saved;
      for (const slug of slugs) {
        const t = await db.tenant.findUnique({ where: { slug } });
        if (!t) continue;
        const owners = await db.user.findMany({ where: { tenantId: t.id }, select: { email: true } });
        owners.forEach((o) => createdEmails.add(o.email.toLowerCase()));
        await db.tenant.delete({ where: { id: t.id } }).catch(() => undefined);
      }
      await cleanUp();
    }
  });

  await harness.test("T41-UI-01: the invite card and the sign-in fallback are wired", async () => {
    const overview = await readFile("app/[tenantSlug]/admin/page.tsx", "utf8");
    harness.assert(/<OneLoginInvite/.test(overview) && /loginId/.test(overview), "The Overview offers one sign-in to stand-alone accounts");
    const account = await readFile("app/[tenantSlug]/account/page.tsx", "utf8");
    harness.assert(/<OneLoginInvite/.test(account) && /loginId/.test(account), "So does the client account page");
    for (const f of ["components/auth/studio-login-form.tsx", "components/auth/client-auth-panel.tsx"]) {
      const src = await readFile(f, "utf8");
      harness.assert(/NO_ACCOUNT_HERE/.test(src) && /continueAsClient/.test(src), `${f} offers "Continue as a client"`);
    }
    harness.assert(/sendOneLoginLink/.test(await readFile("components/auth/one-login-invite.tsx", "utf8")), "The card sends the confirm link");
  });
}
