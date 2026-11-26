/**
 * Tier 33: Studio subdomains (docs/superpowers/specs/2026-11-19-studio-subdomains-design.md)
 * With NEXT_PUBLIC_STUDIO_SUBDOMAINS=true, each studio lives at <slug>.<domain>: no /<slug>/ in its
 * addresses, links or emails, one sign-in across the platform domain, and old addresses redirect.
 * With it off (dev, staging), everything stays as it was.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import nodemailer, { type Transporter } from "nodemailer";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { requestPasswordReset } from "@/lib/actions/password-reset";
import { sendBookingConfirmation } from "@/lib/bookings/confirmation-email";
import { sendInvoiceReminder } from "@/lib/actions/admin-invoices";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { visibleNavItems } from "@/components/admin/admin-nav-items";
import { FULL_ACCESS } from "@/lib/auth/access";
import { ShowcaseNav } from "@/components/showcase/showcase-nav";
import { ShowcaseFooter } from "@/components/showcase/showcase-footer";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { productionSettingProblems } from "@/lib/production-settings";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import {
  APP_BASE_DOMAIN,
  isPlatformHost,
  isStudioPath,
  platformUrl,
  studioLink,
  studioPath,
  studioSubdomainOf,
  studioSubdomainsOn,
  studioUrl,
} from "@/lib/domain-name";
import { RESERVED_SLUGS } from "@/lib/validations/onboarding";
import { checkSlugAvailability } from "@/lib/actions/onboarding";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { middleware } from "@/middleware";
import { COOKIE_NAME, SHARED_COOKIE_NAME, createSessionToken, sessionCookieFor, setSessionCookie, type SessionUser } from "@/lib/auth/token";
import { getCurrentUser, logoutAction } from "@/lib/auth/session";
import { withHost, withRequest, withSession } from "./mocks/session";
import { signInTarget } from "@/lib/auth/sign-in-target";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Runs `fn` with studio subdomains switched on or off, then puts the setting back. */
export async function withSubdomains<T>(on: boolean, fn: () => Promise<T> | T): Promise<T> {
  const saved = process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
  process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = on ? "true" : "false";
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
    else process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = saved;
  }
}


/** Every .ts/.tsx file under `dir` (relative to the project). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(path.join(ROOT, d))) {
      const rel = `${d}/${name}`;
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
    }
  };
  walk(dir);
  return out;
}

/**
 * Studio links built by hand (`/${slug}…` or `${appUrl}/${slug}…`) instead of through studioPath /
 * studioUrl. Cache refreshes (revalidatePath, safeRevalidate, revalidate([...]) and the path lists
 * fed to them) keep the internal /<slug>/ route path on purpose, so they're allowed.
 */
export function handBuiltStudioLinks(files: string[]): string[] {
  const link = /`\/\$\{[^}`]*[sS]lug[^}`]*\}|\$\{[^}`]*(APP_URL|appUrl|baseUrl)[^}`]*\}\/\$\{[^}`]*[sS]lug/;
  const refresh = /revalidat|^\s*(for \(const path of \[|const paths = \[)|paths\.push\(/i;
  const found: string[] = [];
  for (const file of files) {
    if (file === "lib/domain-name.ts") continue;
    let inRefreshCall = false;
    read(file).split(/\r?\n/).forEach((line, i) => {
      if (inRefreshCall) {
        if (/^\s*\);?\s*$/.test(line)) inRefreshCall = false;
        return;
      }
      if (/[rR]evalidate\w*\(\s*$/.test(line)) {
        inRefreshCall = true;
        return;
      }
      if (link.test(line) && !refresh.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  return found;
}

const B = APP_BASE_DOMAIN;
const U = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export async function runTier33StudioSubdomainsTests(harness: TestHarness) {
  harness.setSuite("Tier 33", "Studio subdomains");

  await harness.test("T33-HELP-01: with subdomains off, studio addresses keep the studio name in the path", async () => {
    await withSubdomains(false, () => {
      harness.assertEqual(studioSubdomainsOn(), false, "Off");
      harness.assertEqual(studioPath("lumina-cine", "/book?x=1#a"), "/lumina-cine/book?x=1#a", "Path keeps the slug, query and fragment");
      harness.assertEqual(studioPath("lumina-cine"), "/lumina-cine", "The studio's home");
      harness.assertEqual(studioUrl("lumina-cine", "/book"), `${U}/lumina-cine/book`, "Absolute address on the platform");
      harness.assertEqual(platformUrl("/create-studio"), "/create-studio", "Platform pages stay relative");
      harness.assertEqual(studioLink("lumina-cine", "/book"), "/lumina-cine/book", "A platform page links to a studio by its path");
    });
  });

  await harness.test("T33-HELP-02: with subdomains on, a studio's address is its subdomain", async () => {
    await withSubdomains(true, () => {
      const app = new URL(U);
      harness.assertEqual(studioSubdomainsOn(), true, "On");
      harness.assertEqual(studioPath("lumina-cine", "/book?x=1#a"), "/book?x=1#a", "No slug in the path");
      harness.assertEqual(studioPath("lumina-cine"), "/", "The studio's home is /");
      harness.assertEqual(studioUrl("lumina-cine", "/book"), `${app.protocol}//lumina-cine.${app.host}/book`, "Absolute address on the subdomain");
      harness.assertEqual(platformUrl("/create-studio"), `${U}/create-studio`, "Platform pages are absolute, off the subdomain");
      harness.assertEqual(studioLink("lumina-cine", "/book"), studioUrl("lumina-cine", "/book"), "A platform page links to a studio by its subdomain");
    });
    harness.assertEqual(studioSubdomainOf(`lumina-cine.${B}:3000`), "lumina-cine", "A studio subdomain, port ignored");
    harness.assertEqual(studioSubdomainOf(`www.${B}`), null, "www isn't a studio");
    harness.assertEqual(studioSubdomainOf(`app.${B}`), null, "app isn't a studio");
    harness.assertEqual(studioSubdomainOf("studio.com"), null, "Another domain isn't a subdomain");
    harness.assert(isPlatformHost(`www.${B}`) && isPlatformHost(`app.${B}`) && isPlatformHost(`${B}:3000`), "The platform's own hosts");
    harness.assert(!isPlatformHost("studio.com") && !isPlatformHost(`lumina-cine.${B}`), "…and not a studio's");
  });

  await harness.test("T33-HELP-03: names that would clash with real addresses or studio pages can't be taken", async () => {
    const names = [
      "www", "app", "staging", "mail", "email", "send", "smtp", "imap", "pop", "ftp", "cdn", "static", "assets",
      "status", "help", "support", "docs", "blog", "dev", "test", "ns1", "ns2", "autoconfig", "autodiscover",
      "account", "admin", "book", "checkout", "forgot-password", "login", "my-booking", "proposals", "register",
      "releases", "reset-password", "set-hud", "vault", "visualizer",
    ];
    harness.assertDeepEqual(names.filter((n) => !RESERVED_SLUGS.has(n)), [], "Every one is reserved");
    for (const slug of ["staging", "book", "www"]) {
      const res = await checkSlugAvailability(slug);
      harness.assert(!res.available, `${slug} is refused`, JSON.stringify(res));
    }
  });

  await harness.test("T33-HELP-04: the switch is built in, on for production and off for staging", async () => {
    const dockerfile = read("Dockerfile");
    harness.assert(/^ARG NEXT_PUBLIC_STUDIO_SUBDOMAINS=false$/m.test(dockerfile), "Dockerfile build arg, off by default");
    harness.assert(/NEXT_PUBLIC_STUDIO_SUBDOMAINS=\$NEXT_PUBLIC_STUDIO_SUBDOMAINS/.test(dockerfile), "…passed into the build");
    harness.assert(read("docker-compose.yml").includes("NEXT_PUBLIC_STUDIO_SUBDOMAINS: ${NEXT_PUBLIC_STUDIO_SUBDOMAINS:-false}"), "Compose passes it from .env");
    harness.assert(/^NEXT_PUBLIC_STUDIO_SUBDOMAINS=true$/m.test(read(".env.production.example")), "On in production's example");
    harness.assert(!/^NEXT_PUBLIC_STUDIO_SUBDOMAINS=true$/m.test(read(".env.staging.example")), "Not on in staging's");
  });

  // ── Task 2: one sign-in across the platform domain ─────────────────────────

  const owner = await db.user.findFirstOrThrow({ where: { email: "alex@luminacine.com" }, include: { tenant: true } });
  const ownerUser: SessionUser = {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    tenantId: owner.tenantId,
    tenantSlug: owner.tenant?.slug ?? null,
  };
  const studioHost = `lumina-cine.${B}`;

  await harness.test("T33-COOKIE-01: the sign-in cookie is shared on the platform domain only when subdomains are on", async () => {
    await withSubdomains(false, () => {
      for (const host of [studioHost, B, "studio.com"]) {
        harness.assertDeepEqual(sessionCookieFor(host), { name: COOKIE_NAME }, `Off: today's cookie on ${host}`);
      }
    });
    await withSubdomains(true, () => {
      for (const host of [B, `${studioHost}:443`, `www.${B}`]) {
        harness.assertDeepEqual(sessionCookieFor(host), { name: SHARED_COOKIE_NAME, domain: B }, `On: shared on ${host}`);
      }
      harness.assertDeepEqual(sessionCookieFor("studio.com"), { name: COOKIE_NAME }, "On: a studio's own domain keeps its own");
    });
    harness.assertEqual(SHARED_COOKIE_NAME, "cineflow_session_shared", "The shared cookie's name");
  });

  await harness.test("T33-COOKIE-02: sign-in, reading and sign-out use the cookie that belongs to the host", async () => {
    const token = await createSessionToken(ownerUser);
    await withSubdomains(true, async () => {
      const read = (host: string, name: string) =>
        withRequest(async (jar) => {
          jar.set(name, token);
          return (await withHost(host, () => getCurrentUser())).result;
        });
      harness.assertEqual((await read(studioHost, SHARED_COOKIE_NAME))?.id, owner.id, "Subdomain: the shared cookie signs you in");
      harness.assertEqual(await read(studioHost, COOKIE_NAME), null, "…the old one doesn't");
      harness.assertEqual((await read("studio.com", COOKIE_NAME))?.id, owner.id, "A studio's own domain: its own cookie");
      harness.assertEqual(await read("studio.com", SHARED_COOKIE_NAME), null, "…not the shared one");

      const signIn = await withRequest(() => withHost(studioHost, () => setSessionCookie(ownerUser)));
      const set = signIn.calls.find((c) => c.op === "set");
      harness.assertEqual(set?.args[0], SHARED_COOKIE_NAME, "Signing in sets the shared cookie");
      harness.assertEqual((set?.args[2] as { domain?: string } | undefined)?.domain, B, "…for the whole domain");
      harness.assertEqual((set?.args[2] as { httpOnly?: boolean } | undefined)?.httpOnly, true, "…still httpOnly");

      const signOut = await withRequest(() => withHost(studioHost, () => logoutAction()));
      harness.assertDeepEqual(
        signOut.calls.find((c) => c.op === "delete")?.args[0],
        { name: SHARED_COOKIE_NAME, domain: B, path: "/" },
        "Signing out deletes the shared cookie with its domain"
      );

      const mw = (cookieName: string) =>
        middleware(new NextRequest(`http://${studioHost}/admin`, { headers: { host: studioHost, cookie: `${cookieName}=${token}` } }));
      const shared = await mw(SHARED_COOKIE_NAME);
      harness.assert(!(shared.headers.get("location") ?? "").includes("/login"), "Middleware: the shared cookie lets the owner into admin", shared.headers.get("location") ?? "");
      const old = await mw(COOKIE_NAME);
      harness.assert((old.headers.get("location") ?? "").includes("/login"), "…the old cookie on a subdomain doesn't", old.headers.get("location") ?? "");
    });
  });

  // ── Task 3: redirects and sign-in paths ────────────────────────────────────

  const app = new URL(U);
  const port = app.port ? `:${app.port}` : "";
  const hostOf = (sub: string | null) => `${sub ? `${sub}.` : ""}${B}${port}`;
  const req = (sub: string | null, pathAndQuery: string, cookie?: string) =>
    middleware(
      new NextRequest(`${app.protocol}//${hostOf(sub)}${pathAndQuery}`, {
        headers: { host: hostOf(sub), ...(cookie ? { cookie } : {}) },
      })
    );
  const loc = (res: Response) => res.headers.get("location");

  await harness.test("T33-MW-01: www. and app. send you to the platform's own address", async () => {
    await withSubdomains(true, async () => {
      for (const sub of ["www", "app"]) {
        const res = await req(sub, "/pricing?a=1");
        harness.assertEqual(res.status, 308, `${sub}.: permanent redirect`);
        // To NEXT_PUBLIC_APP_URL (in production its host is the domain itself; Task 7 checks they agree).
        harness.assertEqual(loc(res), `${app.origin}/pricing?a=1`, `${sub}.: same path and query on the platform`);
      }
    });
  });

  await harness.test("T33-MW-02: an old studio address on the platform redirects to the studio's subdomain", async () => {
    await withSubdomains(true, async () => {
      const book = await req(null, "/lumina-cine/book?d=1");
      harness.assertEqual(book.status, 308, "Permanent redirect");
      harness.assertEqual(loc(book), `${app.protocol}//lumina-cine.${app.host}/book?d=1`, "To the same page and query on the subdomain");
      harness.assertEqual(loc(await req(null, "/lumina-cine")), `${app.protocol}//lumina-cine.${app.host}/`, "The studio's home");
      harness.assertEqual(loc(await req(null, "/no-such-studio/book")), null, "A name that isn't a studio isn't redirected");
      harness.assertEqual(loc(await req(null, "/create-studio")), null, "Platform pages aren't redirected");
    });
  });

  await harness.test("T33-MW-03: on a subdomain the studio name never stays in the path", async () => {
    await withSubdomains(true, async () => {
      const prefixed = await req("lumina-cine", "/lumina-cine/book?d=1");
      harness.assertEqual(prefixed.status, 308, "A path that still carries the name is redirected");
      harness.assertEqual(loc(prefixed), `${app.protocol}//${hostOf("lumina-cine")}/book?d=1`, "…without it");
      harness.assertEqual(loc(await req("lumina-cine", "/lumina-cine")), `${app.protocol}//${hostOf("lumina-cine")}/`, "The bare name goes to /");
      const book = await req("lumina-cine", "/book");
      harness.assert((book.headers.get("x-middleware-rewrite") ?? "").endsWith("/lumina-cine/book"), "/book shows the studio's booking page", book.headers.get("x-middleware-rewrite") ?? "");
      const similar = await req("lumina-cine", "/lumina-cinema-tips");
      harness.assertEqual(loc(similar), null, "A path that only starts with the same letters isn't stripped");
      harness.assert((similar.headers.get("x-middleware-rewrite") ?? "").endsWith("/lumina-cine/lumina-cinema-tips"), "…it's served as a studio page");
      // A reset or invite link carries its token in the query: the page must still get it.
      const reset = await req("lumina-cine", "/reset-password?token=abc&email=a%40b.c");
      harness.assert(
        (reset.headers.get("x-middleware-rewrite") ?? "").endsWith("/lumina-cine/reset-password?token=abc&email=a%40b.c"),
        "The query string reaches the studio's page",
        reset.headers.get("x-middleware-rewrite") ?? ""
      );
    });
    const own = await middleware(new NextRequest("http://studio.luminacine.com/checkout?invoiceId=inv_1", { headers: { host: "studio.luminacine.com" } }));
    harness.assert(
      (own.headers.get("x-middleware-rewrite") ?? "").endsWith("/lumina-cine/checkout?invoiceId=inv_1"),
      "On a studio's own domain too (subdomains on or off)",
      own.headers.get("x-middleware-rewrite") ?? ""
    );
  });

  await harness.test("T33-MW-04: signing in to a studio's admin keeps clean addresses", async () => {
    const clientUser = await db.user.findFirstOrThrow({ where: { role: "CLIENT", tenant: { slug: "lumina-cine" } }, include: { tenant: true } });
    const clientToken = await createSessionToken({
      id: clientUser.id, email: clientUser.email, name: clientUser.name, role: clientUser.role,
      tenantId: clientUser.tenantId, tenantSlug: "lumina-cine",
    });
    await withSubdomains(true, async () => {
      const anon = await req("lumina-cine", "/admin/invoices?x=1");
      harness.assertEqual(loc(anon), `${app.protocol}//${hostOf("lumina-cine")}/login?callbackUrl=%2Fadmin%2Finvoices%3Fx%3D1`, "Signed out: to the studio's sign-in, coming back to the same page");
      const client = await req("lumina-cine", "/admin", `${SHARED_COOKIE_NAME}=${clientToken}`);
      harness.assertEqual(loc(client), `${app.protocol}//${hostOf("lumina-cine")}/account`, "A client: to their account");
      const own = await middleware(new NextRequest("http://studio.luminacine.com/admin/invoices", { headers: { host: "studio.luminacine.com" } }));
      harness.assertEqual(loc(own), "http://studio.luminacine.com/login?callbackUrl=%2Fadmin%2Finvoices", "On a studio's own domain too");
    });
  });

  await harness.test("T33-MW-05: unknown studios, the API and uploads aren't redirected", async () => {
    await withSubdomains(true, async () => {
      const nope = await req("nope", "/book");
      harness.assertEqual(loc(nope), null, "An unknown studio: no redirect loop");
      harness.assert((nope.headers.get("x-middleware-rewrite") ?? "").endsWith("/nope/book"), "…its page shows not found");
      for (const p of ["/api/health", "/uploads/x.png"]) {
        for (const sub of [null, "lumina-cine", "www"]) {
          const res = await req(sub, p);
          harness.assertEqual(loc(res), null, `${p} on ${hostOf(sub)} isn't redirected`);
          harness.assertEqual(res.headers.get("x-middleware-rewrite"), null, "…or rewritten");
        }
      }
    });
  });

  await harness.test("T33-MW-06: where sign-in takes you, with clean paths and no way out of the studio", async () => {
    await withSubdomains(true, () => {
      const t = (role: string, callbackUrl?: string | null) => signInTarget({ role, tenantSlug: "lumina-cine", callbackUrl });
      harness.assertEqual(t("PHOTOGRAPHER"), "/admin/schedule", "Team member: My schedule");
      harness.assertEqual(t("STUDIO_OWNER"), "/admin", "Owner: Overview");
      harness.assertEqual(t("CLIENT"), "/account", "Client: their account");
      harness.assertEqual(t("STUDIO_OWNER", "/admin/invoices/1?x=1"), "/admin/invoices/1?x=1", "A page in the studio is kept");
      for (const bad of ["//evil.com", "https://evil.com/admin", "/../admin", "", "/\\evil.com"]) {
        harness.assertEqual(t("STUDIO_OWNER", bad), "/admin", `Refused: ${JSON.stringify(bad)}`);
      }
      harness.assertEqual(t("CLIENT", "/admin/x"), "/account", "A client never into admin");
    });
    await withSubdomains(false, () => {
      harness.assertEqual(signInTarget({ role: "STUDIO_OWNER", tenantSlug: "lumina-cine" }), "/lumina-cine/admin", "Off: unchanged");
      harness.assertEqual(signInTarget({ role: "STUDIO_OWNER", tenantSlug: "lumina-cine", callbackUrl: "/lumina-cine/admin/x" }), "/lumina-cine/admin/x", "Off: callback unchanged");
    });
  });

  // ── Task 4: emails and server-side links ────────────────────────────────────

  await harness.test("T33-LINK-01: emails link to the studio's subdomain when it's on, and to the old address when it's off", async () => {
    const savedHost = process.env.SMTP_HOST;
    const savedPort = process.env.SMTP_PORT;
    process.env.SMTP_HOST = "smtp.links.test";
    process.env.SMTP_PORT = "587";
    const outbox: { to: string; subject: string; html: string; text: string }[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({
      sendMail: async (mail: { to: string; subject: string; html: string; text: string }) => {
        outbox.push(mail);
        return json.sendMail(mail);
      },
    } as unknown as Transporter);
    try {
      const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
      const client = await db.user.findFirstOrThrow({ where: { role: "CLIENT", tenantId: tenant.id }, orderBy: { createdAt: "desc" } });
      const booking = await db.clientBooking.findFirstOrThrow({ where: { tenantId: tenant.id } });
      const invoice = await db.milestoneInvoice.findFirstOrThrow({ where: { tenantId: tenant.id, status: { in: ["PENDING", "OVERDUE", "REJECTED"] } } });
      const sendAll = async () => {
        outbox.length = 0;
        await requestPasswordReset({ tenantSlug: "lumina-cine", email: client.email });
        await sendBookingConfirmation(booking.id);
        const reminder = await withSession(ownerUser, () => sendInvoiceReminder({ tenantId: tenant.id, tenantSlug: "lumina-cine", invoiceId: invoice.id }));
        harness.assert(reminder.success, "The invoice reminder was sent", JSON.stringify(reminder));
        return outbox.map((m) => `${m.subject}\n${m.html}`);
      };
      const subHost = `lumina-cine.${new URL(U).host}`;
      const on = await withSubdomains(true, sendAll);
      harness.assert(on.length >= 3, "Reset, booking and invoice emails went out", String(on.length));
      for (const mail of on) {
        const subject = mail.split("\n")[0];
        harness.assert(mail.includes(subHost), `On: "${subject}" links to ${subHost}`);
        harness.assert(!mail.includes("/lumina-cine/") && !mail.includes("/lumina-cine?"), `On: "${subject}" has no /lumina-cine/ path`);
      }
      const off = await withSubdomains(false, sendAll);
      for (const mail of off) {
        harness.assert(mail.includes(`${U}/lumina-cine/`), `Off: "${mail.split("\n")[0]}" keeps ${U}/lumina-cine/`);
      }
    } finally {
      setSmtpTransportForTests(null);
      if (savedHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = savedHost;
      if (savedPort === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = savedPort;
    }
  });

  await harness.test("T33-LINK-02: server code builds no studio link by hand", async () => {
    const files = [...sourceFiles("lib"), ...sourceFiles("app").filter((f) => /(\/route\.ts|actions?[^/]*\.ts|\/sitemap\.ts)$/.test(f))];
    const found = handBuiltStudioLinks(files);
    harness.assert(found.length === 0, "Every studio link goes through studioPath / studioUrl", found.join("\n"));
  });

  // ── Task 5: pages and components ─────────────────────────────────────────────

  await harness.test("T33-PAGE-01: pages and components build no studio link by hand", async () => {
    const found = handBuiltStudioLinks([...sourceFiles("app"), ...sourceFiles("components")]);
    harness.assert(found.length === 0, "Every studio link goes through studioPath / studioUrl", found.join("\n"));
  });

  await harness.test("T33-PAGE-02: studio pages link within the studio, and out to the platform by its full address", async () => {
    await provideReactGlobal();
    const tenant = { name: "Lumina CineWorks", slug: "lumina-cine", discipline: "HYBRID", currency: "MYR", brandColor: null };
    const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    const internal = (hrefs: string[]) => hrefs.filter((h) => h.startsWith("/"));
    const menuHrefs = () =>
      visibleNavItems("lumina-cine", FULL_ACCESS, true).flatMap((e) => (e.kind === "group" ? e.items.map((i) => i.href) : [e.href]));
    const pageHrefs = () => [
      ...hrefsOf(renderToStaticMarkup(ShowcaseNav({ tenant }) as Parameters<typeof renderToStaticMarkup>[0])),
      ...hrefsOf(renderToStaticMarkup(ShowcaseFooter({ tenant }) as Parameters<typeof renderToStaticMarkup>[0])),
    ];

    await withSubdomains(true, () => {
      const menu = menuHrefs();
      harness.assert(menu.length > 5 && menu.every((h) => h.startsWith("/admin")), "On: the admin menu links to /admin/…", menu.join(" "));
      const hrefs = pageHrefs();
      harness.assert(internal(hrefs).length > 2, "On: the showcase has studio links", hrefs.join(" "));
      harness.assert(!hrefs.some((h) => h.startsWith("/lumina-cine")), "On: none carries the studio name", hrefs.join(" "));
      harness.assert(hrefs.includes(`${U}/`), "On: the platform home is linked by its full address", hrefs.join(" "));
      harness.assert(hrefs.filter((h) => h === `${U}/`).length === 1, "On: the one platform link (the footer's credit) is a full address; the website bar has none", hrefs.join(" "));
    });
    await withSubdomains(false, () => {
      harness.assert(menuHrefs().every((h) => h.startsWith("/lumina-cine/admin")), "Off: the menu keeps /lumina-cine/admin");
      const hrefs = internal(pageHrefs()).filter((h) => h !== "/");
      harness.assert(hrefs.length > 2 && hrefs.every((h) => h.startsWith("/lumina-cine")), "Off: showcase links keep /lumina-cine", hrefs.join(" "));
    });
  });

  await harness.test("T33-PAGE-03: studio pages never link to the platform with a bare path", async () => {
    const studioFiles = [
      ...sourceFiles("app/[tenantSlug]"),
      // Shown on every host, studio subdomains included (an unknown studio's address too).
      "app/not-found.tsx",
      ...["showcase", "account", "admin", "booking", "checkout", "vault", "auth"].flatMap((d) => sourceFiles(`components/${d}`)),
    ];
    const bare = /href=["'](\/|\/create-studio|\/super-admin[^"']*)["']/;
    const found: string[] = [];
    for (const file of studioFiles) {
      read(file).split(/\r?\n/).forEach((line, i) => {
        if (bare.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    harness.assert(found.length === 0, "Platform links from studio pages use platformUrl", found.join("\n"));
  });

  await harness.test("T33-PAGE-04: a 'continue to' address is only ever a page of this studio", async () => {
    await withSubdomains(true, () => {
      for (const ok of ["/account", "/proposals/1?x=1", "/"]) harness.assert(isStudioPath("lumina-cine", ok), `On: ${ok} is allowed`);
      for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", ""]) {
        harness.assert(!isStudioPath("lumina-cine", bad), `On: ${JSON.stringify(bad)} is refused`);
      }
    });
    await withSubdomains(false, () => {
      for (const ok of ["/lumina-cine", "/lumina-cine/account", "/lumina-cine?x=1"]) harness.assert(isStudioPath("lumina-cine", ok), `Off: ${ok} is allowed`);
      for (const bad of ["/lumina-cinema/account", "/apex-media/account", "//evil.com", "/lumina-cine\\..\\x", "/account"]) {
        harness.assert(!isStudioPath("lumina-cine", bad), `Off: ${JSON.stringify(bad)} is refused`);
      }
    });
  });

  // ── Task 6: search engines per host ─────────────────────────────────────────

  const urlsOf = (map: { url: string }[]) => map.map((e) => e.url);
  const rulesOf = (r: Awaited<ReturnType<typeof robots>>) => {
    const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules)!;
    const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    return { allow: list(rule.allow), disallow: list(rule.disallow), sitemap: r.sitemap };
  };

  await harness.test("T33-SEO-01: with subdomains off, sitemap and robots stay as they were", async () => {
    await withSubdomains(false, async () => {
      const tenants = await db.tenant.findMany({ select: { slug: true } });
      const urls = urlsOf(await withHost(B, () => sitemap()).then((r) => r.result));
      harness.assert(urls.includes(U) && urls.includes(`${U}/create-studio`), "Platform pages listed");
      for (const t of tenants) {
        for (const p of ["", "/book", "/visualizer"]) harness.assert(urls.includes(`${U}/${t.slug}${p}`), `Lists ${U}/${t.slug}${p}`);
      }
      const r = rulesOf((await withHost(B, () => robots())).result);
      harness.assert(r.disallow.includes("/*/admin") && r.disallow.includes("/api/"), "Robots keeps its studio-path rules", r.disallow.join(" "));
      harness.assertEqual(r.sitemap, `${U}/sitemap.xml`, "Points at the platform sitemap");
    });
  });

  await harness.test("T33-SEO-02: with subdomains on, the platform and each studio list only their own pages", async () => {
    await withSubdomains(true, async () => {
      const platform = urlsOf((await withHost(B, () => sitemap())).result);
      harness.assertDeepEqual(platform, [U, `${U}/create-studio`, `${U}/privacy`, `${U}/terms`], "Platform sitemap: its own pages only");
      const pr = rulesOf((await withHost(B, () => robots())).result);
      harness.assert(pr.allow.includes("/"), "Platform robots allows its pages");
      harness.assert(pr.disallow.includes("/api/") && pr.disallow.includes("/super-admin"), "…and keeps the API and console out", pr.disallow.join(" "));
      harness.assertEqual(pr.sitemap, `${U}/sitemap.xml`, "…pointing at its own sitemap");

      const host = `lumina-cine.${B}`;
      const studio = urlsOf((await withHost(host, () => sitemap())).result);
      harness.assertDeepEqual(
        studio,
        [studioUrl("lumina-cine", "/"), studioUrl("lumina-cine", "/book"), studioUrl("lumina-cine", "/visualizer")],
        "Studio sitemap: its public pages at clean addresses"
      );
      const sr = rulesOf((await withHost(host, () => robots())).result);
      for (const p of ["/admin", "/checkout", "/vault", "/account", "/proposals", "/set-hud", "/releases"]) {
        harness.assert(sr.disallow.includes(p) && sr.disallow.includes(`${p}/*`), `Studio robots keeps ${p} out`, sr.disallow.join(" "));
      }
      harness.assertEqual(sr.sitemap, studioUrl("lumina-cine", "/sitemap.xml"), "…pointing at the studio's own sitemap");

      harness.assertDeepEqual((await withHost(`nope.${B}`, () => sitemap())).result, [], "An unknown studio lists nothing");

      const saved = process.env.APP_ENV;
      process.env.APP_ENV = "staging";
      try {
        const st = rulesOf((await withHost(host, () => robots())).result);
        harness.assertDeepEqual(st.disallow, ["/"], "Staging still keeps everything out");
      } finally {
        if (saved === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = saved;
      }
    });
  });

  // ── Task 7: production's settings agree ──────────────────────────────────────

  await harness.test("T33-ENV-01: production refuses studio subdomains when its domain and address disagree", async () => {
    const good = {
      APP_ENV: "production",
      AUTH_SECRET: "k".repeat(20) + "Q9".repeat(10),
      NEXT_PUBLIC_APP_URL: "https://cineflow-os.app",
      NEXT_PUBLIC_APP_DOMAIN: "cineflow-os.app",
      NEXT_PUBLIC_STUDIO_SUBDOMAINS: "true",
      RESEND_API_KEY: "re_123",
      RESEND_FROM_EMAIL: "CineFlow OS <hello@cineflow-os.app>",
    };
    harness.assertDeepEqual(productionSettingProblems(good), [], "Domain and address agree: fine");
    harness.assertDeepEqual(productionSettingProblems({ ...good, NEXT_PUBLIC_APP_DOMAIN: "www.cineflow-os.app" }), [], "A www. form is the same domain");
    const bad = productionSettingProblems({ ...good, NEXT_PUBLIC_APP_DOMAIN: "app.cineflow-os.app" });
    harness.assertEqual(bad.length, 1, "Disagreeing: one problem", bad.join(" | "));
    harness.assert(bad[0]!.includes("NEXT_PUBLIC_APP_DOMAIN") && bad[0]!.includes("NEXT_PUBLIC_STUDIO_SUBDOMAINS"), "…naming the settings", bad[0]);
    harness.assertDeepEqual(
      productionSettingProblems({ ...good, NEXT_PUBLIC_APP_DOMAIN: "app.cineflow-os.app", NEXT_PUBLIC_STUDIO_SUBDOMAINS: "false" }),
      [],
      "Subdomains off: not checked"
    );
  });

  await harness.test("T33-PAGE-05: no studio address is typed out by hand", async () => {
    const slugs = (await db.tenant.findMany({ select: { slug: true } })).map((t) => t.slug);
    // Slugs are lowercase letters, digits and hyphens: nothing to escape.
    const typed = new RegExp(`["'\`]/(${slugs.join("|")})(["'\`/?#])`);
    const found: string[] = [];
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      read(file).split(/\r?\n/).forEach((line, i) => {
        if (typed.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    harness.assert(found.length === 0, "Links to a studio go through studioUrl / studioPath", found.join("\n"));
  });

  // ── Final review fixes ───────────────────────────────────────────────────────

  await harness.test("T33-FIX-01: a 'continue to' address with a tab or line break can't lead off the site", async () => {
    // The URL parser drops tabs and line breaks: "/\t/evil.com" becomes "//evil.com".
    const sneaky = ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com", "\t//evil.com"];
    await withSubdomains(true, () => {
      for (const bad of sneaky) {
        harness.assertEqual(signInTarget({ role: "STUDIO_OWNER", tenantSlug: "lumina-cine", callbackUrl: bad }), "/admin", `On: sign-in refuses ${JSON.stringify(bad)}`);
        harness.assert(!isStudioPath("lumina-cine", bad), `On: continue-to refuses ${JSON.stringify(bad)}`);
      }
    });
    await withSubdomains(false, () => {
      for (const bad of ["/lumina-cine\t/x", "/lumina-cine/\n/evil.com"]) {
        harness.assert(!isStudioPath("lumina-cine", bad), `Off: continue-to refuses ${JSON.stringify(bad)}`);
      }
    });
    const form = read("components/auth/studio-login-form.tsx");
    harness.assert(form.includes("isSafeRelativePath(rawCallback)"), "The sign-in form uses the same check for its callback");
  });

  await harness.test("T33-FIX-02: a studio can't take a reserved name by renaming itself, and reserved names never redirect", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    for (const name of ["super-admin", "create-studio", "www", "book"]) {
      const res = await withSession(ownerUser, () => updateStudioSettings({ tenantId: tenant.id, tenantSlug: "lumina-cine", newSlug: name }));
      harness.assert(!res.success, `Renaming to ${name} is refused`, JSON.stringify(res));
    }
    harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).slug, "lumina-cine", "The studio keeps its address");

    // Even if a studio already has a reserved name (made before the rule), the platform page wins.
    // (super-admin: a name no earlier test looked up, so the studio lookup's cache can't answer for it.)
    const squatter = await db.tenant.create({ data: { name: "T33 Squatter", slug: "super-admin" } });
    try {
      await withSubdomains(true, async () => {
        const res = await req(null, "/super-admin/login");
        harness.assertEqual(loc(res), null, "<domain>/super-admin/login stays the platform's page");
      });
    } finally {
      await db.tenant.delete({ where: { id: squatter.id } });
    }
  });

  await harness.test("T33-FIX-03: with studio subdomains, production's address must be the bare domain", async () => {
    const base = {
      APP_ENV: "production",
      AUTH_SECRET: "k".repeat(20) + "Q9".repeat(10),
      NEXT_PUBLIC_STUDIO_SUBDOMAINS: "true",
      RESEND_API_KEY: "re_123",
      RESEND_FROM_EMAIL: "CineFlow OS <hello@cineflow-os.app>",
    };
    const check = (url: string, domain: string) => productionSettingProblems({ ...base, NEXT_PUBLIC_APP_URL: url, NEXT_PUBLIC_APP_DOMAIN: domain });
    harness.assertDeepEqual(check("https://cineflow-os.app", "cineflow-os.app"), [], "Bare domain: fine");
    const refused: [string, string][] = [
      ["https://www.cineflow-os.app", "cineflow-os.app"],
      ["https://www.cineflow-os.app", "www.cineflow-os.app"],
      ["https://app.cineflow-os.app", "app.cineflow-os.app"],
    ];
    for (const [url, domain] of refused) {
      const problems = check(url, domain);
      harness.assertEqual(problems.length, 1, `Refused: ${url} with ${domain} (www. and app. redirect to the bare domain)`, problems.join(" | "));
    }
  });
}
