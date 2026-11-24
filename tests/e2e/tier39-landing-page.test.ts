/**
 * Tier 39: the platform landing page (docs/superpowers/specs/2026-11-24-landing-page-redesign-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, cheapestPlanWith, type PlanFeature } from "@/lib/billing/plans";
import { landingMode, type LandingMode } from "@/lib/landing/mode";
import { publicContactEmail } from "@/lib/landing/contact";
import { BANNED_PHRASES, CHAPTERS, EXTRAS, faqItems, planBadge } from "@/lib/landing/content";

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
}
