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
        ["a stand-alone account's own password", alone, "alone-pass-1"],
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
    harness.assert(/href="\/login"/.test(await readFile("components/saas/saas-navbar.tsx", "utf8")), "The landing page's top bar links to /login");
  });
}
