/**
 * Tier 21: The admin manual
 * - Every topic the manual lists has a page, and the index links to each one
 * - The slot-hold page states the numbers the code really uses (so the manual can't drift)
 */

import { existsSync, readFileSync } from "node:fs";
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
import GettingStartedManualPage from "@/app/[tenantSlug]/admin/manual/getting-started/page";
import BookingsManualPage from "@/app/[tenantSlug]/admin/manual/bookings/page";
import PaymentsManualPage from "@/app/[tenantSlug]/admin/manual/payments/page";
import GalleriesManualPage from "@/app/[tenantSlug]/admin/manual/galleries/page";
import PrintsManualPage from "@/app/[tenantSlug]/admin/manual/prints/page";
import ClientsManualPage from "@/app/[tenantSlug]/admin/manual/clients-and-proposals/page";
import ProductionManualPage from "@/app/[tenantSlug]/admin/manual/production/page";
import ServicesManualPage from "@/app/[tenantSlug]/admin/manual/services-and-website/page";
import SettingsManualPage from "@/app/[tenantSlug]/admin/manual/settings-and-team/page";
import { BALANCE_DUE_AFTER_SESSION_DAYS } from "@/lib/bookings/billing";

type ManualPageFn = (props: { params: Promise<{ tenantSlug: string }> }) => Promise<unknown>;

/** Every topic's page, by slug. A topic without an entry here fails T21-MANUAL-05. */
const TOPIC_PAGES: Record<string, ManualPageFn> = {
  "getting-started": GettingStartedManualPage,
  bookings: BookingsManualPage,
  "slot-hold": SlotHoldManualPage,
  payments: PaymentsManualPage,
  galleries: GalleriesManualPage,
  prints: PrintsManualPage,
  "clients-and-proposals": ClientsManualPage,
  production: ProductionManualPage,
  "services-and-website": ServicesManualPage,
  "settings-and-team": SettingsManualPage,
};

/**
 * Labels the manual quotes, with the screen each one comes from. If a screen is reworded, the
 * manual must be reworded with it: [topic slug, label as the manual prints it, source file].
 */
const QUOTED_LABELS: [string, string, string][] = [
  ["bookings", "Batch Generate", "components/admin/calendar/calendar-admin-dashboard.tsx"],
  ["bookings", "Book for Customer", "components/admin/calendar/slot-table.tsx"],
  ["bookings", "Move to another slot", "components/admin/bookings/booking-actions.tsx"],
  ["bookings", "Resend confirmation email", "components/admin/bookings/booking-actions.tsx"],
  ["bookings", "Mark session done", "components/admin/bookings/booking-actions.tsx"],
  ["bookings", "Cancel booking", "components/admin/bookings/booking-actions.tsx"],
  ["bookings", "Needs verification", "components/admin/bookings/bookings-console.tsx"],
  ["payments", "Payments waiting for verification", "components/checkout/verification-queue.tsx"],
  ["payments", "Zoom receipt", "components/checkout/verification-queue.tsx"],
  ["payments", "Record payment", "components/admin/invoices/invoice-admin-actions.tsx"],
  ["payments", "Send reminder", "components/admin/invoices/invoice-admin-actions.tsx"],
  ["payments", "Cancel invoice", "components/admin/invoices/invoice-admin-actions.tsx"],
  ["payments", "New invoice", "components/admin/invoices/new-invoice-dialog.tsx"],
  ["payments", "Turn off online payments", "components/admin/settings/payments-tab.tsx"],
  ["galleries", "Choose photos to upload", "components/admin/projects/photo-uploader.tsx"],
  ["galleries", "Ready to send?", "components/admin/projects/deliver-panel.tsx"],
  ["galleries", "Send on WhatsApp", "components/admin/projects/project-workspace.tsx"],
  ["galleries", "Watermarked until paid", "components/admin/settings/delivery-tab.tsx"],
  ["galleries", "Full resolution right away", "components/admin/settings/delivery-tab.tsx"],
  ["prints", "Add Print Size", "components/admin/frames/frames-manager.tsx"],
  ["prints", "Add Frame Molding", "components/admin/frames/frames-manager.tsx"],
  ["prints", "Save mat price", "components/admin/frames/frames-manager.tsx"],
  ["prints", "Included framed prints", "components/admin/services/package-dialog.tsx"],
  ["prints", "Grant included print", "components/admin/bookings/included-prints-card.tsx"],
  ["prints", "Order framed prints for client", "components/admin/projects/project-workspace.tsx"],
  ["prints", "Start production", "components/admin/print-orders/print-order-actions.tsx"],
  ["prints", "Mark ready for pickup", "components/admin/print-orders/print-order-actions.tsx"],
  ["prints", "Cancel order", "components/admin/print-orders/print-order-actions.tsx"],
  ["prints", "Shipping zones", "components/admin/settings/delivery-tab.tsx"],
  ["clients-and-proposals", "Export CSV", "components/admin/clients/clients-directory.tsx"],
  ["clients-and-proposals", "New proposal", "components/admin/proposals/new-proposal-dialog.tsx"],
  ["clients-and-proposals", "Awaiting Signature", "components/admin/proposals/proposals-list.tsx"],
  ["clients-and-proposals", "New Add-On Template", "components/admin/proposals/proposal-admin-dashboard.tsx"],
  ["production", "Add shoot day", "components/admin/projects/project-workspace.tsx"],
  ["production", "1-Click WhatsApp Dispatch", "components/logistics/call-sheet-shell.tsx"],
  ["production", "Print Call Sheet", "components/logistics/call-sheet-shell.tsx"],
  ["production", "Add Shot", "components/logistics/shot-list-hud.tsx"],
  ["production", "Executed Clearances Archive", "components/logistics/release-form-shell.tsx"],
  ["production", "Add Equipment", "components/gear/gear-dashboard.tsx"],
  ["production", "Create Kit Bundle", "components/gear/gear-dashboard.tsx"],
  ["services-and-website", "New Category", "components/admin/services/services-dashboard.tsx"],
  ["services-and-website", "New Package", "components/admin/services/services-dashboard.tsx"],
  ["services-and-website", "Kind of job", "components/admin/services/category-dialog.tsx"],
  ["services-and-website", "New Portfolio Item", "components/admin/cms/cms-manager.tsx"],
  ["settings-and-team", "Custom domain", "components/admin/settings/studio-tab.tsx"],
  ["settings-and-team", "Before the balance is paid", "components/admin/settings/delivery-tab.tsx"],
  ["settings-and-team", "Copy studio ID", "components/admin/settings/plan-tab.tsx"],
  ["getting-started", "Get your studio ready", "components/admin/onboarding/setup-checklist.tsx"],
  ["getting-started", "Take the tour", "components/admin/onboarding/setup-checklist.tsx"],
];

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

  await harness.test("T21-MANUAL-05: every topic page renders, with its own contents list", async () => {
    for (const topic of MANUAL_TOPICS) {
      const page = TOPIC_PAGES[topic.slug];
      harness.assert(!!page, `Topic "${topic.slug}" is registered in the manual tests`);
      if (!page) continue;
      const html = renderToStaticMarkup((await page({ params })) as Parameters<typeof renderToStaticMarkup>[0]);
      harness.assert(html.includes('aria-label="On this page"'), `"${topic.slug}" has an "On this page" list`);
      harness.assert(html.includes('href="/lumina-cine/admin/manual"'), `"${topic.slug}" links back to the manual`);
      // Every "On this page" entry jumps to a section that exists.
      const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      harness.assert(anchors.length >= 5, `"${topic.slug}" has at least five sections`);
      for (const id of anchors) harness.assert(html.includes(`id="${id}"`), `"${topic.slug}" has the section #${id}`);
    }
  });

  await harness.test("T21-MANUAL-06: every link in the manual leads to a page that exists", async () => {
    const adminDir = path.join(process.cwd(), "app", "[tenantSlug]", "admin");
    const prefix = 'href="/lumina-cine/admin';
    for (const topic of MANUAL_TOPICS) {
      const page = TOPIC_PAGES[topic.slug];
      if (!page) continue;
      const html = renderToStaticMarkup((await page({ params })) as Parameters<typeof renderToStaticMarkup>[0]);
      const routes = new Set(
        html
          .split(prefix)
          .slice(1)
          .map((rest) => /^[^"?#]*/.exec(rest)?.[0] ?? "")
      );
      for (const route of routes) {
        const file = path.join(adminDir, ...route.split("/").filter(Boolean), "page.tsx");
        harness.assert(existsSync(file), `"${topic.slug}" links to /admin${route}, which exists`);
      }
    }
  });

  await harness.test("T21-MANUAL-07: the labels the manual quotes are the labels on the screens", async () => {
    const texts = new Map<string, string>();
    for (const [slug, label, source] of QUOTED_LABELS) {
      const page = TOPIC_PAGES[slug];
      harness.assert(!!page, `"${slug}" is a manual topic`);
      if (!page) continue;
      if (!texts.has(slug)) texts.set(slug, textOf(await page({ params })));
      harness.assert(texts.get(slug)!.includes(label), `Manual "${slug}" mentions "${label}"`);
      const screen = readFileSync(path.join(process.cwd(), source), "utf8").replace(/&amp;/g, "&").replace(/&apos;/g, "'");
      harness.assert(screen.includes(label), `"${label}" is still the wording in ${source}`);
    }
  });

  await harness.test("T21-MANUAL-08: bookings and payments pages state the times the code really uses", async () => {
    const bookings = textOf(await BookingsManualPage({ params }));
    harness.assert(bookings.includes(`${DEPOSIT_HOLD_HOURS} hours`), `Bookings states the ${DEPOSIT_HOLD_HOURS}-hour deposit window`);
    harness.assert(bookings.includes(`${BALANCE_DUE_AFTER_SESSION_DAYS} days`), "Bookings states when the balance is due");
    const payments = textOf(await PaymentsManualPage({ params }));
    harness.assert(payments.includes(`${ONLINE_HOLD_MINUTES} minutes`), `Payments states the ${ONLINE_HOLD_MINUTES}-minute online window`);
    harness.assert(payments.includes(`${DEPOSIT_HOLD_HOURS} hours`), `Payments states the ${DEPOSIT_HOLD_HOURS}-hour deposit window`);
    harness.assert(payments.includes(`${BALANCE_DUE_AFTER_SESSION_DAYS} days`), "Payments states when the balance is due");
  });

  await harness.test("T21-HOLD-01: the hold length is the documented 10 minutes", async () => {
    harness.assertEqual(SLOT_HOLD_MINUTES, 10, "Slot hold is 10 minutes");
    harness.assertEqual(SLOT_HOLD_NUDGE_SECONDS, 120, "Client nudge is in the last 2 minutes");
  });
}
