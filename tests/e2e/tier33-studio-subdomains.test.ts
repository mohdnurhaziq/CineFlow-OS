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
}
