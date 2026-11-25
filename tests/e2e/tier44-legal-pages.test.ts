/**
 * Tier 44: Privacy Policy and Terms of Service
 * - Both pages exist on the platform, say who to contact, and render
 * - What the Privacy Policy says is true of the product: the data the code collects, the services it
 *   uses, no analytics or advertising, the Google sign-in scopes
 * - What the Terms say about the trial, the grace period and a paused studio matches the billing code
 * - They are linked from the landing page footer and the sign-up wizard, listed in the sitemap, and no
 *   studio can take /privacy or /terms as its address
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import PrivacyPage from "@/app/(saas)/privacy/page";
import TermsPage from "@/app/(saas)/terms/page";
import sitemap from "@/app/sitemap";
import { RESERVED_SLUGS } from "@/lib/validations/onboarding";
import { publicContactEmail } from "@/lib/landing/contact";
import { GRACE_DAYS, TRIAL_DAYS } from "@/lib/billing/state";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** The page's text as a visitor reads it (tags and entities removed). */
const textOf = (element: unknown) =>
  renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0])
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Every source file under `dir` (skipping build output), for "the product has no X" checks. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

export async function runTier44LegalPagesTests(harness: TestHarness) {
  harness.setSuite("Tier 44", "Privacy Policy and Terms of Service");
  await provideReactGlobal();

  const email = publicContactEmail();
  const privacy = textOf(PrivacyPage());
  const terms = textOf(TermsPage());

  await harness.test("T44-LEGAL-01: both pages render, say when they were written and who to contact", async () => {
    harness.assert(privacy.includes("Privacy Policy"), "The privacy page is titled Privacy Policy");
    harness.assert(terms.includes("Terms of Service"), "The terms page is titled Terms of Service");
    for (const [name, page] of [["Privacy", privacy], ["Terms", terms]] as const) {
      harness.assert(/Last updated \d{1,2} \w+ \d{4}/.test(page), `${name}: says when it was last updated`);
      harness.assert(page.includes(email), `${name}: gives the contact email (${email})`);
    }
    for (const f of ["app/(saas)/privacy/page.tsx", "app/(saas)/terms/page.tsx"]) {
      const src = read(f);
      harness.assert(/export const metadata/.test(src) && !/noindex|index: false/.test(src), `${f}: has a title and can be found by search engines`);
    }
  });

  await harness.test("T44-LEGAL-02: the Privacy Policy says what the product really does", async () => {
    for (const phrase of [
      "Personal Data Protection Act 2010",
      "Toyyibpay",
      "Google",
      "on behalf of the studio",
      "password",
      "one-way",
      "essential cookies",
      "do not sell",
      "backups",
    ]) {
      harness.assert(privacy.includes(phrase), `Privacy mentions "${phrase}"`);
    }
    // It lists the personal details the product stores.
    for (const item of ["name", "email address", "phone number", "bookings", "invoices", "photos and videos"]) {
      harness.assert(privacy.includes(item), `Privacy lists "${item}" as collected`);
    }
    // Google sign-in asks for no more than the sign-in details, and the policy says no more than that.
    harness.assert(/scope: "openid email profile"/.test(read("lib/auth/google.ts")), "Google sign-in still asks only for openid, email and profile");
    harness.assert(privacy.includes("never see your Google password") && privacy.includes("do not get access to your email, files or contacts"), "Privacy says Google sign-in gives us no access to email, files or contacts");
    // "No analytics or advertising" is true of the code.
    const banned = /googletagmanager|gtag\(|google-analytics|plausible\.io|posthog|mixpanel|hotjar|fbq\(|@vercel\/analytics|segment\.com/i;
    const hits: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of sourceFiles(path.join(process.cwd(), dir))) {
        if (banned.test(readFileSync(file, "utf8"))) hits.push(path.relative(process.cwd(), file));
      }
    }
    harness.assert(!banned.test(read("package.json")), "package.json has no analytics or advertising library");
    harness.assertDeepEqual(hits, [], "No source file loads an analytics or advertising script");
    harness.assert(privacy.includes("no advertising or analytics cookies"), "Privacy says there are no advertising or analytics cookies");
  });

  await harness.test("T44-LEGAL-03: the Terms match how plans, the trial and a paused studio work", async () => {
    harness.assert(terms.includes(`${TRIAL_DAYS}-day free trial`), `Terms state the ${TRIAL_DAYS}-day trial the code gives`);
    harness.assert(terms.includes(`${GRACE_DAYS} days`), `Terms state the ${GRACE_DAYS}-day grace period`);
    harness.assert(/paused/i.test(terms) && /read-only/i.test(terms) && /online booking/i.test(terms), "Terms say a paused studio is read-only and closes online booking");
    harness.assert(terms.includes("Malaysian ringgit") || terms.includes("MYR"), "Prices are in Malaysian ringgit");
    harness.assert(/laws of Malaysia/.test(terms), "Malaysian law governs");
    harness.assert(/PDPA|Personal Data Protection Act/.test(terms), "Terms put the studio's own clients' data duties on the studio");
    harness.assert(terms.includes("Privacy Policy"), "Terms point to the Privacy Policy");
  });

  await harness.test("T44-LEGAL-04: linked from the footer and the sign-up wizard, in the sitemap, and the addresses are reserved", async () => {
    const footer = read("components/saas/saas-footer.tsx");
    harness.assert(/<Link[^>]*href="\/privacy"/.test(footer) && /<Link[^>]*href="\/terms"/.test(footer), "The landing page footer links to both");
    const wizard = read("app/(saas)/create-studio/page.tsx");
    harness.assert(/href="\/terms"/.test(wizard) && /href="\/privacy"/.test(wizard), "The sign-up wizard's last step links to both");
    harness.assert(RESERVED_SLUGS.has("privacy") && RESERVED_SLUGS.has("terms"), "No studio can take /privacy or /terms as its address");
    const urls = (await sitemap()).map((e) => e.url);
    harness.assert(urls.some((u) => u.endsWith("/privacy")) && urls.some((u) => u.endsWith("/terms")), "Both pages are in the sitemap");
  });
}
