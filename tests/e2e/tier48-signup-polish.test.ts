/**
 * Tier 48: the rest of the 27 November sign-up walkthrough
 * - A blank tagline stays blank (no "Name — Creative Production Studio" on the studio's page)
 * - Admin tab titles don't say "Studio Studio"
 * - A studio address that doesn't exist is a real "not found", decided before the page starts loading
 * - Field hints can't be mistaken for filled-in values
 * - The sign-up wizard's controls hold up on a phone
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { db } from "@/lib/db";
import { onboardStudio } from "@/lib/actions/onboarding";
import { studioAdminName } from "@/lib/labels";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import { generateMetadata as studioMetadata } from "@/app/[tenantSlug]/page";
import TenantLayout from "@/app/[tenantSlug]/layout";
import { withIp } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8");

/** Every .tsx file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

export async function runTier48SignupPolishTests(harness: TestHarness) {
  harness.setSuite("Tier 48", "Sign-up polish");
  await provideReactGlobal();

  const run = Date.now().toString(36);
  let n = 0;
  const signUp = async (tagline?: string) => {
    n += 1;
    const slug = `t48-${n}-${run}`;
    harness.registerTeardown(async () => {
      await db.tenant.deleteMany({ where: { slug } });
    });
    const res = (await withIp(`10.48.0.${n}`, () =>
      onboardStudio({ name: `T48 Studio ${n}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T48 Owner", ownerEmail: `t48-${n}-${run}@example.test`, password: "password123", tagline } as never)
    )) as { success?: boolean };
    harness.assert(res.success === true, "The studio is created", JSON.stringify(res));
    return slug;
  };
  const titleOf = async (slug: string) => String((await studioMetadata({ params: Promise.resolve({ tenantSlug: slug }), searchParams: Promise.resolve({}) } as never)).title);

  await harness.test("T48-TAG-01: a blank tagline stays blank, on the page and in the tab title; a typed one is kept", async () => {
    const blank = await signUp("   ");
    harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { slug: blank } })).tagline, null, "Blank stays blank");
    harness.assertEqual(await titleOf(blank), "T48 Studio 1", "The tab title is just the studio's name");
    const typed = await signUp("Weddings in Penang");
    harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { slug: typed } })).tagline, "Weddings in Penang", "Typed tagline kept");
    harness.assertEqual(await titleOf(typed), "T48 Studio 2 — Weddings in Penang", "…and in the tab title");
    const wizard = read("app/(saas)/create-studio/page.tsx");
    harness.assert(!wizard.includes("Your cinematic tagline will display here."), "The preview no longer promises a line that may not be there");
    harness.assert(wizard.includes("Your tagline will show here. Leave it blank to show none."), "…and says what happens");
    harness.assert(/line-clamp-2">\s*\{formData\.tagline \|\|/.test(wizard), "The preview has room for that whole line on a phone");
  });

  await harness.test("T48-TITLE-01: admin tab titles don't repeat the word Studio", async () => {
    harness.assertEqual(studioAdminName("Flow Test Studio"), "Flow Test Studio Admin", "Name ends in Studio");
    harness.assertEqual(studioAdminName("haz creatives studio "), "haz creatives studio Admin", "Any case, stray space");
    harness.assertEqual(studioAdminName("Haz Studios"), "Haz Studios Admin", "Plural");
    harness.assertEqual(studioAdminName("Lumina CineWorks"), "Lumina CineWorks Studio Admin", "Otherwise as before");
    harness.assertEqual(studioAdminName("Studio Nine"), "Studio Nine Studio Admin", "Only the last word counts");
    harness.assertEqual(studioAdminName(undefined), "Studio Admin", "No name");
    const left = sources("app").filter((f) => /\}\s*Studio Admin/.test(read(f)));
    harness.assertDeepEqual(left, [], "Every admin page uses it");
  });

  await harness.test("T48-404-01: an address with no studio is refused by the studio layout, above the loading screen", async () => {
    const call = async (tenantSlug: string) => {
      try {
        await TenantLayout({ children: "child", params: Promise.resolve({ tenantSlug }) });
        return "rendered";
      } catch (e) {
        return String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_HTTP_ERROR_FALLBACK;404") ? "notFound" : String(e);
      }
    };
    harness.assertEqual(await call(`no-such-studio-${run}`), "notFound", "Unknown address");
    harness.assertEqual(await call("lumina-cine"), "rendered", "A real studio renders");
    const closed = await signUp();
    await db.tenant.update({ where: { slug: closed }, data: { subscriptionStatus: "CANCELLED" } });
    harness.assertEqual(await call(closed), "rendered", "A closed studio is left to each page to decide, as before");
  });

  await harness.test("T48-FIELD-01: field hints read as hints", async () => {
    const files = [...sources("app"), ...sources("components")];
    harness.assertDeepEqual(files.filter((f) => /placeholder="[•*]{3,}"/.test(read(f))), [], "No password hint that looks like a filled-in password");
    const bare = /placeholder="(Maya Lin|maya@[^"]+|\+60 12-345 6789)"/;
    harness.assertDeepEqual(files.filter((f) => bare.test(read(f))), [], "Example names, emails and numbers say they are examples");
    const wizard = read("app/(saas)/create-studio/page.tsx");
    for (const hint of ["e.g. Maya Lin", "e.g. maya@veloxcinema.com", "At least 8 characters", "e.g. +60 12-345 6789"]) {
      harness.assert(wizard.includes(`placeholder="${hint}"`), `Sign-up hint: ${hint}`);
    }
    for (const f of ["components/auth/studio-login-form.tsx", "components/auth/platform-login-form.tsx", "components/auth/platform-account-login-form.tsx"]) {
      harness.assert(read(f).includes('placeholder="Your password"'), `${f}: sign-in hint`);
    }
  });

  await harness.test("T48-PHONE-01: the wizard's buttons don't squash and are big enough to tap", async () => {
    const wizard = read("app/(saas)/create-studio/page.tsx");
    const backs = wizard.match(/<button[^>]*?\n?[\s\S]{0,260}?← Back to Step \d/g) ?? [];
    harness.assertEqual(backs.length, 3, "Three back buttons");
    harness.assert(backs.every((b) => b.includes("whitespace-nowrap") && b.includes("min-h-11")), "Each stays on one line and is tall enough", backs.join("\n---\n"));
    harness.assertEqual((wizard.match(/flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between/g) ?? []).length, 3, "On a phone the two buttons stack, main one first");
    harness.assert(/COLOR_PRESETS\.map[\s\S]{0,420}min-h-11 sm:min-h-0/.test(wizard), "Colour choices are tall enough on a phone");
    const eye = renderToStaticMarkup(createElement(PasswordVisibilityToggle, { visible: false, onToggle: () => undefined }));
    harness.assert(/\bsize-10\b/.test(eye), "The show-password button is 40px", eye);
  });
}
