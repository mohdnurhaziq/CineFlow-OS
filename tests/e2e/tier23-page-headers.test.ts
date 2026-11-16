/**
 * Tier 23: Every page carries its area's top bar
 * - Admin pages: the admin layout's bar. Client account pages: the account layout's bar.
 * - Every other studio page either uses the shared StudioPageHeader (which picks the client
 *   portal bar, the admin bar or the studio website bar by who is looking) or is on the short
 *   list below, with the reason it differs.
 * - No page goes back to a bare "Back to…" link instead of a bar.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TestHarness } from "./test-harness";

const ROOT = process.cwd();
const STUDIO = path.join(ROOT, "app", "[tenantSlug]");

/** Pages that don't use StudioPageHeader, and why. Anything else must use it. */
const OWN_BAR: Record<string, string> = {
  "page.tsx": "The studio website's front page: always the website bar (ShowcaseNav).",
  "visualizer/page.tsx": "Wall art: the client's own gallery mode uses the portal bar, the public preview the website bar.",
  "login/page.tsx": "Sign-in card: a focused page with a way back to the website.",
  "register/page.tsx": "Sign-up card: a focused page with a way back to the website.",
  "forgot-password/page.tsx": "Password card: a focused page with a way back to the website.",
  "reset-password/page.tsx": "Password card: a focused page with a way back to the website.",
};

/** Every page.tsx under app/[tenantSlug], outside the admin and account layouts, relative to it. */
function studioPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(STUDIO, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (rel === "admin" || rel === "account") continue; // their layouts supply the bar
        walk(full);
      } else if (entry.name === "page.tsx") out.push(rel);
    }
  };
  walk(STUDIO);
  return out.sort();
}

export async function runTier23PageHeaderTests(harness: TestHarness) {
  harness.setSuite("Tier 23", "Page Headers");
  const read = (rel: string) => readFileSync(path.join(STUDIO, rel), "utf8");

  await harness.test("T23-HEADER-01: the admin and account layouts supply their area's bar", async () => {
    harness.assert(read("admin/layout.tsx").includes("<AdminHeader "), "Admin layout renders the admin bar");
    harness.assert(read("account/layout.tsx").includes("<ClientAccountHeader"), "Account layout renders the client portal bar");
  });

  await harness.test("T23-HEADER-02: every other studio page uses the shared header, or is a listed exception", async () => {
    const pages = studioPages();
    harness.assert(pages.length >= 14, `Found the studio's pages (${pages.length})`);
    for (const rel of pages) {
      const src = read(rel);
      if (OWN_BAR[rel]) continue;
      harness.assert(src.includes("<StudioPageHeader "), `${rel} renders StudioPageHeader`);
    }
    for (const rel of Object.keys(OWN_BAR)) {
      harness.assert(existsSync(path.join(STUDIO, rel)), `Listed exception ${rel} still exists`);
    }
    harness.assert(read("page.tsx").includes("<ShowcaseNav"), "The front page renders the website bar");
  });

  await harness.test("T23-HEADER-03: the shared header picks the bar by who is looking", async () => {
    const src = readFileSync(path.join(ROOT, "components", "layout", "studio-page-header.tsx"), "utf8");
    harness.assert(src.includes("<ClientAccountHeader"), "Signed-in client: the client portal bar");
    harness.assert(src.includes("<AdminHeader"), "Team member: the admin bar");
    harness.assert(src.includes("<ShowcaseNav"), "Anyone else: the studio website bar");
  });

  await harness.test("T23-HEADER-04: the booking page has no bar of its own on top of the shared one", async () => {
    const shell = readFileSync(path.join(ROOT, "components", "booking", "cinema-booking-shell.tsx"), "utf8");
    harness.assert(!shell.includes("ClientAccountMenu"), "No second account menu inside the booking page");
    harness.assert(!shell.includes("Back to studio website"), "No bare back link instead of a bar");
    harness.assert(!existsSync(path.join(ROOT, "components", "portal", "portal-top-bar.tsx")), "The old slim back bar is gone");
  });
}
