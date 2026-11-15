/**
 * Tier 21: The admin manual
 * - Every topic the manual lists has a page, and the index links to each one
 * - The slot-hold page states the numbers the code really uses (so the manual can't drift)
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { MANUAL_TOPICS } from "@/lib/manual/topics";
import { SLOT_HOLD_MINUTES, SLOT_HOLD_NUDGE_SECONDS } from "@/lib/bookings/hold";
import { ONLINE_HOLD_MINUTES } from "@/lib/payments/settle";
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";
import ManualIndexPage from "@/app/[tenantSlug]/admin/manual/page";
import SlotHoldManualPage from "@/app/[tenantSlug]/admin/manual/slot-hold/page";

export async function runTier21AdminManualTests(harness: TestHarness) {
  harness.setSuite("Tier 21", "Admin Manual");
  await provideReactGlobal();

  const params = Promise.resolve({ tenantSlug: "lumina-cine" });
  /** The page's text as the browser would show it (tags and entities removed). */
  const textOf = (element: unknown) =>
    renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0])
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");

  await harness.test("T21-MANUAL-01: every manual topic has its own page, under the admin console", async () => {
    harness.assert(MANUAL_TOPICS.length > 0, "The manual has at least one topic");
    harness.assertEqual(new Set(MANUAL_TOPICS.map((t) => t.slug)).size, MANUAL_TOPICS.length, "Topic slugs are unique");
    for (const topic of MANUAL_TOPICS) {
      const file = path.join(process.cwd(), "app", "[tenantSlug]", "admin", "manual", topic.slug, "page.tsx");
      harness.assert(existsSync(file), `Topic "${topic.slug}" has a page`);
    }
  });

  await harness.test("T21-MANUAL-02: the manual's front page links to every topic", async () => {
    const html = renderToStaticMarkup((await ManualIndexPage({ params })) as Parameters<typeof renderToStaticMarkup>[0]);
    for (const topic of MANUAL_TOPICS) {
      harness.assert(html.includes(`href="/lumina-cine/admin/manual/${topic.slug}"`), `Links to "${topic.slug}"`);
      harness.assert(html.includes(topic.title.replace(/&/g, "&amp;")), `Shows the title "${topic.title}"`);
    }
  });

  await harness.test("T21-MANUAL-03: the slot-hold page states the times the code really uses", async () => {
    const text = textOf(await SlotHoldManualPage({ params }));
    harness.assert(text.includes(`${SLOT_HOLD_MINUTES} minutes`), `States the ${SLOT_HOLD_MINUTES}-minute hold`);
    harness.assert(text.includes(`${ONLINE_HOLD_MINUTES} minutes`), `States the ${ONLINE_HOLD_MINUTES}-minute online payment window`);
    harness.assert(text.includes(`${DEPOSIT_HOLD_HOURS} hours`), `States the ${DEPOSIT_HOLD_HOURS}-hour deposit window`);
    harness.assert(text.includes(`${SLOT_HOLD_NUDGE_SECONDS / 60} minutes`), "States when the client is nudged");
  });

  await harness.test("T21-MANUAL-04: the slot-hold page names the admin controls as they appear on screen", async () => {
    const text = textOf(await SlotHoldManualPage({ params }));
    for (const label of ["Held in Checkout", "Awaiting verification", "Clean Expired Holds", "Force release hold", "Being Booked"]) {
      harness.assert(text.includes(label), `Mentions "${label}"`);
    }
  });

  await harness.test("T21-HOLD-01: the hold length is the documented 10 minutes", async () => {
    harness.assertEqual(SLOT_HOLD_MINUTES, 10, "Slot hold is 10 minutes");
    harness.assertEqual(SLOT_HOLD_NUDGE_SECONDS, 120, "Client nudge is in the last 2 minutes");
  });
}
