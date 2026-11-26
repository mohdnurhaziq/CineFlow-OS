/**
 * Tier 52: the super-admin approves or rejects invite requests
 * (docs/superpowers/specs/2026-11-27-invite-approval-design.md)
 * - Approve emails a personal link: single use, only that email, 14 days; resend, copy and cancel
 * - Reject, with or without a polite email
 * - The link opens sign-up while it is closed to everyone else
 * - An emailed link confirms the email, unless another account already uses it; a copied one never does
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { db } from "@/lib/db";
import { approveInviteRequest, cancelInvite, createInviteLink, listInviteRequests, rejectInviteRequest } from "@/lib/actions/invite-requests";
import { checkInvite, onboardStudio, studioSignupStatus } from "@/lib/actions/onboarding";
import { InviteRequestsPanel } from "@/components/super-admin/invite-requests-panel";
import { withIp, withRequest, withSession } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
type Mail = { to: string[]; subject: string; html: string; text?: string };
type Result = { success: boolean; message?: string; emailed?: boolean; link?: string; error?: string; field?: string };

export async function runTier52InviteApprovalTests(harness: TestHarness) {
  harness.setSuite("Tier 52", "Approving invite requests");
  await provideReactGlobal();

  const run = Date.now().toString(36);
  const emails: string[] = [];
  const slugs: string[] = [];
  harness.registerTeardown(async () => {
    await db.inviteRequest.deleteMany({ where: { email: { in: emails } } });
    await db.tenant.deleteMany({ where: { slug: { in: slugs } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.login.deleteMany({ where: { email: { in: emails } } });
  });

  const admin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const owner = await db.user.findFirstOrThrow({ where: { role: "STUDIO_OWNER", tenant: { slug: "lumina-cine" } }, include: { tenant: true } });
  const session = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }, slug: string | null) =>
    ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug }) as never;
  const asAdmin = <T>(fn: () => Promise<T>) => withSession(session(admin, null), fn);
  const asOwner = <T>(fn: () => Promise<T>) => withSession(session(owner, "lumina-cine"), fn);

  let n = 0;
  const request = async (over: Record<string, unknown> = {}) => {
    n += 1;
    const email = `t52-${n}-${run}@example.test`;
    emails.push(email);
    return db.inviteRequest.create({ data: { name: "Aina Rahman", studioName: `T52 Films ${n}`, email, phone: "+60123456789", kind: "VIDEO", ...over } });
  };

  /** Runs `fn` with Resend stubbed, returning what was sent. */
  const withMail = async <T>(fn: () => Promise<T>, opts: { fails?: boolean } = {}) => {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    const savedSmtp = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    process.env.RESEND_API_KEY = "re_test_key";
    const sent: Mail[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("api.resend.com")) {
        if (opts.fails) throw new Error("mail service down");
        sent.push(JSON.parse(String(init?.body ?? "{}")) as Mail);
      }
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }) as typeof fetch;
    try {
      return { result: await fn(), sent };
    } finally {
      globalThis.fetch = realFetch;
      if (savedSmtp !== undefined) process.env.SMTP_HOST = savedSmtp;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
    }
  };

  /** The live site with no shared code: sign-up closed to everyone but the invited. */
  const onClosedLiveSite = async <T>(fn: () => Promise<T>) => {
    const env = process.env as Record<string, string | undefined>;
    const saved = { app: env.APP_ENV, code: env.STUDIO_SIGNUP_CODE };
    env.APP_ENV = "production";
    delete env.STUDIO_SIGNUP_CODE;
    try {
      return await fn();
    } finally {
      if (saved.app === undefined) delete env.APP_ENV;
      else env.APP_ENV = saved.app;
      if (saved.code !== undefined) env.STUDIO_SIGNUP_CODE = saved.code;
    }
  };

  const tokenIn = (text: string) => /create-studio\?invite=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
  /** Approves a request and returns the token from the email. */
  const approveByEmail = async (id: string) => {
    const { result, sent } = await withMail(() => asAdmin(() => approveInviteRequest({ id })) as Promise<Result>);
    return { result, sent, token: tokenIn(sent.map((m) => m.html).join(" ")) };
  };
  const signUp = (slug: string, email: string, token: string | undefined, over: Record<string, unknown> = {}) => {
    slugs.push(slug);
    return withRequest(() =>
      onboardStudio({ name: "T52 Studio", slug, discipline: "VIDEOGRAPHY", currency: "MYR", ownerName: "Aina Rahman", ownerEmail: email, password: "password123", inviteToken: token, ...over } as never)
    ) as Promise<Result>;
  };
  const valid = async (token: string) => ((await checkInvite(token)) as { valid: boolean }).valid;

  await harness.test("T52-GUARD-01: only a super-admin approves, rejects, cancels or copies a link", async () => {
    const row = await request();
    const attempts = [
      () => approveInviteRequest({ id: row.id }),
      () => rejectInviteRequest({ id: row.id, notify: true }),
      () => cancelInvite({ id: row.id }),
      () => createInviteLink({ id: row.id }),
    ];
    for (const attempt of attempts) {
      for (const who of [asOwner, <T>(fn: () => Promise<T>) => withSession(null, fn)]) {
        const { result, sent } = await withMail(() => who(attempt as () => Promise<unknown>) as Promise<Result>);
        harness.assert(result.success === false && !result.link && sent.length === 0, "Refused, nothing sent, no link", JSON.stringify(result));
      }
    }
    const after = await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } });
    harness.assert(after.status === "PENDING" && !after.inviteTokenHash, "Untouched");
  });

  await harness.test("T52-APPROVE-01: approving emails a personal link, and keeps only a hash of it", async () => {
    const row = await request();
    const { result, sent, token } = await approveByEmail(row.id);
    harness.assert(result.success === true && result.emailed === true && !result.link, "Emailed; the console isn't handed the link", JSON.stringify(result));
    harness.assertEqual(sent.length, 1, "One email");
    harness.assertDeepEqual(sent[0]?.to, [row.email], "To the person who asked");
    harness.assert(/approved/i.test(sent[0]?.subject ?? ""), "Says approved", sent[0]?.subject);
    harness.assert(token.length >= 32, "A long, unguessable link", token);
    harness.assert(/works once/i.test(sent[0]?.html ?? "") && /forward/i.test(sent[0]?.html ?? ""), "Says it works once and not to forward it");
    const after = await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } });
    harness.assert(after.status === "APPROVED" && after.invitedByEmail && Boolean(after.decidedAt), "Approved, by email");
    harness.assert(Boolean(after.inviteTokenHash) && after.inviteTokenHash !== token, "The database holds a hash, not the link");
    const days = (after.inviteExpiresAt!.getTime() - Date.now()) / 86_400_000;
    harness.assert(days > 13.9 && days <= 14, "14 days", String(days));
    const listed = ((await asAdmin(() => listInviteRequests())) as unknown as Record<string, unknown>[]).find((r) => r.id === row.id)!;
    harness.assertEqual(listed.status, "APPROVED", "The console sees it approved");
    const text = JSON.stringify(listed);
    harness.assert(!text.includes(token) && !text.includes(after.inviteTokenHash!) && !("inviteTokenHash" in listed), "…and never gets the link or its hash", text);
  });

  await harness.test("T52-APPROVE-02: if the email can't be sent, the super-admin is told and given the link", async () => {
    const row = await request();
    const { result } = await withMail(() => asAdmin(() => approveInviteRequest({ id: row.id })) as Promise<Result>, { fails: true });
    harness.assert(result.success === true && result.emailed === false && tokenIn(result.link ?? "") !== "", "Approved, not emailed, link to send by hand", JSON.stringify(result));
    harness.assertEqual((await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } })).invitedByEmail, false, "A link sent by hand proves nothing about the inbox");
    harness.assertEqual(await valid(tokenIn(result.link ?? "")), true, "The link works");
  });

  await harness.test("T52-APPROVE-03: resending or copying replaces the link; cancelling ends it", async () => {
    const row = await request();
    const first = await approveByEmail(row.id);
    const second = await approveByEmail(row.id);
    harness.assertEqual(await valid(first.token), false, "Resend: the old link stops");
    harness.assertEqual(await valid(second.token), true, "…the new one works");
    const copied = (await asAdmin(() => createInviteLink({ id: row.id }))) as Result;
    harness.assert(copied.success === true && tokenIn(copied.link ?? "") !== "", "A link to copy", JSON.stringify(copied));
    harness.assertEqual(await valid(second.token), false, "Copy: the emailed one stops");
    harness.assertEqual((await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } })).invitedByEmail, false, "And it no longer counts as emailed");
    const cancelled = (await asAdmin(() => cancelInvite({ id: row.id }))) as Result;
    harness.assert(cancelled.success === true, "Cancelled", JSON.stringify(cancelled));
    harness.assertEqual(await valid(tokenIn(copied.link ?? "")), false, "No link works");
    harness.assertEqual((await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } })).status, "PENDING", "Back to pending");
    const pendingCopy = (await asAdmin(() => createInviteLink({ id: row.id }))) as Result;
    harness.assert(pendingCopy.success === false && !pendingCopy.link, "No link for someone not approved");
  });

  await harness.test("T52-REJECT-01: rejecting ends any invite, and emails a polite note only when asked", async () => {
    const quiet = await request();
    const q = await withMail(() => asAdmin(() => rejectInviteRequest({ id: quiet.id, notify: false })) as Promise<Result>);
    harness.assert(q.result.success === true && q.sent.length === 0, "Rejected quietly", JSON.stringify(q.result));
    harness.assertEqual((await db.inviteRequest.findUniqueOrThrow({ where: { id: quiet.id } })).status, "REJECTED", "Rejected");
    const told = await request();
    const approved = await approveByEmail(told.id);
    const t = await withMail(() => asAdmin(() => rejectInviteRequest({ id: told.id, notify: true })) as Promise<Result>);
    harness.assert(t.result.success === true && t.result.emailed === true && t.sent.length === 1, "Told by email", JSON.stringify(t.result));
    harness.assertDeepEqual(t.sent[0]?.to, [told.email], "The right person");
    harness.assert(!tokenIn(t.sent[0]?.html ?? ""), "No link in a rejection");
    harness.assertEqual(await valid(approved.token), false, "The invite they had stops working");
    const failed = await request();
    const f = await withMail(() => asAdmin(() => rejectInviteRequest({ id: failed.id, notify: true })) as Promise<Result>, { fails: true });
    harness.assert(f.result.success === true && f.result.emailed === false, "Still rejected, and says the note didn't go", JSON.stringify(f.result));
    const again = await approveByEmail(quiet.id);
    harness.assert(again.result.success === true && (await valid(again.token)), "A rejected request can be approved later");
  });

  await harness.test("T52-GATE-01: on the closed live site, only a good invite opens sign-up, once, for its own email", async () => {
    const row = await request();
    const { token } = await approveByEmail(row.id);
    await onClosedLiveSite(async () => {
      harness.assertDeepEqual(await studioSignupStatus(), { open: false, needsCode: false }, "Closed to everyone");
      const nobody = await signUp(`t52-none-${run}`, row.email, undefined);
      harness.assert(nobody.success === false, "No invite: refused", JSON.stringify(nobody));
      const junk = await signUp(`t52-junk-${run}`, row.email, "x".repeat(43));
      harness.assert(junk.success === false && /invite/i.test(junk.error ?? ""), "A made-up link: refused", JSON.stringify(junk));
      const other = await signUp(`t52-other-${run}`, `someone-else-${run}@example.test`, token);
      harness.assert(other.success === false && other.field === "ownerEmail" && (other.error ?? "").includes(row.email), "Another email: refused, naming the invited one", JSON.stringify(other));
      const info = (await checkInvite(token)) as Record<string, unknown>;
      harness.assertDeepEqual(info, { valid: true, email: row.email, name: "Aina Rahman", studioName: row.studioName, kind: "VIDEO" }, "The form can be filled in from the request");
      const made = await signUp(`t52-made-${run}`, row.email.toUpperCase(), token);
      harness.assert(made.success === true, "The invited person gets their studio, no code needed", JSON.stringify(made));
      const after = await db.inviteRequest.findUniqueOrThrow({ where: { id: row.id } });
      harness.assert(Boolean(after.joinedAt) && after.joinedTenantSlug === `t52-made-${run}`, "Marked joined, with the studio");
      const twice = await signUp(`t52-twice-${run}`, row.email, token);
      harness.assert(twice.success === false, "The link works once", JSON.stringify(twice));
      harness.assertEqual(await valid(token), false, "…and says it no longer works");
    });
    const listed = ((await asAdmin(() => listInviteRequests())) as unknown as Record<string, unknown>[]).find((r) => r.id === row.id)!;
    harness.assertEqual(listed.status, "JOINED", "The console shows Joined");
    for (const attempt of [() => approveInviteRequest({ id: row.id }), () => rejectInviteRequest({ id: row.id, notify: false }), () => cancelInvite({ id: row.id })]) {
      const res = (await asAdmin(attempt as () => Promise<unknown>)) as Result;
      harness.assert(res.success === false, "Nothing more to decide once they've joined", JSON.stringify(res));
    }
  });

  await harness.test("T52-GATE-02: an expired invite is refused and shows as expired", async () => {
    const row = await request();
    const { token } = await approveByEmail(row.id);
    await db.inviteRequest.update({ where: { id: row.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    await onClosedLiveSite(async () => {
      const res = await signUp(`t52-late-${run}`, row.email, token);
      harness.assert(res.success === false && /invite/i.test(res.error ?? ""), "Refused", JSON.stringify(res));
      harness.assertEqual(await valid(token), false, "Not usable");
    });
    const listed = ((await asAdmin(() => listInviteRequests())) as unknown as Record<string, unknown>[]).find((r) => r.id === row.id)!;
    harness.assertEqual(listed.status, "EXPIRED", "Expired");
  });

  await harness.test("T52-GATE-03: two sign-ups racing on one invite make one studio", async () => {
    const row = await request();
    const { token } = await approveByEmail(row.id);
    const results = await onClosedLiveSite(() => Promise.all([signUp(`t52-race-a-${run}`, row.email, token), signUp(`t52-race-b-${run}`, row.email, token)]));
    harness.assertEqual(results.filter((r) => r.success).length, 1, "Exactly one succeeds");
    harness.assertEqual(await db.tenant.count({ where: { slug: { in: [`t52-race-a-${run}`, `t52-race-b-${run}`] } } }), 1, "One studio");
  });

  await harness.test("T52-PROOF-01: using the emailed link confirms a new email: one sign-in, and no confirm email", async () => {
    const row = await request();
    const { token } = await approveByEmail(row.id);
    const slug = `t52-proof-${run}`;
    const { result, sent } = await withMail(() => onClosedLiveSite(() => signUp(slug, row.email, token)));
    harness.assert(result.success === true, "Made", JSON.stringify(result));
    const made = await db.user.findFirstOrThrow({ where: { tenant: { slug }, role: "STUDIO_OWNER" } });
    const login = await db.login.findUnique({ where: { email: row.email } });
    harness.assert(Boolean(login) && made.loginId === login!.id && made.passwordHash === null, "On one sign-in");
    harness.assert(Boolean(login?.passwordHash) && bcrypt.compareSync("password123", login!.passwordHash!), "…with the password they chose");
    const welcome = sent.find((m) => /is ready/.test(m.subject));
    harness.assert(Boolean(welcome) && !welcome!.html.includes("reset-password"), "Welcomed, not asked to confirm");
  });

  await harness.test("T52-PROOF-02: a link copied and sent by hand confirms nothing", async () => {
    const row = await request();
    await approveByEmail(row.id);
    const copied = (await asAdmin(() => createInviteLink({ id: row.id }))) as Result;
    const slug = `t52-copied-${run}`;
    const { result, sent } = await withMail(() => onClosedLiveSite(() => signUp(slug, row.email, tokenIn(copied.link ?? ""))));
    harness.assert(result.success === true, "Made", JSON.stringify(result));
    harness.assertEqual(await db.login.count({ where: { email: row.email } }), 0, "No one sign-in yet");
    harness.assert(Boolean(sent.find((m) => /is ready/.test(m.subject))?.html.includes("reset-password")), "Asked to confirm the usual way");
  });

  await harness.test("T52-PROOF-03: an invite never takes over another account on the same email", async () => {
    const row = await request();
    const elsewhere = `t52-elsewhere-${run}`;
    slugs.push(elsewhere);
    const tenant = await db.tenant.create({ data: { name: "T52 Elsewhere", slug: elsewhere, discipline: "HYBRID" } });
    const theirs = await db.user.create({ data: { tenantId: tenant.id, name: "Aina", email: row.email, role: "CLIENT", passwordHash: await bcrypt.hash("their-own-pass", 10) } });
    const { token } = await approveByEmail(row.id);
    const slug = `t52-guard-${run}`;
    const { result, sent } = await withMail(() => onClosedLiveSite(() => signUp(slug, row.email, token)));
    harness.assert(result.success === true, "The studio is made", JSON.stringify(result));
    const untouched = await db.user.findUniqueOrThrow({ where: { id: theirs.id } });
    harness.assert(untouched.loginId === null && untouched.passwordHash === theirs.passwordHash, "The other account keeps its own password");
    harness.assertEqual(await db.login.count({ where: { email: row.email } }), 0, "No one sign-in was made");
    harness.assert(Boolean(sent.find((m) => /is ready/.test(m.subject))?.html.includes("reset-password")), "They confirm the usual way");
  });

  await harness.test("T52-LIMIT-01: invite links can't be tried over and over", async () => {
    await withIp("198.51.100.220", async () => {
      let last = { valid: true, message: "" };
      for (let i = 0; i < 31; i++) last = (await checkInvite(`guess-${i}-${"x".repeat(40)}`)) as typeof last;
      harness.assert(last.valid === false && /too many/i.test(last.message), "The 31st in an hour is told to wait", JSON.stringify(last));
    });
  });

  await harness.test("T52-UI-01: the console offers what fits each request's state", async () => {
    const base = { name: "Aina", studioName: "S", email: "a@example.test", phone: null, kind: "PHOTO", message: null, createdAt: new Date().toISOString(), handledAt: null, inviteExpiresAt: null, joinedTenantSlug: null };
    const card = (over: Record<string, unknown>) => renderToStaticMarkup(createElement(InviteRequestsPanel, { invites: [{ id: "i1", ...base, ...over }] as never }));
    const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+)<\/button>/g)].map((m) => m[1]!.trim()).join(", ");
    const pending = card({ status: "PENDING" });
    harness.assertEqual(buttons(pending), "Reject, Approve", "Pending");
    harness.assert(pending.includes("1 waiting"), "Counted as waiting");
    const approved = card({ status: "APPROVED", inviteExpiresAt: "2026-12-11T04:00:00.000Z" });
    harness.assertEqual(buttons(approved), "Resend email, Copy link, Cancel invite", "Approved");
    harness.assert(approved.includes("Approved") && approved.includes("11 Dec 2026"), "Says until when");
    harness.assertEqual(buttons(card({ status: "EXPIRED", inviteExpiresAt: "2026-11-01T04:00:00.000Z" })), "Reject, Approve again", "Expired");
    harness.assertEqual(buttons(card({ status: "REJECTED" })), "Approve", "Rejected");
    const joined = card({ status: "JOINED", joinedTenantSlug: "maya-films" });
    harness.assertEqual(buttons(joined), "", "Joined: nothing to decide");
    harness.assert(joined.includes("Joined") && joined.includes("maya-films"), "Shows their studio");
    harness.assert(card({ status: "PENDING", handledAt: new Date().toISOString() }).includes("Marked handled earlier"), "An old note is kept");
    const source = read("components/super-admin/invite-requests-panel.tsx");
    harness.assert(/Email them a short note/.test(source) && /useState\(true\)/.test(source), "Rejecting asks, with the email ticked");
    harness.assert(!/Mark handled/.test(source), "The old toggle is gone");
  });

  await harness.test("T52-UI-02: the sign-up page opens from an invite, with the invited email fixed", async () => {
    const wizard = read("app/(saas)/create-studio/page.tsx");
    harness.assert(/params\.get\("invite"\)/.test(wizard) && /checkInvite\(/.test(wizard), "Reads and checks the link");
    harness.assert(/readOnly=\{googleSignedIn \|\| invite !== null\}/.test(wizard), "The email can't be changed");
    harness.assert(wizard.includes("This invite link doesn&apos;t work any more"), "A dead link says so");
    harness.assert(wizard.includes("inviteMessage?.startsWith(\"Too many\") ? inviteMessage :"), "…once: only a different reason (too many tries) is added in the server's words");
    harness.assert(/window\.history\.replaceState[\s\S]{0,200}window\.location\.pathname/.test(wizard), "The link doesn't stay in the address bar");
  });

  await harness.test("T52-DOC-01: the go-live checklist says how to let studios in", async () => {
    const doc = read("docs/08_GO_LIVE_CHECKLIST.md");
    harness.assert(/Approve/.test(doc) && /invite request/i.test(doc), "Mentions approving requests");
  });
}
