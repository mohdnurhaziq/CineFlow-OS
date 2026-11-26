/**
 * Tier 42: one login, part 2 (docs/superpowers/specs/2026-11-25-one-login-design.md):
 * the studio switcher, sign out everywhere, platform sign-in and the custom-domain handoff.
 */

import bcrypt from "bcryptjs";
import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { createLoginFromProof } from "@/lib/auth/login";
import { ensureStudioRoles } from "@/lib/auth/access";
import { loadSwitcher, accountHref } from "@/lib/auth/switcher";
import { signOutEverywhere } from "@/lib/actions/one-login";
import { getCurrentLogin, getCurrentUser } from "@/lib/auth/session";
import { COOKIE_NAME, createSessionToken, liveAccounts } from "@/lib/auth/token";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { provideReactGlobal } from "./react-tree";
import { SwitcherRow } from "@/components/auth/session-menu";
import { loginToPlatform } from "@/lib/actions/one-login";
import { loginWithCredentials } from "@/lib/auth/session";
import { decodeSessionToken } from "@/lib/auth/token";
import { RESERVED_SLUGS, OnboardStudioSchema } from "@/lib/validations/onboarding";
import { NextRequest } from "next/server";
import { GET as GET_HANDOFF, POST as POST_HANDOFF } from "@/app/auth/handoff/route";
import { GET as GET_SIGNOUT, POST as POST_SIGNOUT } from "@/app/auth/sign-out/route";
import { HANDOFF_TTL_SECONDS, issueHandoff, redeemHandoff, safeHandoffReturn } from "@/lib/auth/handoff";
import { APP_BASE_DOMAIN } from "@/lib/domain-name";
import { SHARED_COOKIE_NAME } from "@/lib/auth/token";
import { logoutAction } from "@/lib/auth/session";
import { registerClient } from "@/lib/actions/client-auth";
import { continueAsClient } from "@/lib/actions/one-login";
import { withHost } from "./mocks/session";
import { withLoginSession, withRequest, withSession, withStudio } from "./mocks/session";

const STAMP = Date.now().toString(36);
let counter = 0;
const emailFor = (label: string) => `t42-${label}-${STAMP}-${++counter}@example.test`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTier42OneLoginSwitcherTests(harness: TestHarness) {
  harness.setSuite("Tier 42", "One login: switcher and sign-out");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants lumina-cine and apex-media are required");

  const createdEmails = new Set<string>();
  const createdStudios: string[] = [];
  const makeStudio = async (label: string, extra: { name?: string; customDomain?: string } = {}) => {
    const t = await db.tenant.create({
      data: { name: extra.name ?? `T42 ${label} ${STAMP}`, slug: `t42-${label}-${STAMP}-${++counter}`, ...(extra.customDomain ? { customDomain: extra.customDomain } : {}) },
    });
    createdStudios.push(t.id);
    return t;
  };
  const makeUser = async (tenantId: string, email: string, role: string, opts: { password?: string; teamRoleId?: string } = {}) => {
    createdEmails.add(email.toLowerCase());
    return db.user.create({
      data: { tenantId, name: `T42 ${role}`, email, role, passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : null, ...(opts.teamRoleId ? { teamRoleId: opts.teamRoleId } : {}) },
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

  await ensureStudioRoles(lumina.id);
  const luminaRole = await db.teamRole.findFirstOrThrow({ where: { tenantId: lumina.id }, orderBy: { sortOrder: "asc" } });

  /** One person: a team account at lumina, a client account at apex, the owner of a throwaway studio. All joined to one login. */
  const makePerson = async (label: string) => {
    const email = emailFor(label);
    const own = await makeStudio(`${label}-own`, { name: `AAA ${label} ${STAMP}` });
    const team = await makeUser(lumina.id, email, "TEAM_MEMBER", { password: "old-pass-1", teamRoleId: luminaRole.id });
    const client = await makeUser(apex.id, email, "CLIENT", { password: "old-pass-2" });
    const owner = await makeUser(own.id, email, "STUDIO_OWNER", { password: "old-pass-3" });
    const { login } = await createLoginFromProof(email, await bcrypt.hash("new-pass-123", 4));
    return { email, own, team, client, owner, login };
  };

  await harness.test("T42-SWITCH-01: one row per live account, labelled, ordered, current marked", async () => {
    try {
      const p = await makePerson("sw1");
      await withLoginSession(p.login.id, p.team.id, async () => {
        const rows = await loadSwitcher("lumina-cine");
        harness.assertEqual(rows.length, 3, "Three live accounts, three rows");
        harness.assertEqual(rows.map((r) => r.tenantName).join("|"), [...rows.map((r) => r.tenantName)].sort((a, b) => a.localeCompare(b)).join("|"), "Ordered by studio name");
        const byslug = Object.fromEntries(rows.map((r) => [r.tenantSlug, r]));
        harness.assertEqual(byslug[p.own.slug]?.roleLabel, "Owner", "Owner");
        harness.assertEqual(byslug["lumina-cine"]?.roleLabel, luminaRole.name, "A team member shows their role's name");
        harness.assertEqual(byslug["apex-media"]?.roleLabel, "Client", "Client");
        harness.assertEqual(rows.filter((r) => r.current).map((r) => r.tenantSlug).join(), "lumina-cine", "Only the studio being visited is current");
        harness.assertEqual((await loadSwitcher(null)).filter((r) => r.current).length, 0, "On the platform nothing is current");
      });
      harness.assertEqual((await withSession(null, () => loadSwitcher("lumina-cine"))).length, 0, "No login session: nothing");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-SWITCH-02: removed accounts and cancelled studios are not listed", async () => {
    try {
      const p = await makePerson("sw2");
      await withLoginSession(p.login.id, p.owner.id, async () => {
        await db.user.update({ where: { id: p.team.id }, data: { deactivatedAt: new Date() } });
        await db.tenant.update({ where: { id: apex.id }, data: { subscriptionStatus: "CANCELLED" } });
        try {
          const rows = await loadSwitcher(p.own.slug);
          harness.assertEqual(rows.map((r) => r.tenantSlug).join(), p.own.slug, "Only the owner row remains");
        } finally {
          await db.tenant.update({ where: { id: apex.id }, data: { subscriptionStatus: apex.subscriptionStatus } });
        }
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-SWITCH-03: links follow signInTarget, and are absolute only with subdomains on, even for a studio with its own domain", async () => {
    const saved = { s: process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS, u: process.env.NEXT_PUBLIC_APP_URL };
    try {
      const p = await makePerson("sw3");
      await db.tenant.update({ where: { id: p.own.id }, data: { customDomain: `t42-${STAMP}.example.test` } });
      delete process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
      harness.assertEqual(accountHref(p.own.slug, "STUDIO_OWNER"), `/${p.own.slug}/admin`, "Owner: the Overview");
      harness.assertEqual(accountHref("lumina-cine", "TEAM_MEMBER"), "/lumina-cine/admin/schedule", "Team: My schedule");
      harness.assertEqual(accountHref("apex-media", "CLIENT"), "/apex-media/account", "Client: the account page");
      process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = "true";
      process.env.NEXT_PUBLIC_APP_URL = "https://cineflow-os.my";
      harness.assertEqual(accountHref(p.own.slug, "STUDIO_OWNER"), `https://${p.own.slug}.cineflow-os.my/admin`, "With subdomains: the studio's subdomain address, even though it has its own domain");
      await withLoginSession(p.login.id, p.team.id, async () => {
        const rows = await loadSwitcher("lumina-cine");
        harness.assert(rows.every((r) => r.href.startsWith(`https://${r.tenantSlug}.cineflow-os.my/`)), "Every row links to a subdomain address", rows.map((r) => r.href).join(" "));
      });
    } finally {
      if (saved.s === undefined) delete process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
      else process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = saved.s;
      if (saved.u === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = saved.u;
      await cleanUp();
    }
  });

  await harness.test("T42-OUT-01: sign out everywhere ends every session of the login", async () => {
    try {
      const p = await makePerson("out1");
      const accounts = await liveAccounts(p.login.id);
      const slim = accounts.map(({ tenantSlug, userId, role }) => ({ tenantSlug, userId, role }));
      // A session from another device, issued before the sign-out.
      const other = await createSessionToken(accounts.find((a) => a.userId === p.client.id)!.user, slim);
      await sleep(8);
      const res = await withLoginSession(p.login.id, p.team.id, () => signOutEverywhere());
      harness.assert(res.success === true, "Signed out everywhere", JSON.stringify(res));
      const asOther = (slug: string) => withRequest(async (jar) => { jar.set(COOKIE_NAME, other); return withStudio(slug, getCurrentUser); });
      harness.assertEqual(await asOther("apex-media"), null, "The other device's session is over at apex");
      harness.assertEqual(await asOther("lumina-cine"), null, "…and at lumina");
      harness.assertEqual(await withRequest(async (jar) => { jar.set(COOKIE_NAME, other); return getCurrentLogin(); }), null, "…and as a login");
      await sleep(8);
      const again = await withLoginSession(p.login.id, p.team.id, () => withStudio("lumina-cine", getCurrentUser));
      harness.assertEqual(again?.id, p.team.id, "Signing in again right after works");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-OUT-02: a stand-alone account signs out everywhere too, and nobody else is touched; nobody signed in is refused", async () => {
    try {
      const email = emailFor("out2");
      const alone = await makeUser(lumina.id, email, "CLIENT", { password: "alone-pass-1" });
      const bystander = await makeUser(apex.id, emailFor("out2-by"), "CLIENT", { password: "by-pass-1" });
      const as = { id: alone.id, email, name: alone.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" };
      const res = await withSession(as, () => signOutEverywhere());
      harness.assert(res.success === true, "Signed out", JSON.stringify(res));
      harness.assert((await db.user.findUniqueOrThrow({ where: { id: alone.id } })).sessionsValidAfter !== null, "Its sessions are ended");
      harness.assertEqual((await db.user.findUniqueOrThrow({ where: { id: bystander.id } })).sessionsValidAfter, null, "Nobody else is touched");
      const nobody = await withSession(null, () => signOutEverywhere());
      harness.assert(nobody.success === false && nobody.message === "You're not signed in.", "Nobody signed in: refused", JSON.stringify(nobody));
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const asSuper = { id: superRow.id, email: superRow.email, name: superRow.name, role: "SUPER_ADMIN", tenantId: null, tenantSlug: null };
      const sup = await withSession(asSuper, () => signOutEverywhere());
      harness.assertEqual(sup.success, false, "A super-admin is refused here");
    } finally {
      await cleanUp();
    }
  });

  // ── Task 2: the account menu ────────────────────────────────────────────────────────────
  await harness.test("T42-MENU-01: the menu is in all three account bars, and each page loads the switcher", async () => {
    for (const f of ["components/admin/admin-user-nav.tsx", "components/account/client-user-nav.tsx", "components/account/client-account-menu.tsx"]) {
      harness.assert(/<SessionMenu\b/.test(await readFile(f, "utf8")), `${f} renders the session menu`);
    }
    for (const f of ["components/admin/admin-header.tsx", "app/[tenantSlug]/account/layout.tsx", "components/layout/studio-page-header.tsx", "app/[tenantSlug]/page.tsx"]) {
      harness.assert(/loadSwitcher\(/.test(await readFile(f, "utf8")), `${f} loads the switcher`);
    }
    const menu = await readFile("components/auth/session-menu.tsx", "utf8");
    harness.assert(/aria-label="Studios and sign out"/.test(menu) && /Switch studio/.test(menu) && /Sign out everywhere/.test(menu), "The menu has its label, heading and sign-out item");
    harness.assert(/entries\.length > 1/.test(menu), "The switcher part shows only with two or more studios");
  });

  await harness.test("T42-MENU-02: a switcher row shows the studio, the role, and marks the current one", async () => {
    await provideReactGlobal();
    const row = (current: boolean) =>
      renderToStaticMarkup(createElement(SwitcherRow, { entry: { tenantSlug: "a", tenantName: "Apex Photo & Motion", roleLabel: "Photographer", href: "/a/admin", current } }) as never);
    const here = row(true);
    harness.assert(/Apex Photo &amp; Motion/.test(here) && /Photographer/.test(here), "Name and role");
    harness.assertEqual((here.match(/Current/g) ?? []).length, 1, "The current row says so");
    harness.assert(!/Current/.test(row(false)), "Another row doesn't");
  });

  await harness.test("T42-MENU-03: the manual explains one sign-in", async () => {
    const manual = await readFile("app/[tenantSlug]/admin/manual/settings-and-team/page.tsx", "utf8");
    harness.assert(/One sign-in/.test(manual) && /Sign out everywhere/.test(manual), "The settings manual has a One sign-in section that mentions signing out everywhere");
  });

  // ── Task 3: platform sign-in and Your studios ───────────────────────────────────────────
  await harness.test("T42-PLATFORM-01: a login signs in on the platform and gets a login session", async () => {
    try {
      const p = await makePerson("pl1");
      const out = await withRequest(async (jar) => ({ res: await loginToPlatform(p.email, "new-pass-123"), cookie: jar.get(COOKIE_NAME) }));
      harness.assert(out.res.success === true && out.res.redirectTo === "/studios", "Signed in, on to Your studios", JSON.stringify(out.res));
      const decoded = await decodeSessionToken(out.cookie ?? "");
      harness.assertEqual(decoded?.accounts?.length, 3, "The session lists all three studios");
      harness.assertEqual(decoded?.user.loginId, p.login.id, "…as the person's login");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-PLATFORM-02: every failure looks the same, and so does being blocked", async () => {
    try {
      const p = await makePerson("pl2");
      const alone = emailFor("pl2-alone");
      await makeUser(lumina.id, alone, "CLIENT", { password: "alone-pass-1" });
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const same = { success: false, error: "INVALID_CREDENTIALS" };
      const tries: Array<[string, string, string]> = [
        ["an unknown email", emailFor("pl2-nobody"), "whatever-123"],
        ["a wrong password", p.email, "not-the-password"],
        ["a stand-alone account's wrong password", alone, "alone-pass-2"],
        ["a super-admin's email", superRow.email, "password123"],
      ];
      for (const [what, email, password] of tries) {
        const out = await withRequest(async (jar) => ({ res: await loginToPlatform(email, password), set: jar.has(COOKIE_NAME) }));
        harness.assert(JSON.stringify(out.res) === JSON.stringify(same) && !out.set, `${what}: the same answer, no session`, JSON.stringify(out.res));
      }
      // Ten tries for any email, known or not, then the same "wait" for both.
      const unknown = emailFor("pl2-spray");
      for (let i = 0; i < 10; i++) {
        await loginToPlatform(unknown, `guess-${i}-xxxxx`);
        await loginToPlatform(p.email, `guess-${i}-xxxxx`);
      }
      const a = await loginToPlatform(unknown, "guess-final-1");
      const b = await loginToPlatform(p.email, "new-pass-123");
      harness.assert(a.success === false && a.error === "RATE_LIMITED" && b.success === false && b.error === "RATE_LIMITED", "An unknown email and a real one are blocked alike", JSON.stringify([a, b]));
      const sameLimit = await withRequest(() => loginWithCredentials(p.email, "new-pass-123", "lumina-cine"));
      harness.assertEqual(sameLimit.error, "RATE_LIMITED", "…and it is the same limit as signing in at a studio");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-PLATFORM-03: the pages, the reserved address and the nav link", async () => {
    const login = await readFile("app/(saas)/login/page.tsx", "utf8");
    harness.assert(/getCurrentLogin\(\)/.test(login) && /redirect\("\/studios"\)/.test(login), "/login sends someone already signed in to /studios");
    const studios = await readFile("app/(saas)/studios/page.tsx", "utf8");
    harness.assert(/redirect\("\/login"\)/.test(studios) && /loadSwitcher\(null\)/.test(studios), "/studios needs a login session and lists their studios");
    harness.assert(/You're not with any studio yet\./.test(studios) || /You&apos;re not with any studio yet\./.test(studios), "…with a line for someone with no studio");
    harness.assert(RESERVED_SLUGS.has("studios"), "'studios' is a reserved address");
    harness.assertEqual(OnboardStudioSchema.safeParse({ name: "Studios Co", slug: "studios", ownerName: "Maya Lin", ownerEmail: "maya@example.com", password: "password123" }).success, false, "No studio can take the slug 'studios'");
    harness.assert(!/\/login/.test(await readFile("components/saas/saas-navbar.tsx", "utf8")), "The landing page's top bar has no sign-in link");
    harness.assert(/<Link[^>]*href="\/login"/.test(await readFile("components/saas/saas-footer.tsx", "utf8")), "The landing page's footer links to /login");
  });

  // ── Task 4: the handoff for studios on their own domain ─────────────────────────────────
  const withProd = async <T>(fn: () => Promise<T>): Promise<T> => {
    const saved = { s: process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS, u: process.env.NEXT_PUBLIC_APP_URL };
    process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://cineflow-os.my";
    try {
      return await fn();
    } finally {
      if (saved.s === undefined) delete process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
      else process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = saved.s;
      if (saved.u === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = saved.u;
    }
  };
  const PLATFORM = APP_BASE_DOMAIN;
  /** A person whose own studio has its own domain. */
  const makeOnOwnDomain = async (label: string) => {
    const p = await makePerson(label);
    const domain = `cd-${label}-${STAMP}.example.test`;
    await db.tenant.update({ where: { id: p.own.id }, data: { customDomain: domain } });
    return { ...p, domain };
  };
  /** The POST a studio's page sends to the platform: a form with the code and return address, and the Origin header the browser adds. */
  const postHandoff = (code: string, next: string, origin: string | null) =>
    new NextRequest("https://cineflow-os.my/auth/handoff", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ code, next }).toString(),
    });
  const postSignOut = (next: string, origin: string | null) =>
    new NextRequest("https://cineflow-os.my/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ next }).toString(),
    });
  const sessionAndCalls = async (jar: Map<string, string>, host: string, fn: () => Promise<unknown>) => {
    const { result, calls } = await withHost(host, fn);
    return { result, calls, jar };
  };

  await harness.test("T42-HANDOFF-01: a handoff code works once, briefly, and only its hash is stored", async () => {
    try {
      const p = await makePerson("h1");
      const code = await issueHandoff(p.login.id, p.team.id, "studio-a.example.test");
      const row = await db.signInHandoff.findFirstOrThrow({ where: { loginId: p.login.id } });
      harness.assertEqual(row.host, "studio-a.example.test", "It remembers the host that issued it");
      harness.assert(row.codeHash !== code && row.codeHash.length === 64, "Only a hash is stored");
      harness.assert(row.expiresAt.getTime() - Date.now() <= HANDOFF_TTL_SECONDS * 1000 + 1000 && row.expiresAt.getTime() > Date.now(), "It is valid for about a minute");
      harness.assertEqual(await redeemHandoff(code, "studio-b.example.test"), null, "Another studio's host can't use it (and that doesn't use it up)");
      const first = await redeemHandoff(code, "studio-a.example.test");
      harness.assert(first?.loginId === p.login.id && first.activeUserId === p.team.id, "It gives back the login and the active account", JSON.stringify(first));
      harness.assertEqual(await redeemHandoff(code, "studio-a.example.test"), null, "A second use gets nothing");
      const old = await issueHandoff(p.login.id, p.team.id, "studio-a.example.test");
      await db.signInHandoff.updateMany({ where: { loginId: p.login.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
      harness.assertEqual(await redeemHandoff(old, "studio-a.example.test"), null, "An expired code gets nothing");
      harness.assertEqual(await redeemHandoff("made-up-code", "studio-a.example.test"), null, "A made-up code gets nothing");
    } finally {
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T42-HANDOFF-02: the route signs the person in on the platform host and sends them back; a replay does nothing", async () => {
    try {
      await withProd(async () => {
        const p = await makeOnOwnDomain("h2");
        const next = `https://${p.domain}/account`;
        const code = await issueHandoff(p.login.id, p.owner.id, p.domain);
        await withRequest(async (jar) => {
          const ok = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(code, next, `https://${p.domain}`)));
          const res = ok.result as Response;
          harness.assertEqual(res.headers.get("location"), next, "Sent back to the studio's own domain");
          harness.assertEqual(res.status, 303, "…with a 303, so the browser comes back with a plain GET");
          const set = ok.calls.find((c) => c.op === "set" && c.args[0] === SHARED_COOKIE_NAME);
          harness.assert(!!set && (set.args[2] as { domain?: string } | undefined)?.domain === PLATFORM, "The platform's shared cookie was set for the whole domain", JSON.stringify(ok.calls.map((c) => c.args[0])));
          const decoded = await decodeSessionToken(jar.get(SHARED_COOKIE_NAME) ?? "");
          harness.assert(decoded?.user.loginId === p.login.id && decoded.accounts?.length === 3, "…as the person's login session", JSON.stringify(decoded?.user));
          jar.clear();
          const replay = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(code, next, `https://${p.domain}`)));
          harness.assert((replay.result as Response).headers.get("location")?.endsWith("/login") === true && !jar.has(SHARED_COOKIE_NAME), "The same code again: sent to sign in, nothing set");
        });
      });
    } finally {
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T42-HANDOFF-06: a handoff only works when this browser's own studio page sent it (no login CSRF)", async () => {
    try {
      await withProd(async () => {
        const p = await makeOnOwnDomain("h6");
        const other = `cd-h6-other-${STAMP}.example.test`;
        const otherStudio = await makeStudio("h6-other", { customDomain: other });
        const next = `https://${p.domain}/account`;
        const toSignIn = (r: unknown) => (r as Response).headers.get("location")?.endsWith("/login") === true;
        await withRequest(async (jar) => {
          const code = await issueHandoff(p.login.id, p.owner.id, p.domain);
          // A link on a hostile page: no Origin, or someone else's Origin.
          for (const [what, origin] of [["no Origin header", null], ["another site's Origin", "https://evil.com"], ["another studio's Origin", `https://${other}`]] as const) {
            const out = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(code, next, origin)));
            harness.assert(toSignIn(out.result) && !jar.has(SHARED_COOKIE_NAME), `${what}: refused, nothing set`);
          }
          // GET never signs anyone in.
          const get = await sessionAndCalls(jar, PLATFORM, () => GET_HANDOFF(new NextRequest(`https://cineflow-os.my/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`)));
          harness.assert(toSignIn(get.result) && !jar.has(SHARED_COOKIE_NAME), "A plain link (GET) does nothing");
          // None of that used the code up: the real page can still use it.
          const real = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(code, next, `https://${p.domain}`)));
          harness.assertEqual((real.result as Response).headers.get("location"), next, "The studio's own page still can");
          // A code issued for one studio's domain doesn't work for another studio's.
          jar.clear();
          const mine = await issueHandoff(p.login.id, p.owner.id, p.domain);
          const wrongStudio = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(mine, `https://${other}/account`, `https://${other}`)));
          harness.assert(toSignIn(wrongStudio.result) && !jar.has(SHARED_COOKIE_NAME), "A code for studio A's domain is refused for studio B's");
        });
        void otherStudio;
      });
    } finally {
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T42-HANDOFF-03: the return address is only ever a studio's own domain", async () => {
    try {
      await withProd(async () => {
        const p = await makeOnOwnDomain("h3");
        const good = `https://${p.domain}/account?tab=bookings`;
        harness.assertEqual(await safeHandoffReturn(good), good, "A studio's own domain with a path is fine");
        const bad = [
          "https://evil.com/x",
          "//evil.com",
          "javascript:alert(1)",
          `https://${p.own.slug}.${PLATFORM}/admin`,
          `https://${PLATFORM}/login`,
          `https://nobody-${STAMP}.example.test/x`,
          `https://${p.domain}/\\evil`,
          `https://${p.domain}/a\tb`,
          `https://${p.domain}/a\nb`,
          `https://user:pass@${p.domain}/x`,
          `https://${p.domain}:8443/x`,
          "",
        ];
        for (const b of bad) harness.assertEqual(await safeHandoffReturn(b), null, `Refused: ${JSON.stringify(b)}`);
        // Even with a valid code, a bad return address does nothing.
        const code = await issueHandoff(p.login.id, p.owner.id, p.domain);
        await withRequest(async (jar) => {
          const out = await sessionAndCalls(jar, PLATFORM, () => POST_HANDOFF(postHandoff(code, "https://evil.com/x", "https://evil.com")));
          harness.assert((out.result as Response).headers.get("location")?.endsWith("/login") === true && !jar.has(SHARED_COOKIE_NAME), "A valid code with a bad address: sent to sign in, nothing set");
        });
      });
    } finally {
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T42-HANDOFF-04: signing in on a custom domain returns a handoff code; elsewhere none", async () => {
    try {
      await withProd(async () => {
        const p = await makeOnOwnDomain("h4");
        const atDomain = await withHost(p.domain, () => loginWithCredentials(p.email, "new-pass-123", p.own.slug));
        harness.assert(atDomain.result.success === true && typeof atDomain.result.handoffCode === "string", "On the studio's own domain: a code", JSON.stringify(atDomain.result));
        harness.assertEqual((await db.signInHandoff.findFirstOrThrow({ where: { loginId: p.login.id }, orderBy: { createdAt: "desc" } })).host, p.domain, "…tied to that domain");
        const atSub = await withHost(`${p.own.slug}.${PLATFORM}`, () => loginWithCredentials(p.email, "new-pass-123", p.own.slug));
        harness.assert(atSub.result.success === true && atSub.result.handoffCode === undefined, "On the studio's subdomain: none");
        const atPlatform = await withHost(PLATFORM, () => loginWithCredentials(p.email, "new-pass-123", p.own.slug));
        harness.assert(atPlatform.result.success === true && atPlatform.result.handoffCode === undefined, "On the platform host: none");
        const alone = emailFor("h4-alone");
        await makeUser(p.own.id, alone, "CLIENT", { password: "alone-pass-1" });
        const standAlone = await withHost(p.domain, () => loginWithCredentials(alone, "alone-pass-1", p.own.slug));
        harness.assert(standAlone.result.success === true && standAlone.result.handoffCode === undefined, "A stand-alone account never gets one");
        // Registering and continuing as a client at that studio hand off too.
        const second = await makePerson("h4b");
        const reg = await withHost(p.domain, () => registerClient({ tenantSlug: p.own.slug, name: "T42 Reg", email: second.email, phone: "0123456789", password: "new-pass-123" }));
        harness.assert(reg.result.success === true && typeof (reg.result as { handoffCode?: string }).handoffCode === "string", "Registering with a login: a code", JSON.stringify(reg.result));
        const third = await makePerson("h4c");
        const cont = await withLoginSession(third.login.id, third.team.id, () => withHost(p.domain, () => continueAsClient(p.own.slug)));
        harness.assert(cont.result.success === true && typeof (cont.result as { handoffCode?: string }).handoffCode === "string", "Continuing as a client: a code", JSON.stringify(cont.result));
      });
    } finally {
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T42-SIGNOUT-01: signing out on a custom domain also clears the platform cookie", async () => {
    try {
      await withProd(async () => {
        const p = await makeOnOwnDomain("so1");
        const onDomain = await withLoginSession(p.login.id, p.owner.id, () => withHost(p.domain, () => logoutAction()));
        harness.assert(onDomain.result.success === true && onDomain.result.via?.endsWith("/auth/sign-out") === true, "On the custom domain: told to go through the platform", JSON.stringify(onDomain.result));
        harness.assert(onDomain.calls.some((c) => c.op === "delete" && (c.args[0] === COOKIE_NAME || (c.args[0] as { name?: string })?.name === COOKIE_NAME)), "…and this host's own cookie is deleted");
        const onSub = await withLoginSession(p.login.id, p.owner.id, () => withHost(`${p.own.slug}.${PLATFORM}`, () => logoutAction()));
        harness.assertEqual(onSub.result.via, undefined, "On a subdomain the shared cookie is the only one: no detour");
        const back = `https://${p.domain}/login?signedOut=1`;
        const out = await withLoginSession(p.login.id, p.owner.id, () => withHost(PLATFORM, () => POST_SIGNOUT(postSignOut(back, `https://${p.domain}`))));
        harness.assert(out.calls.some((c) => c.op === "delete" && (c.args[0] as { name?: string })?.name === SHARED_COOKIE_NAME && (c.args[0] as { domain?: string }).domain === PLATFORM), "The shared platform cookie is deleted for the whole domain");
        harness.assertEqual((out.result as Response).headers.get("location"), back, "…then back to the studio");
        // A hostile page (a GET, no Origin, or someone else's Origin) can't sign people out.
        const hostile = [
          ["a plain link (GET)", () => GET_SIGNOUT(new NextRequest(`https://cineflow-os.my/auth/sign-out?next=${encodeURIComponent(back)}`))],
          ["no Origin", () => POST_SIGNOUT(postSignOut(back, null))],
          ["another site's Origin", () => POST_SIGNOUT(postSignOut(back, "https://evil.com"))],
          ["a bad return address", () => POST_SIGNOUT(postSignOut("https://evil.com/", "https://evil.com"))],
        ] as const;
        for (const [what, run] of hostile) {
          const r = await withLoginSession(p.login.id, p.owner.id, () => withHost(PLATFORM, run));
          harness.assert(!r.calls.some((c) => c.op === "delete") && !((r.result as Response).headers.get("location") ?? "").includes("evil.com"), `${what}: the cookie stays, and nobody is sent to a bad address`);
        }
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T42-HANDOFF-05: the forms and sign-out controls use the handoff", async () => {
    for (const f of ["components/auth/studio-login-form.tsx", "components/auth/client-auth-panel.tsx"]) {
      const src = await readFile(f, "utf8");
      harness.assert(/handoffCode/.test(src) && /handoffNavigate\(/.test(src) && !/handoffHref/.test(src), `${f} follows a handoff code by posting a form`);
    }
    for (const f of ["components/admin/admin-user-nav.tsx", "components/account/client-user-nav.tsx", "components/account/client-account-menu.tsx"]) {
      harness.assert(/\.via\b/.test(await readFile(f, "utf8")) && /signOutNavigate\(/.test(await readFile(f, "utf8")), `${f} signs out through the platform when told to`);
    }
    const client = await readFile("lib/auth/handoff-client.ts", "utf8");
    harness.assert(/export function handoffNavigate/.test(client) && /export function signOutNavigate/.test(client) && /method = "POST"/.test(client), "The client helpers post a form");
  });
}
