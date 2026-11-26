/**
 * Tier 45: fixes from the 26 November 2026 audit (A1, A5)
 * - Booking tracking codes: an 8-character random part from a secure source, no look-alike letters,
 *   in the checkout and the admin "book for a customer" paths; old codes still open a booking
 * - "My Booking" lookup: limited per email and per visitor, on the shared limiter
 * - Emails are lowercased where an account is made: studio sign-up's owner, and a legacy booking
 *   promoted to a project
 * - The email-case report finds mixed-case emails and duplicates without changing anything
 */
import { readFileSync } from "node:fs";
import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { newTrackingCode, TRACKING_ALPHABET } from "@/lib/bookings/tracking-code";
import { lookupMyBooking } from "@/lib/actions/my-booking";
import { onboardStudio } from "@/lib/actions/onboarding";
import { provisionProjectForBooking } from "@/lib/bookings/project-promotion";
import { findEmailCaseIssues } from "@/lib/maintenance/email-case-report";
import { withIp } from "./mocks/session";

const read = (p: string) => readFileSync(p, "utf8");

export async function runTier45AuditFixesTests(harness: TestHarness) {
  harness.setSuite("Tier 45", "Audit fixes: tracking codes, email case");

  const run = Date.now().toString(36);
  const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });

  // ── A1: tracking codes ──────────────────────────────────────────────────────────────────
  await harness.test("T45-CODE-01: a code is BK-<studio>-<time>-<8 characters> with no look-alike letters, and never repeats", async () => {
    const code = newTrackingCode("LUMINA-CINE");
    harness.assert(/^BK-LUMI-[0-9A-Z]{6,10}-[A-Z2-9]{8}$/.test(code), "Studio form: BK-LUMI-<time>-<8>", code);
    harness.assert(/^BK-[0-9A-Z]{6,10}-[A-Z2-9]{8}$/.test(newTrackingCode()), "Without a studio: BK-<time>-<8>");
    harness.assert(!/[OIL01]/.test(TRACKING_ALPHABET) && TRACKING_ALPHABET.length >= 30, "The random alphabet has no O, 0, I, 1 or L");
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(newTrackingCode("X").split("-").pop()!);
    harness.assertEqual(seen.size, 20000, "20000 random parts, all different");
    harness.assert(code.length <= 40, "Short enough for the lookup form (40 characters)", String(code.length));
  });

  await harness.test("T45-CODE-02: both booking paths use the shared generator, not Math.random", async () => {
    for (const f of ["lib/actions/checkout.ts", "lib/actions/admin-bookings.ts"]) {
      const src = read(f);
      harness.assert(/newTrackingCode\(/.test(src), `${f} uses newTrackingCode`);
      harness.assert(!/trackingCode = `BK-[^`]*Math\.random|Math\.random\(\)\s*\.toString\(36\)/.test(src), `${f} no longer builds a code from Math.random`);
    }
    const lookup = read("lib/actions/my-booking.ts");
    harness.assert(/isRateLimited\(/.test(lookup) && !/new Map<string, \{ count/.test(lookup), "The lookup uses the shared limiter, not its own growing map");
  });

  // ── A1: the lookup ──────────────────────────────────────────────────────────────────────
  const email = `t45-lookup-${run}@example.test`;
  const oldCode = `BK-LUMI-${run}-AB12`.toUpperCase(); // an old-style code
  const newCode = newTrackingCode("LUMINA-CINE");
  for (const code of [oldCode, newCode]) {
    await db.clientBooking.create({
      data: { tenantId: lumina.id, trackingCode: code, clientName: "T45", clientEmail: email, clientPhone: "0123456789", discipline: "PHOTOGRAPHY", serviceTier: "STANDARD" },
    });
  }
  harness.registerTeardown(async () => {
    await db.clientBooking.deleteMany({ where: { clientEmail: email } });
  });

  await harness.test("T45-LOOKUP-01: old and new codes open the booking; wrong guesses all answer alike", async () => {
    const mk = (trackingCode: string, e = email) => withIp("203.0.113.45", () => lookupMyBooking({ tenantSlug: "lumina-cine", email: e, trackingCode }));
    harness.assertEqual((await mk(oldCode)).success, true, "An old-style code still works");
    harness.assertEqual((await mk(newCode.toLowerCase())).success, true, "A new code works (any case)");
    const wrongCode = await mk("BK-NOPE-ZZZZZZZZ");
    const wrongEmail = await mk(newCode, "someone-else@example.test");
    harness.assert(!wrongCode.success && !wrongEmail.success && wrongCode.error === "NOT_FOUND" && wrongCode.message === (wrongEmail as { message: string }).message, "A wrong code and a wrong email give the same answer");
  });

  await harness.test("T45-LOOKUP-02: ten guesses at one email are stopped; another email is not affected", async () => {
    const victim = `t45-guess-${run}@example.test`;
    const replies: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await withIp("203.0.113.46", () => lookupMyBooking({ tenantSlug: "lumina-cine", email: victim, trackingCode: `BK-GUESS-${i}XXXX` }));
      replies.push(r.success ? "OK" : r.error);
    }
    harness.assert(replies.slice(0, 8).every((r) => r === "NOT_FOUND"), "The first 8 are answered", replies.join(","));
    harness.assert(replies.slice(8).every((r) => r === "RATE_LIMITED"), "From the 9th: wait and try again", replies.join(","));
    const other = await withIp("203.0.113.47", () => lookupMyBooking({ tenantSlug: "lumina-cine", email: `t45-other-${run}@example.test`, trackingCode: "BK-GUESS-0XXXX" }));
    harness.assert(!other.success && other.error === "NOT_FOUND", "Another email still gets an ordinary answer");
  });

  await harness.test("T45-LOOKUP-03: one visitor trying many emails is stopped too, others are not", async () => {
    const results: string[] = [];
    for (let i = 0; i < 45; i++) {
      const r = await withIp("203.0.113.48", () => lookupMyBooking({ tenantSlug: "lumina-cine", email: `t45-spray-${run}-${i}@example.test`, trackingCode: "BK-SPRAY-00000000" }));
      results.push(r.success ? "OK" : r.error);
    }
    harness.assert(results.slice(0, 40).every((r) => r === "NOT_FOUND"), "The first 40 are answered", results.slice(0, 41).join(","));
    harness.assert(results.slice(40).every((r) => r === "RATE_LIMITED"), "The 41st onward from the same visitor is stopped");
    const elsewhere = await withIp("203.0.113.49", () => lookupMyBooking({ tenantSlug: "lumina-cine", email: `t45-spray-${run}-x@example.test`, trackingCode: "BK-SPRAY-00000000" }));
    harness.assert(!elsewhere.success && elsewhere.error === "NOT_FOUND", "A different visitor is unaffected");
  });

  // ── A5: email case ──────────────────────────────────────────────────────────────────────
  const savedCode = process.env.STUDIO_SIGNUP_CODE;
  const cleanup: Array<() => Promise<unknown>> = [];
  harness.registerTeardown(async () => {
    for (const c of cleanup) await c().catch(() => undefined);
    if (savedCode === undefined) delete process.env.STUDIO_SIGNUP_CODE;
    else process.env.STUDIO_SIGNUP_CODE = savedCode;
  });

  await harness.test("T45-EMAIL-01: studio sign-up keeps the owner's email lowercase, however it was typed", async () => {
    delete process.env.STUDIO_SIGNUP_CODE;
    const slug = `t45-own-${run}`;
    const typed = `  T45.Owner-${run}@Example.TEST `;
    const lower = typed.trim().toLowerCase();
    cleanup.push(async () => {
      await db.tenant.deleteMany({ where: { slug } });
      await db.login.deleteMany({ where: { email: lower } });
    });
    const res = (await onboardStudio({ name: `T45 ${slug}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T45 Owner", ownerEmail: typed, password: "password123" } as never)) as { success?: boolean; error?: string };
    harness.assert(res.success === true, "The studio is created", JSON.stringify(res));
    const owner = await db.user.findFirstOrThrow({ where: { tenant: { slug }, role: "STUDIO_OWNER" } });
    harness.assertEqual(owner.email, lower, "Stored trimmed and lowercase");
    harness.assertEqual(await db.user.count({ where: { tenant: { slug }, email: { not: lower } } }), 0, "No account holds the typed spelling");
  });

  await harness.test("T45-EMAIL-02: a booking with no account yet (an older one) promoted to a project gets a lowercase client", async () => {
    const mixed = `T45.Legacy-${run}@Example.TEST`;
    const lower = mixed.toLowerCase();
    const mkBooking = (code: string, clientEmail: string) =>
      db.clientBooking.create({
        data: { tenantId: lumina.id, trackingCode: code, clientName: "T45 Legacy", clientEmail, clientPhone: "0123456789", discipline: "PHOTOGRAPHY", serviceTier: "STANDARD", status: "CONFIRMED" },
      });
    const b1 = await mkBooking(`BK-T45A-${run}`.toUpperCase(), mixed);
    cleanup.push(async () => {
      await db.project.deleteMany({ where: { bookingId: b1.id } });
      await db.clientBooking.deleteMany({ where: { id: b1.id } });
      await db.user.deleteMany({ where: { tenantId: lumina.id, email: { in: [lower, mixed] } } });
    });
    await db.$transaction((tx) => provisionProjectForBooking(tx, b1.id));
    const made = await db.user.findMany({ where: { tenantId: lumina.id, email: { in: [lower, mixed] } } });
    harness.assert(made.length === 1 && made[0]!.email === lower, "One client, stored lowercase", JSON.stringify(made.map((u) => u.email)));

    // A second booking in another spelling finds that same client instead of making a duplicate.
    const b2 = await mkBooking(`BK-T45B-${run}`.toUpperCase(), lower.toUpperCase());
    cleanup.push(async () => {
      await db.project.deleteMany({ where: { bookingId: b2.id } });
      await db.clientBooking.deleteMany({ where: { id: b2.id } });
    });
    await db.$transaction((tx) => provisionProjectForBooking(tx, b2.id));
    const after = await db.user.findMany({ where: { tenantId: lumina.id, email: { in: [lower, mixed, lower.toUpperCase()] } } });
    harness.assertEqual(after.length, 1, "Still one client for both spellings");
  });

  await harness.test("T45-EMAIL-03: the report lists mixed-case emails and duplicates, and changes nothing", async () => {
    const t = await db.tenant.create({ data: { name: `T45 report ${run}`, slug: `t45-rep-${run}` } });
    cleanup.push(() => db.tenant.delete({ where: { id: t.id } }));
    const mk = (e: string, role = "CLIENT") => db.user.create({ data: { tenantId: t.id, name: "T45", email: e, role } });
    await mk(`dup-${run}@x.test`);
    await mk(`DUP-${run}@x.test`);
    await mk(`Mixed-${run}@x.test`);
    await mk(`fine-${run}@x.test`);
    await db.clientBooking.create({ data: { tenantId: t.id, trackingCode: `BK-T45R-${run}`.toUpperCase(), clientName: "T45", clientEmail: `Mixed-${run}@x.test`, clientPhone: "0123456789", discipline: "PHOTOGRAPHY", serviceTier: "STANDARD" } });
    const before = await db.user.findMany({ where: { tenantId: t.id }, orderBy: { email: "asc" } });
    const report = await findEmailCaseIssues(db, { tenantSlug: t.slug });
    harness.assertEqual(report.users.total, 4, "Counts the studio's 4 accounts");
    harness.assertEqual(report.users.mixedCase.length, 2, "Two have capital letters");
    harness.assertEqual(report.users.duplicates.length, 1, "One pair is the same address in two spellings");
    harness.assertEqual(report.users.duplicates[0]!.accounts.length, 2, "…with both accounts listed");
    harness.assertEqual(report.bookings.mixedCase, 1, "One booking has a mixed-case email");
    const after = await db.user.findMany({ where: { tenantId: t.id }, orderBy: { email: "asc" } });
    harness.assertDeepEqual(after.map((u) => u.email), before.map((u) => u.email), "No email was changed");
  });

  await harness.test("T45-EMAIL-04: the ops command runs the report inside the app container", async () => {
    harness.assert(/email-report/.test(read("scripts/ops.mjs")) && /report-email-case\.ts/.test(read("scripts/ops.mjs")), "node scripts/ops.mjs email-report");
    harness.assert(/findEmailCaseIssues/.test(read("scripts/report-email-case.ts")), "The script prints the report");
  });
}
