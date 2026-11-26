/**
 * Tier 49: one calendar for the whole app (audit A4 and B2)
 * - "Today", "tomorrow" and "this year" are the studio's (Malaysia), not the server's (UTC): between
 *   midnight and 8 am they differ
 * - An invoice is overdue only after its due day has ended
 * - Dates are written one way, "26 Nov 2026", in the studio's time zone
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { db } from "@/lib/db";
import { formatDay, formatStudioDate, formatStudioDateTime, isPastDue, studioDateKey, studioTodayStart, studioYear } from "@/lib/slot-time";
import { createInvoice } from "@/lib/actions/admin-invoices";
import { nextInvoiceNumber, nextPrintOrderNumber } from "@/lib/bookings/billing";
import { checkoutWindow } from "@/lib/gear/checkout-window";
import { PlanBanner } from "@/components/billing/plan-banner";
import { withSession } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8");

/** 2 am on Friday 27 November 2026 in Malaysia; still Thursday the 26th in UTC. */
const EARLY = "2026-11-26T18:00:00.000Z";
/** 1 am on 1 January 2027 in Malaysia; still 2026 in UTC. */
const NEW_YEAR = "2026-12-31T17:00:00.000Z";

const RealDate = Date;

/** Runs `fn` as if it were `iso` right now. */
async function atTime<T>(iso: string, fn: () => Promise<T> | T): Promise<T> {
  const now = new RealDate(iso).getTime();
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now);
      else super(...(args as [number]));
    }
    static override now() {
      return now;
    }
    static override [Symbol.hasInstance](value: unknown) {
      return Object.prototype.toString.call(value) === "[object Date]";
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    (globalThis as { Date: DateConstructor }).Date = RealDate;
  }
}

/** Runs `fn` with the computer's clock zone set to UTC, as in the app's container. */
async function onAUtcServer<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = process.env.TZ;
  process.env.TZ = "UTC";
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const ALL = () => ["app", "components", "lib"].flatMap(sources).filter((f) => !f.endsWith(path.join("lib", "slot-time.ts")));

export async function runTier49StudioDateTests(harness: TestHarness) {
  harness.setSuite("Tier 49", "One studio calendar");
  await provideReactGlobal();
  const run = Date.now().toString(36);

  await harness.test("T49-TODAY-01: today, the days after it and this year follow the studio's calendar", async () => {
    const early = new Date(EARLY);
    harness.assertEqual(studioDateKey(0, early), "2026-11-27", "Today");
    harness.assertEqual(studioDateKey(1, early), "2026-11-28", "Tomorrow");
    harness.assertEqual(studioDateKey(7, early), "2026-12-04", "A week on, across a month end");
    harness.assertEqual(studioTodayStart(early).toISOString(), "2026-11-27T00:00:00.000Z", "Today as stored days are: midnight UTC of that day");
    harness.assertEqual(studioYear(new Date(NEW_YEAR)), 2027, "This year");
  });

  await harness.test("T49-DUE-01: an invoice is overdue only once its due day has ended", async () => {
    const dueDay = new Date("2026-11-27T00:00:00.000Z");
    harness.assertEqual(isPastDue(dueDay, new Date("2026-11-27T01:00:00.000Z")), false, "9 am on the due day");
    harness.assertEqual(isPastDue(dueDay, new Date("2026-11-27T15:59:00.000Z")), false, "11:59 pm on the due day");
    harness.assertEqual(isPastDue(dueDay, new Date("2026-11-27T16:30:00.000Z")), true, "Half past midnight the next day");
    harness.assert(/isPastDue\(inv\.dueDate/.test(read("app/[tenantSlug]/admin/invoices/page.tsx")), "The invoice list uses it");
  });

  await harness.test("T49-TODAY-02: at 2 am, yesterday can't be a new invoice's due date, and today can", async () => {
    const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    const admin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
    const session = { id: admin.id, email: admin.email, name: admin.name, role: admin.role, tenantId: null, tenantSlug: null } as never;
    const client = await db.user.create({ data: { tenantId: lumina.id, name: "T49 Client", email: `t49-${run}@example.test`, role: "CLIENT" } });
    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { clientId: client.id } });
      await db.user.delete({ where: { id: client.id } });
    });
    const make = (dueDate: string) =>
      atTime(EARLY, () => withSession(session, () => createInvoice({ tenantId: lumina.id, tenantSlug: lumina.slug, clientId: client.id, description: "T49 extra hour", amount: 10, dueDate, notifyClient: false }))) as Promise<{ success: boolean; error?: string }>;
    const yesterday = await make("2026-11-26");
    harness.assertEqual(yesterday.error, "DUE_IN_PAST", "Yesterday is refused");
    const today = await make("2026-11-27");
    harness.assertEqual(today.success, true, "Today is fine");
  });

  await harness.test("T49-TODAY-03: just after midnight on New Year, new numbers carry the new year", async () => {
    const tenant = await db.tenant.create({ data: { name: "T49 Numbers", slug: `t49-num-${run}`, discipline: "HYBRID" } });
    harness.registerTeardown(async () => {
      await db.tenant.delete({ where: { id: tenant.id } });
    });
    await onAUtcServer(async () => {
      harness.assertEqual(new Date(NEW_YEAR).getFullYear(), 2026, "The server's own clock still says 2026");
      const invoice = await db.$transaction((tx) => nextInvoiceNumber(tx, tenant.id, new Date(NEW_YEAR)));
      harness.assert(invoice.startsWith("INV-2027-"), "Invoice number", invoice);
      const order = await db.$transaction((tx) => nextPrintOrderNumber(tx, tenant.id, new Date(NEW_YEAR)));
      harness.assert(order.startsWith("PO-2027-"), "Print order number", order);
    });
    const left = ALL().filter((f) => /new Date\(\)\.getFullYear\(\)|now\.getFullYear\(\)/.test(read(f)) && !f.includes("saas-footer"));
    harness.assertDeepEqual(left, [], "Project and proposal numbers too");
  });

  await harness.test("T49-TODAY-04: the trial notice counts its last week from the studio's today", async () => {
    const status = { state: "TRIAL", endsOn: "2026-12-04", graceEndsOn: null } as never;
    const shown = await atTime(EARLY, () => renderToStaticMarkup(createElement(PlanBanner, { status, contactEmail: null })));
    harness.assert(shown.includes("Your trial ends on"), "Seven days before, from 27 November", shown);
  });

  await harness.test("T49-TODAY-05: nothing works out today from the UTC clock any more", async () => {
    const utcToday = /new Date\(\)\.toISOString\(\)\.(slice|split|substring)|setUTCHours\(0, ?0, ?0, ?0\)|new Date\(Date\.now\(\)[^;\n]*\)\.toISOString\(\)\.(slice|split)/;
    harness.assertDeepEqual(ALL().filter((f) => utcToday.test(read(f))), [], "No UTC today");
    // These start from the computer's clock and then print it as UTC, which the pattern above can't see.
    for (const f of ["components/admin/calendar/batch-generator-dialog.tsx", "components/admin/calendar/single-slot-dialog.tsx", "components/admin/clients/clients-directory.tsx", "components/admin/invoices/new-invoice-dialog.tsx"]) {
      harness.assert(/studioDateKey\(/.test(read(f)), `${f} uses the studio's day`);
    }
  });

  await harness.test("T49-FMT-01: dates are written one way, in the studio's time zone", async () => {
    await onAUtcServer(() => {
      harness.assertEqual(formatStudioDate(EARLY), "27 Nov 2026", "A moment, as a date");
      harness.assertEqual(formatStudioDateTime(EARLY), "27 Nov 2026, 02:00", "A moment, with its time");
      harness.assertEqual(formatDay("2026-11-27"), "Fri, 27 Nov 2026", "A shoot day from its YYYY-MM-DD");
      harness.assertEqual(formatDay(new Date("2026-11-27T00:00:00.000Z")), "Fri, 27 Nov 2026", "…or as stored");
    });
    await onAUtcServer(() => {
      const gear = checkoutWindow({ startDate: "2026-11-27T18:00:00.000Z", endDate: "2026-11-29T10:00:00.000Z" }, new Date("2026-11-01T00:00:00.000Z"));
      harness.assert(!gear.open && gear.message.includes("26 Nov 2026"), "The gear message names the Malaysian day", gear.open ? "open" : gear.message);
    });
  });

  await harness.test("T49-FMT-02: no date is written US style, in the viewer's style, or in the server's time zone", async () => {
    const bad: string[] = [];
    for (const f of ALL()) {
      const src = read(f);
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
        const args = src.slice(m.index + m[0].length, i - 1).trim();
        // A number's toLocaleString (money, counts) has no date fields.
        const isDate = m[1] !== "toLocaleString" || /dateStyle|timeStyle|weekday|month|hour/.test(args);
        if (!isDate) continue;
        const usStyle = args === "" || args.startsWith('"en-US"') || args.startsWith("undefined");
        // Constants like DATE_FORMAT go to formatSlotDate, which fixes the zone itself.
        const noZone = !/timeZone/.test(args);
        if (usStyle || noZone) bad.push(`${f.split(path.sep).join("/")}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    harness.assertDeepEqual(bad, [], "Every date goes through one style and a fixed zone");
    const usHelpers = ALL().filter((f) => /formatSlotDate\([^;]*"en-US"/.test(read(f)));
    harness.assertDeepEqual(usHelpers, [], "Nor is the helper asked for US style");
  });
}
