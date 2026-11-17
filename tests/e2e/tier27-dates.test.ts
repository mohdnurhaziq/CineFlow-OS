/**
 * Tier 27: Dates read the same on the server and in the browser
 * A screen rendered first on the server (UTC) and then in the viewer's browser (any time zone)
 * must format dates in a fixed zone, or the two disagree: React logs a hydration error and the
 * client sees the day change (a Friday 20 Nov shoot shown as Saturday 21 Nov in Malaysia).
 * - Calendar days (slot, shoot, gear booking days) are stored as midnight UTC: formatSlotDate.
 * - Moments (paid, signed, submitted) read in the studio's time zone: timeZone: STUDIO_TIME_ZONE.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TestHarness } from "./test-harness";
import { formatSlotDate } from "@/lib/slot-time";

const ROOT = process.cwd();

/** Every browser-rendered ("use client") .ts/.tsx file under app/ and components/. */
function clientSources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const src = readFileSync(full, "utf8");
        if (/^\s*["']use client["']/.test(src)) out.push([path.relative(ROOT, full).split(path.sep).join("/"), src]);
      }
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "components"));
  return out;
}

/** Date formatting calls with no fixed time zone, as "file:line call(...)". */
function unzonedDateCalls(): string[] {
  const found: string[] = [];
  for (const [file, src] of clientSources()) {
    const re = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (depth && i < src.length) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        i++;
      }
      const args = src.slice(m.index + m[0].length, i - 1);
      // A number's toLocaleString (money, counts) has no date fields.
      const isDate = m[1] !== "toLocaleString" || /dateStyle|timeStyle|weekday|month|hour/.test(args);
      if (isDate && !/timeZone/.test(args)) {
        found.push(`${file}:${src.slice(0, m.index).split("\n").length} ${m[1]}(${args.replace(/\s+/g, " ").slice(0, 60)})`);
      }
    }
  }
  return found;
}

export async function runTier27DateTests(harness: TestHarness) {
  harness.setSuite("Tier 27", "Dates read the same on the server and in the browser");

  await harness.test("T27-DATES-01: browser-rendered screens format every date in a fixed time zone", async () => {
    const found = unzonedDateCalls();
    harness.assertEqual(found.length, 0, "No date formatting depends on the viewer's time zone", found.join("\n"));
  });

  await harness.test("T27-DATES-02: a shoot day stored as midnight UTC keeps its day", async () => {
    // Seeded and imported days can carry a time; late in the UTC day is ahead in Malaysia.
    const day = "2026-11-20T17:55:49.553Z";
    harness.assertEqual(
      formatSlotDate(day, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, "en-US"),
      "Fri, Nov 20, 2026",
      "Friday 20 Nov, not Saturday 21"
    );
  });
}
