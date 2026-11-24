/**
 * Tier 39: the platform landing page (docs/superpowers/specs/2026-11-24-landing-page-redesign-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, cheapestPlanWith, type PlanFeature } from "@/lib/billing/plans";
import { landingMode, type LandingMode } from "@/lib/landing/mode";
import { publicContactEmail } from "@/lib/landing/contact";
import { BANNED_PHRASES, CHAPTERS, EXTRAS, faqItems, planBadge } from "@/lib/landing/content";
import nodemailer, { type Transporter } from "nodemailer";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { db } from "@/lib/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { provideReactGlobal } from "./react-tree";
import { getAllTenantsSummary, getPlatformMetrics } from "@/lib/actions/super-admin";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";
import { withIp, withSession } from "./mocks/session";
import { listInviteRequests, requestInvite, setInviteRequestHandled } from "@/lib/actions/invite-requests";

const MODES: LandingMode[] = ["TRIAL", "INVITE_WITH_CODE", "INVITE_ONLY"];
const EMAIL = "hello@cineflow-os.my";

export async function runTier39LandingPageTests(harness: TestHarness) {
  harness.setSuite("Tier 39", "Landing page");

  await harness.test("T39-MODE-01: the main action follows sign-up status", async () => {
    harness.assertEqual(landingMode({ open: true, needsCode: false }), "TRIAL", "Open");
    harness.assertEqual(landingMode({ open: true, needsCode: true }), "INVITE_WITH_CODE", "Needs a code");
    harness.assertEqual(landingMode({ open: false, needsCode: false }), "INVITE_ONLY", "Closed");
  });

  await harness.test("T39-CONTACT-01: the public contact email comes from one setting", async () => {
    harness.assertEqual(publicContactEmail({}), EMAIL, "Default");
    harness.assertEqual(publicContactEmail({ PLATFORM_CONTACT_EMAIL: " team@x.my " }), "team@x.my", "Override, trimmed");
  });

  await harness.test("T39-CONTENT-01: six chapters in order, with badges taken from the plans", async () => {
    harness.assertEqual(CHAPTERS.map((c) => c.key).join(","), "book,pay,sign,shoot,deliver,print", "Order");
    harness.assertEqual(CHAPTERS.map((c) => c.n).join(","), "01,02,03,04,05,06", "Numbers");
    const badge = (f: PlanFeature | null) => (f ? `${PLANS[cheapestPlanWith(f)].name} plan` : null);
    for (const c of CHAPTERS) harness.assertEqual(planBadge(c.feature), badge(c.feature), `${c.key} badge`);
    harness.assertEqual(planBadge(CHAPTERS.find((c) => c.key === "sign")!.feature), "Studio plan", "Sign is Studio");
    harness.assertEqual(planBadge(CHAPTERS.find((c) => c.key === "print")!.feature), "Production plan", "Print is Production");
    harness.assertEqual(planBadge(null), null, "No badge when none is needed");
  });

  await harness.test("T39-CONTENT-02: none of the banned phrases appear in the copy", async () => {
    const text = JSON.stringify([CHAPTERS, EXTRAS, ...MODES.map((m) => faqItems(m, EMAIL))]);
    for (const p of BANNED_PHRASES) {
      const hit = typeof p === "string" ? text.toLowerCase().includes(p.toLowerCase()) : p.test(text);
      harness.assert(!hit, `Banned phrase absent: ${String(p)}`);
    }
  });

  await harness.test("T39-CONTENT-03: the FAQ matches how sign-up works and says the key facts", async () => {
    const has = (m: LandingMode, re: RegExp) => faqItems(m, EMAIL).some((i) => re.test(`${i.q} ${i.a}`));
    harness.assert(!has("TRIAL", /invite/i), "Open trial: no invite talk");
    harness.assert(has("INVITE_WITH_CODE", /invite/i), "Needs a code: invite explained");
    for (const m of MODES) {
      harness.assert(has(m, new RegExp(EMAIL.replace(".", "\."))), `${m}: the contact email`);
      harness.assert(has(m, /7 days/i), `${m}: the 7-day grace`);
      harness.assert(has(m, /nothing is deleted/i), `${m}: nothing is deleted`);
    }
  });

  // ── Task 2: invite requests ─────────────────────────────────────────────────────────────
  const superRow = await db.user.findFirst({ where: { role: "SUPER_ADMIN", deactivatedAt: null } });
  const ownerRow = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
  if (!superRow || !ownerRow) throw new Error("Seed super-admin and owner are required");
  const sess = (u: typeof superRow) => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: null as string | null });
  const superAdmin = sess(superRow);
  const owner = { ...sess(ownerRow), tenantSlug: "lumina-cine" };
  const stamp = Date.now().toString(36);
  const req = (over: Record<string, unknown> = {}) => ({ name: "T39 Visitor", studioName: `T39 Studio ${stamp}`, email: `t39-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.test`, kind: "PHOTO", ...over });
  const cleanUp = () => db.inviteRequest.deleteMany({ where: { OR: [{ studioName: { startsWith: "T39 " } }, { email: { contains: "t39-" } }] } });

  type Mail = { to: string; subject: string; html: string; text: string };
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;
  const withInbox = async (fn: (inbox: Mail[]) => Promise<void>, fail = false) => {
    const saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    const inbox: Mail[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({
      sendMail: async (mail: Mail) => {
        if (fail) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        inbox.push(mail);
        return json.sendMail(mail);
      },
    } as unknown as Transporter);
    const quiet = console.error;
    if (fail) console.error = () => undefined;
    try {
      await fn(inbox);
    } finally {
      console.error = quiet;
      setSmtpTransportForTests(json);
      for (const k of SMTP_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
  harness.registerTeardown(async () => {
    await cleanUp();
  });

  await harness.test("T39-INVITE-01: a request is saved with its Unicode kept, and every active super-admin is emailed", async () => {
    const r = req({ name: "Siti Nurhaliza 🎬 张伟" });
    await withInbox(async (inbox) => {
      const res = await withIp("198.51.100.1", () => requestInvite(r as never));
      harness.assert(res.success === true, "Saved", JSON.stringify(res));
      const row = await db.inviteRequest.findFirst({ where: { email: r.email } });
      harness.assertEqual(row?.name, "Siti Nurhaliza 🎬 张伟", "Unicode kept");
      const admins = await db.user.count({ where: { role: "SUPER_ADMIN", deactivatedAt: null } });
      const mails = inbox.filter((m) => `${m.subject} ${m.html}`.includes(r.studioName));
      harness.assertEqual(mails.length, admins, "One mail per active super-admin");
      harness.assert(mails.some((m) => String(m.to).includes(superRow.email)), "To the super-admin");
    });
    await cleanUp();
  });

  await harness.test("T39-INVITE-02: too-long messages, bad emails and filled honeypots are handled", async () => {
    const long = await withIp("198.51.100.2", () => requestInvite(req({ message: "x".repeat(1001) }) as never));
    harness.assert(long.success === false && long.error === "INVALID" && long.message.length > 5, "1001 characters refused plainly", JSON.stringify(long));
    const bad = await withIp("198.51.100.2", () => requestInvite(req({ email: "not-an-email" }) as never));
    harness.assert(bad.success === false && bad.error === "INVALID", "Bad email refused");
    const trap = req({ website: "http://spam.example" });
    const res = await withIp("198.51.100.2", () => requestInvite(trap as never));
    harness.assert(res.success === true, "Honeypot gets a fake success");
    harness.assertEqual(await db.inviteRequest.count({ where: { email: trap.email } }), 0, "…and nothing is saved");
    await cleanUp();
  });

  await harness.test("T39-INVITE-03: the same email twice in a day saves and emails once; the 6th try from one address is limited", async () => {
    await withInbox(async (inbox) => {
      const r = req();
      await withIp("198.51.100.3", () => requestInvite(r as never));
      const before = inbox.length;
      const again = await withIp("198.51.100.3", () => requestInvite({ ...r, name: "Again" } as never));
      harness.assert(again.success === true, "Second submit looks like success");
      harness.assertEqual(await db.inviteRequest.count({ where: { email: r.email } }), 1, "Still one row");
      harness.assertEqual(inbox.length, before, "No second email");
      const results = [];
      for (let i = 0; i < 5; i++) results.push(await withIp("198.51.100.4", () => requestInvite(req() as never)));
      harness.assert(results.every((x) => x.success === true), "Five are fine");
      const sixth = await withIp("198.51.100.4", () => requestInvite(req() as never));
      harness.assert(sixth.success === false && sixth.error === "RATE_LIMITED", "Sixth is limited", JSON.stringify(sixth));
    });
    await cleanUp();
  });

  await harness.test("T39-INVITE-04: a mail failure never loses the request", async () => {
    const r = req();
    await withInbox(async () => {
      const res = await withIp("198.51.100.5", () => requestInvite(r as never));
      harness.assert(res.success === true, "Still a success");
    }, true);
    harness.assertEqual(await db.inviteRequest.count({ where: { email: r.email } }), 1, "The row exists");
    await cleanUp();
  });

  await harness.test("T39-INVITE-05: only a super-admin can read or handle requests", async () => {
    const r = req();
    await withInbox(async () => {
      await withIp("198.51.100.6", () => requestInvite(r as never));
    });
    const row = await db.inviteRequest.findFirstOrThrow({ where: { email: r.email } });
    let refused = false;
    try {
      const x = (await withSession(owner, () => listInviteRequests())) as unknown;
      refused = !Array.isArray(x);
    } catch {
      refused = true;
    }
    harness.assert(refused, "An owner can't list them");
    let refusedSet = false;
    try {
      const x = (await withSession(owner, () => setInviteRequestHandled({ id: row.id, handled: true }))) as { success?: boolean };
      refusedSet = x?.success === false;
    } catch {
      refusedSet = true;
    }
    harness.assert(refusedSet, "An owner can't mark one handled");
    harness.assertEqual((await db.inviteRequest.findUnique({ where: { id: row.id } }))?.handledAt, null, "Untouched");
    const listed = await withSession(superAdmin, () => listInviteRequests());
    const times = listed.map((x) => x.createdAt);
    harness.assertEqual(times.join("|"), times.slice().sort().reverse().join("|"), "Newest first");
    harness.assert(listed.some((x) => x.id === row.id), "Listed for the super-admin");
    await withSession(superAdmin, () => setInviteRequestHandled({ id: row.id, handled: true }));
    harness.assert((await db.inviteRequest.findUnique({ where: { id: row.id } }))?.handledAt !== null, "Handled");
    await withSession(superAdmin, () => setInviteRequestHandled({ id: row.id, handled: false }));
    harness.assertEqual((await db.inviteRequest.findUnique({ where: { id: row.id } }))?.handledAt, null, "Reopened");
    await cleanUp();
  });

  // ── Task 3: the inbox in the super-admin console ────────────────────────────────────────
  await harness.test("T39-INBOX-01: the console lists invite requests with contact links and a handled toggle", async () => {
    await provideReactGlobal();
    const metrics = await withSession(superAdmin, () => getPlatformMetrics());
    const tenants = await withSession(superAdmin, () => getAllTenantsSummary());
    const row = (over: Record<string, unknown>) => ({ id: "i1", name: "Aina", studioName: "T39 Open Studio", email: "aina@example.test", phone: "+60123456789", kind: "PHOTO", message: "Hi!", createdAt: new Date().toISOString(), handledAt: null, ...over });
    const out = renderToStaticMarkup(
      createElement(SuperAdminView, {
        metrics,
        tenants: tenants as never,
        invites: [row({}), row({ id: "i2", studioName: "T39 Done Studio", handledAt: new Date().toISOString() })] as never,
      }) as never
    );
    harness.assert(out.includes("Invite requests"), "Heading");
    harness.assert(out.includes("T39 Open Studio") && out.includes("T39 Done Studio"), "Both listed");
    harness.assert(out.includes("mailto:aina@example.test") && out.includes("tel:+60123456789"), "Contact links");
    harness.assert(out.includes("Mark handled") && out.includes("Reopen"), "Toggle for each state");
    const empty = renderToStaticMarkup(createElement(SuperAdminView, { metrics, tenants: tenants as never, invites: [] }) as never);
    harness.assert(empty.includes("No invite requests yet."), "Empty state");
  });
}
