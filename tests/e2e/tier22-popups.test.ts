/**
 * Tier 22: Pop-up messages never cover the controls people need
 * - One place decides where pop-ups appear: top centre, below the area's sticky header
 * - Every sticky page header carries the anchor that reports its height
 * - No screen moves a pop-up somewhere else on its own
 * - The booking page doesn't pop up what its selection bar already shows
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TestHarness } from "./test-harness";

const ROOT = process.cwd();

/** Every .tsx file under app/ and components/, as [relative path, source]. */
function uiSources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) out.push([path.relative(ROOT, full).split(path.sep).join("/"), readFileSync(full, "utf8")]);
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "components"));
  return out;
}

export async function runTier22PopupTests(harness: TestHarness) {
  harness.setSuite("Tier 22", "Pop-up Messages");
  const sources = uiSources();

  await harness.test("T22-POPUP-01: pop-ups appear top centre, below the sticky header, from one place", async () => {
    const withToaster = sources.filter(([, src]) => /<Toaster\b/.test(src)).map(([file]) => file);
    harness.assertEqual(withToaster.join(), "app/layout.tsx", "Only the root layout mounts the pop-up container");

    const layout = sources.find(([file]) => file === "app/layout.tsx")![1];
    harness.assert(layout.includes('position="top-center"'), "Pop-ups are placed at the top centre");
    harness.assert(layout.includes('offset={{ top: "var(--toast-top, 24px)" }}'), "On wide screens they sit below the header");
    harness.assert(layout.includes('mobileOffset={{ top: "var(--toast-top, 16px)" }}'), "On phones they sit below the header");
  });

  await harness.test("T22-POPUP-02: every sticky page header reports its height to the pop-ups", async () => {
    const stickyHeaders = sources.filter(([, src]) => /<header\b[^>]*\bsticky\b[^>]*\btop-0\b/.test(src));
    harness.assert(stickyHeaders.length >= 4, "Found the admin, client, public and sales-site headers");
    for (const [file, src] of stickyHeaders) {
      harness.assert(/<header\b[^>]*>\s*<ToastAnchor \/>/.test(src), `${file}: the header starts with <ToastAnchor />`);
    }
  });

  await harness.test("T22-POPUP-03: no screen moves a pop-up to its own spot", async () => {
    for (const [file, src] of sources) {
      if (!src.includes('from "sonner"')) continue;
      const moved = /toast(\.\w+)?\([^;]*\bposition:\s*["']/.test(src);
      harness.assert(!moved, `${file}: leaves the pop-up position to the root layout`);
    }
  });

  await harness.test("T22-POPUP-04: selecting or clearing a time shows the bar, not a pop-up", async () => {
    const shell = sources.find(([file]) => file === "components/booking/cinema-booking-shell.tsx")![1];
    harness.assert(!shell.includes("Time selected"), "No pop-up repeats the selected time");
    harness.assert(!shell.includes("Selection cleared"), "No pop-up repeats that the selection was cleared");
    harness.assert(/role="status"[^>]*>/.test(shell), "The selection bar announces itself to screen readers");
  });
}
