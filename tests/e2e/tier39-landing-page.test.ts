/**
 * Tier 39: the platform landing page (docs/superpowers/specs/2026-11-24-landing-page-redesign-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, PLAN_CODES, cheapestPlanWith, type PlanFeature } from "@/lib/billing/plans";
import SaasLandingPage from "@/app/(saas)/page";
import SaasLayout from "@/app/(saas)/layout";
import { SaasNavbar } from "@/components/saas/saas-navbar";
import { landingMode, type LandingMode } from "@/lib/landing/mode";
import { publicContactEmail } from "@/lib/landing/contact";
import { BANNED_PHRASES, CHAPTERS, EXTRAS, faqItems, planBadge } from "@/lib/landing/content";
import nodemailer, { type Transporter } from "nodemailer";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { db } from "@/lib/db";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { landingVideo } from "@/lib/landing/media";
import { LoopVideo } from "@/components/landing/loop-video";
import { renderToStaticMarkup } from "react-dom/server";
import { provideReactGlobal } from "./react-tree";
import { getAllTenantsSummary, getPlatformMetrics } from "@/lib/actions/super-admin";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";
import { withIp, withSession } from "./mocks/session";
import { listInviteRequests, requestInvite, setInviteRequestHandled, submitInviteRequest } from "@/lib/actions/invite-requests";
import { appUrl } from "@/lib/domain-name";

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
      harness.assert(mails.every((m) => m.html.includes(`href="${appUrl().origin}/super-admin"`)), "The button opens the console by its full address");
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

  // ── Task 4: video, frames, motion boundaries ────────────────────────────────────────────
  await harness.test("T39-MEDIA-01: a video is offered only when its file exists; the poster is always there", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "t39-media-"));
    try {
      harness.assertEqual(JSON.stringify(landingVideo("hero", root)), JSON.stringify({ mp4: null, mp4Portrait: null, poster: "/landing/posters/hero.jpg" }), "No files: poster only");
      await fs.mkdir(path.join(root, "landing", "video"), { recursive: true });
      await fs.writeFile(path.join(root, "landing", "video", "hero-16x9.mp4"), "x");
      harness.assertEqual(landingVideo("hero", root).mp4, "/landing/video/hero-16x9.mp4", "File present: offered");
      harness.assertEqual(landingVideo("hero", root).mp4Portrait, null, "No portrait file: none");
      await fs.writeFile(path.join(root, "landing", "video", "hero-9x16.mp4"), "x");
      harness.assertEqual(landingVideo("hero", root).mp4Portrait, "/landing/video/hero-9x16.mp4", "Portrait file: offered for phones");
      harness.assertEqual(landingVideo("print", root).mp4, null, "Another slot without a file: still null");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await harness.test("T39-MEDIA-02: the server markup of a looping video is only its poster (the video mounts on the client)", async () => {
    await provideReactGlobal();
    const out = renderToStaticMarkup(createElement(LoopVideo, { mp4: "/x.mp4", mp4Portrait: null, poster: "/p.jpg", alt: "a" }) as never);
    harness.assert(out.includes("<img") && out.includes("/p.jpg"), "The poster image is rendered");
    harness.assert(!out.includes("<video"), "No video element until the client decides to play");
  });

  await harness.test("T39-MEDIA-04: the video container takes its position from its caller, so the hero background fills the hero", async () => {
    await provideReactGlobal();
    const wrapperClass = (cls: string) => /<div class="([^"]*)"/.exec(renderToStaticMarkup(createElement(LoopVideo, { mp4: null, poster: "/p.jpg", alt: "", className: cls }) as never))?.[1] ?? "";
    const hero = wrapperClass("absolute inset-0 -z-10");
    const classes = hero.split(" ");
    harness.assert(classes.includes("absolute") && !classes.includes("relative"), "A hero background is absolute only, not also relative", hero);
    const hero2 = await fs.readFile(path.join(process.cwd(), "components/landing/hero.tsx"), "utf8");
    harness.assert(/LoopVideo[^>]*className="absolute inset-0/.test(hero2), "The hero places its video absolutely");
    const journey = await fs.readFile(path.join(process.cwd(), "components/landing/journey.tsx"), "utf8");
    harness.assert(/<LoopVideo[^>]*className="relative /.test(journey), "A chapter clip positions itself relatively");
  });

  await harness.test("T39-MEDIA-03: motion libraries are imported only from components/landing", async () => {
    const offenders: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", ".git", "tests", ".superpowers", "graphify-out"].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const text = await fs.readFile(full, "utf8");
          if (/from ["'](gsap|gsap\/[^"']*|lenis|lenis\/[^"']*)["']/.test(text) && !full.replace(/\\/g, "/").includes("/components/landing/")) offenders.push(full);
        }
      }
    };
    for (const d of ["app", "components", "lib"]) await walk(path.join(process.cwd(), d));
    harness.assertEqual(offenders.join(", "), "", "Only the landing components import gsap or lenis");
  });

  // ── Task 5: the page ────────────────────────────────────────────────────────────────────
  await provideReactGlobal();
  const withEnv = async <T,>(env: { APP_ENV?: string; STUDIO_SIGNUP_CODE?: string }, fn: () => Promise<T>): Promise<T> => {
    const saved = { APP_ENV: process.env.APP_ENV, STUDIO_SIGNUP_CODE: process.env.STUDIO_SIGNUP_CODE };
    for (const k of ["APP_ENV", "STUDIO_SIGNUP_CODE"] as const) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    try {
      return await fn();
    } finally {
      for (const k of ["APP_ENV", "STUDIO_SIGNUP_CODE"] as const) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
  const SETUPS: [LandingMode, { APP_ENV?: string; STUDIO_SIGNUP_CODE?: string }][] = [
    ["TRIAL", {}],
    ["INVITE_WITH_CODE", { APP_ENV: "production", STUDIO_SIGNUP_CODE: "beta-code" }],
    ["INVITE_ONLY", { APP_ENV: "production" }],
  ];
  const renderSite = (env: { APP_ENV?: string; STUDIO_SIGNUP_CODE?: string }) =>
    withEnv(env, async () => renderToStaticMarkup((await SaasLayout({ children: await SaasLandingPage() })) as never));
  const hrefsOf = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
  const textOf = (markup: string) => markup.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]*>/g, " ");

  await harness.test("T39-PAGE-01: real prices and plan names, one h1, the sections and the invite form", async () => {
    for (const [mode, env] of SETUPS) {
      const out = await renderSite(env);
      for (const code of PLAN_CODES) {
        harness.assert(out.includes(PLANS[code].name) && out.includes(`RM ${PLANS[code].priceMyr}`), `${mode}: ${PLANS[code].name} at RM ${PLANS[code].priceMyr}`);
      }
      harness.assertEqual((out.match(/<h1[\s>]/g) ?? []).length, 1, `${mode}: exactly one h1`);
      for (const id of ["how", "pricing", "faq"]) harness.assert(out.includes(`id="${id}"`), `${mode}: #${id}`);
      harness.assertEqual(out.includes('id="invite"') && out.includes('name="website"'), mode !== "TRIAL", `${mode}: the invite form is there only when needed`);
    }
  });

  await harness.test("T39-PAGE-02: no invented claims, old prices, console links or (in production) demo links", async () => {
    for (const [mode, env] of SETUPS) {
      const out = await renderSite(env);
      const text = textOf(out);
      for (const p of BANNED_PHRASES) {
        const hit = typeof p === "string" ? text.toLowerCase().includes(p.toLowerCase()) : p.test(text);
        harness.assert(!hit, `${mode}: banned phrase absent: ${String(p)}`);
      }
      const links = hrefsOf(out);
      harness.assert(!links.some((h) => h.startsWith("/super-admin")), `${mode}: no console link`);
      if (env.APP_ENV === "production") {
        harness.assert(!links.some((h) => h.includes("lumina-cine") || h.includes("apex-media")), `${mode}: no demo studio links`);
      }
    }
  });

  await harness.test("T39-PAGE-03: the main action follows how sign-up works, and a closed sign-up is never linked", async () => {
    const trial = await renderSite({});
    harness.assert(textOf(trial).includes("Start your 14-day free trial") && hrefsOf(trial).includes("/create-studio"), "Open: start the trial");
    harness.assert(!textOf(trial).includes("Request an invite"), "Open: no invite button");
    const withCode = await renderSite({ APP_ENV: "production", STUDIO_SIGNUP_CODE: "beta-code" });
    harness.assert(textOf(withCode).includes("Request an invite") && textOf(withCode).includes("Have an invite code?"), "Needs a code: request, plus the code link");
    harness.assert(hrefsOf(withCode).includes("/create-studio"), "…which goes to sign-up");
    const closed = await renderSite({ APP_ENV: "production" });
    harness.assert(textOf(closed).includes("Request an invite"), "Closed: request an invite");
    harness.assert(!hrefsOf(closed).includes("/create-studio"), "Closed: nothing links to the closed sign-up page");
  });

  await harness.test("T39-PAGE-04: usable without JavaScript: nothing hidden by CSS, a real form, the contact address", async () => {
    const out = await renderSite({ APP_ENV: "production" });
    const hiddenReveal = [...out.matchAll(/<[^>]*data-reveal[^>]*>/g)].filter((m) => /opacity-0|invisible|opacity:\s*0/.test(m[0]));
    harness.assertEqual(hiddenReveal.length, 0, "No revealed element starts hidden in the markup");
    harness.assert(/<form[^>]*action=/.test(out), "The invite form has an action");
    harness.assert(out.includes(`mailto:${publicContactEmail()}`), "The contact address is a link in the footer");
  });

  await harness.test("T39-PAGE-05: nav links work from every page, and the nav has no console or demo links", async () => {
    await provideReactGlobal();
    for (const mode of MODES) {
      const links = hrefsOf(renderToStaticMarkup(createElement(SaasNavbar, { mode }) as never));
      for (const l of ["/#how", "/#pricing", "/#faq"]) harness.assert(links.includes(l), `${mode}: ${l}`);
      harness.assert(!links.some((h) => h.startsWith("/super-admin")), `${mode}: no console link`);
      harness.assert(links.includes(mode === "TRIAL" ? "/create-studio" : "/#invite"), `${mode}: the main button`);
    }
  });

  await harness.test("T39-PAGE-06: every image the page uses exists", async () => {
    const out = await renderSite({});
    const files = new Set<string>(["/landing/og.jpg"]);
    for (const m of out.matchAll(/(?:src|srcSet)="(\/landing\/[^"]+)"/g)) files.add(m[1]!);
    for (const c of CHAPTERS) {
      files.add(c.shot.desktop);
      if (c.shot.phone) files.add(c.shot.phone);
    }
    for (const f of files) {
      const ok = await fs.access(path.join(process.cwd(), "public", f)).then(() => true, () => false);
      harness.assert(ok, `Exists: ${f}`);
    }
  });

  // ── Final review fixes ──────────────────────────────────────────────────────────────────
  await harness.test("T39-FIX-01: a refused form keeps what the visitor typed", async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "Aina Binti", studioName: "Aina Studio", email: "aina@gmail", phone: "012", kind: "VIDEO", message: "Hello\nthere", website: "" })) fd.set(k, v);
    const res = await withIp("198.51.100.20", () => submitInviteRequest({ status: "idle" }, fd));
    harness.assert(res.status === "error", "A malformed email is refused", JSON.stringify(res));
    const values = (res as { values?: Record<string, string> }).values;
    harness.assertEqual(values?.name, "Aina Binti", "Name kept");
    harness.assertEqual(values?.studioName, "Aina Studio", "Studio kept");
    harness.assertEqual(values?.email, "aina@gmail", "Email kept so it can be fixed");
    harness.assertEqual(values?.kind, "VIDEO", "Choice kept");
    harness.assertEqual(values?.message, "Hello\nthere", "Message kept");
  });

  await harness.test("T39-FIX-02: a flood from many addresses is saved but cannot flood the platform owner's mailbox", async () => {
    await withInbox(async (inbox) => {
      const admins = await db.user.count({ where: { role: "SUPER_ADMIN", deactivatedAt: null } });
      let saved = 0;
      for (let i = 0; i < 40; i++) {
        const r = await withIp(`203.0.113.${i + 1}`, () => requestInvite(req({ studioName: `T39 Flood ${i}` }) as never));
        if (r.success) saved += 1;
      }
      harness.assertEqual(saved, 40, "Every request is still saved");
      harness.assertEqual(await db.inviteRequest.count({ where: { studioName: { startsWith: "T39 Flood" } } }), 40, "…and kept");
      const floodMails = inbox.filter((m) => `${m.subject} ${m.html}`.includes("T39 Flood")).length;
      harness.assert(floodMails < 40 * admins, `Not every request sent an email (${floodMails} of ${40 * admins})`);
      harness.assert(floodMails <= 20 * admins, "No more than the hourly cap goes out", String(floodMails));
    });
    await cleanUp();
  });

  await harness.test("T39-FIX-03: the share image has an absolute address", async () => {
    const mod = await import("@/app/(saas)/layout");
    const base = (mod as { metadata?: { metadataBase?: URL } }).metadata?.metadataBase;
    harness.assert(base instanceof URL, "The layout sets metadataBase");
    harness.assertEqual(base?.href, appUrl().href, "It is the site's own address");
  });

  await harness.test("T39-FIX-04: hash links are plain anchors the glide handler can see, and it moves focus to the form", async () => {
    const cta = await fs.readFile(path.join(process.cwd(), "components/landing/cta-buttons.tsx"), "utf8");
    const footer = await fs.readFile(path.join(process.cwd(), "components/saas/saas-footer.tsx"), "utf8");
    harness.assert(!/<Link[^>]*href="\/#/.test(cta), "CTA buttons don't use next/link for #links");
    harness.assert(!/<Link[^>]*href="\/#/.test(footer), "Footer doesn't use next/link for #links");
    const motion = await fs.readFile(path.join(process.cwd(), "components/landing/landing-motion.tsx"), "utf8");
    harness.assert(motion.includes("inv-name"), "After gliding to the invite section, focus moves to its first field");
    harness.assert(!motion.includes("querySelector<HTMLElement>(url.hash)"), "No selector built from the URL hash");
  });
}
