/**
 * Tier 33: Studio subdomains (docs/superpowers/specs/2026-11-19-studio-subdomains-design.md)
 * With NEXT_PUBLIC_STUDIO_SUBDOMAINS=true, each studio lives at <slug>.<domain>: no /<slug>/ in its
 * addresses, links or emails, one sign-in across the platform domain, and old addresses redirect.
 * With it off (dev, staging), everything stays as it was.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { TestHarness } from "./test-harness";
import {
  APP_BASE_DOMAIN,
  isPlatformHost,
  platformUrl,
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
import { withHost, withRequest } from "./mocks/session";
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
    });
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
}
