/**
 * Tier 17: Admin Clients section
 * - Directory and profile totals (paid / balance due) and account status
 * - Older guest bookings with no linked account are matched to the client by email
 * - Studio isolation: one studio cannot see or edit another studio's clients
 * - Editing contact details (staff only, email uniqueness, syncing onto bookings)
 * - Private studio notes never reach the client's own pages
 * - CSV export escaping (quoting, spreadsheet formula injection)
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import {
  clientAccountStatus,
  formatStudioDate,
  studioIsoDate,
  loadClientDirectory,
  loadClientProfile,
  summarizeInvoices,
} from "@/lib/client-directory";
import { updateClientDetails, updateClientNotes } from "@/lib/actions/admin-clients";
import { getSessionClient } from "@/lib/clients";
import { csvCell, toCsv } from "@/lib/csv";
import AdminClientPage from "@/app/[tenantSlug]/admin/clients/[clientId]/page";

/** Next's notFound() throws an error tagged with a digest. */
async function isNotFound(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err: any) {
    if (String(err?.digest ?? "").startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return true;
    throw err;
  }
}

export async function runTier17ClientsTests(harness: TestHarness) {
  harness.setSuite("Tier 17", "Admin Clients Section");
  (globalThis as any).React ??= await import("react");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const owner = await db.user.findFirst({ where: { tenantId: lumina!.id, role: "STUDIO_OWNER" } });
  const crew = await db.user.findFirst({
    where: { tenantId: lumina!.id, role: { in: ["PHOTOGRAPHER", "VIDEOGRAPHER", "CREW"] } },
  });
  const apexOwner = await db.user.findFirst({ where: { tenantId: apex!.id, role: "STUDIO_OWNER" } });
  if (!lumina || !apex || !owner || !crew || !apexOwner) throw new Error("Seed data is required for Tier 17");

  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }, slug: string) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: slug,
  });

  const run = Date.now().toString(36);
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t17-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t17-" } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t17-" } } });
  });

  // A client with: one linked booking, one older guest booking typed in mixed case with no
  // account link, and invoices in every status that matters for the totals.
  const email = `t17-client-${run}@example.test`;
  const client = await db.user.create({
    data: { tenantId: lumina.id, name: "Tess Seventeen", email, phone: "+60 12-345 6789", role: "CLIENT", isQuickCreated: true },
  });
  const bookingBase = {
    tenantId: lumina.id,
    clientName: "Tess Seventeen",
    clientPhone: "0123456789",
    discipline: "PHOTOGRAPHY",
    serviceTier: "STANDARD",
  };
  const linked = await db.clientBooking.create({
    data: { ...bookingBase, trackingCode: `T17-L-${run}`, clientEmail: email, userId: client.id },
  });
  const guest = await db.clientBooking.create({
    data: { ...bookingBase, trackingCode: `T17-G-${run}`, clientEmail: email.toUpperCase(), userId: null },
  });
  const due = new Date(Date.now() + 7 * 86_400_000);
  const invoice = (n: string, amount: number, status: string) => ({
    tenantId: lumina.id,
    clientId: client.id,
    invoiceNumber: `T17-${run}-${n}`,
    milestoneType: "CUSTOM",
    amount,
    status,
    dueDate: due,
  });
  await db.milestoneInvoice.createMany({
    data: [
      invoice("1", 100, "PAID"),
      invoice("2", 40, "PAID"),
      invoice("3", 25, "PENDING"),
      invoice("4", 10, "OVERDUE"),
      invoice("5", 5, "PENDING_VERIFICATION"),
      invoice("6", 3, "REJECTED"),
      invoice("7", 999, "VOID"),
    ],
  });
  // Another studio's client, for isolation checks.
  const apexClient = await db.user.create({
    data: { tenantId: apex.id, name: "Apex Person", email: `t17-apex-${run}@example.test`, role: "CLIENT" },
  });

  await harness.test("T17-01: totals count PAID as paid, unpaid statuses as due, and skip VOID", async () => {
    const m = summarizeInvoices([
      { amount: 100, status: "PAID" },
      { amount: 25, status: "PENDING" },
      { amount: 10, status: "OVERDUE" },
      { amount: 5, status: "PENDING_VERIFICATION" },
      { amount: 3, status: "REJECTED" },
      { amount: 999, status: "VOID" },
    ]);
    harness.assertDeepEqual(m, { paid: 100, outstanding: 43 }, "paid 100, due 43, VOID ignored");
  });

  await harness.test("T17-02: account status follows password and invite", async () => {
    harness.assertEqual(clientAccountStatus({ passwordHash: "x", inviteToken: "t" }), "REGISTERED", "password wins");
    harness.assertEqual(clientAccountStatus({ passwordHash: null, inviteToken: "t" }), "INVITED", "invite only");
    harness.assertEqual(clientAccountStatus({ passwordHash: null, inviteToken: null }), "GUEST", "neither");
  });

  await harness.test("T17-03: directory row has both bookings (guest matched by email) and correct totals", async () => {
    const rows = await loadClientDirectory(lumina.id);
    const row = rows.find((r) => r.id === client.id);
    harness.assert(!!row, "Client is listed");
    harness.assertEqual(row!.bookingCount, 2, "Linked booking plus the mixed-case guest booking");
    harness.assertEqual(row!.paid, 140, "Paid = 100 + 40");
    harness.assertEqual(row!.outstanding, 43, "Due = 25 + 10 + 5 + 3");
    harness.assertEqual(row!.accountStatus, "GUEST", "Quick-created, no password");
    harness.assert(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(row!.lastActivityLabel), "Last-active label is a date", row!.lastActivityLabel);
    harness.assert(!rows.some((r) => r.id === apexClient.id), "Another studio's client is not listed");
    harness.assert(rows.every((r) => r.id !== owner.id), "Staff accounts are not listed as clients");
  });

  await harness.test("T17-04: profile gathers the client's bookings and invoices", async () => {
    const p = await loadClientProfile(lumina.id, client.id);
    harness.assert(!!p, "Profile loads");
    harness.assertDeepEqual(
      p!.bookings.map((b) => b.id).sort(),
      [linked.id, guest.id].sort(),
      "Both bookings are on the profile"
    );
    harness.assertEqual(p!.invoices.length, 7, "All 7 invoices are listed");
    harness.assertDeepEqual(p!.money, { paid: 140, outstanding: 43 }, "Same totals as the directory");
  });

  await harness.test("T17-05: a client cannot be loaded through another studio", async () => {
    harness.assertEqual(await loadClientProfile(apex.id, client.id), null, "Lumina client via Apex is null");
    harness.assert(
      await isNotFound(() =>
        AdminClientPage({ params: Promise.resolve({ tenantSlug: "apex-media", clientId: client.id }) })
      ),
      "Admin client page 404s for another studio's client"
    );
    harness.assert(
      await isNotFound(() => AdminClientPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", clientId: owner.id }) })),
      "A staff account id is not a client page"
    );
  });

  const details = (over: Partial<Parameters<typeof updateClientDetails>[0]> = {}) => ({
    tenantId: lumina.id,
    tenantSlug: "lumina-cine",
    clientId: client.id,
    name: "Tess Seventeen",
    email,
    phone: "+60 12-345 6789",
    syncBookings: true,
    ...over,
  });

  await harness.test("T17-06: editing details needs this studio's staff", async () => {
    const anon = await withSession(null, () => updateClientDetails(details({ name: "Hacked" })));
    harness.assertEqual(anon.success, false, "Signed out is refused");
    const asClient = await withSession(as(client, "lumina-cine"), () => updateClientDetails(details({ name: "Hacked" })));
    harness.assertEqual(asClient.success, false, "A client cannot edit clients");
    const otherStudio = await withSession(as(apexOwner, "apex-media"), () => updateClientDetails(details({ name: "Hacked" })));
    harness.assertEqual(otherStudio.success, false, "Another studio's owner is refused");
    const crossTenantId = await withSession(as(apexOwner, "apex-media"), () =>
      updateClientDetails(details({ tenantId: apex.id, tenantSlug: "apex-media", name: "Hacked" }))
    );
    harness.assertEqual(crossTenantId.success, false, "Pointing at your own studio does not reach another studio's client");
    const fresh = await db.user.findUnique({ where: { id: client.id } });
    harness.assertEqual(fresh!.name, "Tess Seventeen", "Name unchanged after refused edits");
  });

  await harness.test("T17-07: an email already used at the studio is refused", async () => {
    const other = await db.user.create({
      data: { tenantId: lumina.id, name: "Taken", email: `t17-taken-${run}@example.test`, role: "CLIENT" },
    });
    const res = await withSession(as(owner, "lumina-cine"), () =>
      updateClientDetails(details({ email: other.email.toUpperCase() }))
    );
    harness.assertEqual(res.success, false, "Duplicate email refused (case-insensitive)");
    const bad = await withSession(as(owner, "lumina-cine"), () => updateClientDetails(details({ email: "not-an-email" })));
    harness.assertEqual(bad.success, false, "Invalid email refused");
  });

  await harness.test("T17-08: staff edit saves the account and syncs onto bookings", async () => {
    const newEmail = `t17-renamed-${run}@example.test`;
    const res = await withSession(as(crew, "lumina-cine"), () =>
      updateClientDetails(details({ name: "Tess Renamed", email: `  ${newEmail.toUpperCase()} `, phone: "+60 19-999 0000" }))
    );
    harness.assertEqual(res.success, true, "Crew member can edit", JSON.stringify(res));
    const fresh = await db.user.findUnique({ where: { id: client.id } });
    harness.assertEqual(fresh!.email, newEmail, "Email saved trimmed and lower-case");
    harness.assertEqual(fresh!.phone, "+60 19-999 0000", "Phone saved");
    const bookings = await db.clientBooking.findMany({ where: { id: { in: [linked.id, guest.id] } } });
    harness.assert(bookings.every((b) => b.clientName === "Tess Renamed" && b.clientEmail === newEmail), "Both bookings carry the new name and email");
    harness.assert(bookings.every((b) => b.userId === client.id), "The guest booking is now linked to the account");
    harness.assert(bookings.every((b) => b.clientPhone === "+60 19-999 0000"), "Bookings carry the new phone");
    const p = await loadClientProfile(lumina.id, client.id);
    harness.assertEqual(p!.bookings.length, 2, "Both bookings still on the profile after the email change");
  });

  await harness.test("T17-09: clearing the phone keeps the bookings' phone; syncBookings=false leaves bookings alone", async () => {
    const res = await withSession(as(owner, "lumina-cine"), () =>
      updateClientDetails(details({ name: "Tess Unsynced", email: `t17-renamed-${run}@example.test`, phone: "", syncBookings: false }))
    );
    harness.assertEqual(res.success, true, "Saved", JSON.stringify(res));
    const fresh = await db.user.findUnique({ where: { id: client.id } });
    harness.assertEqual(fresh!.phone, null, "Account phone cleared");
    const b = await db.clientBooking.findUnique({ where: { id: linked.id } });
    harness.assertEqual(b!.clientName, "Tess Renamed", "Booking name untouched when not syncing");
    harness.assertEqual(b!.clientPhone, "+60 19-999 0000", "Booking keeps its phone");
  });

  await harness.test("T17-10: studio notes are staff-only and never reach the client's own pages", async () => {
    const notesInput = { tenantId: lumina.id, tenantSlug: "lumina-cine", clientId: client.id, notes: "  Prefers morning shoots.  " };
    const anon = await withSession(null, () => updateClientNotes(notesInput));
    harness.assertEqual(anon.success, false, "Signed out cannot write notes");
    const asClient = await withSession(as(client, "lumina-cine"), () => updateClientNotes(notesInput));
    harness.assertEqual(asClient.success, false, "The client cannot write notes");
    const cross = await withSession(as(apexOwner, "apex-media"), () =>
      updateClientNotes({ ...notesInput, tenantId: apex.id, tenantSlug: "apex-media" })
    );
    harness.assertEqual(cross.success, false, "Another studio cannot write this client's notes");

    const ok = await withSession(as(owner, "lumina-cine"), () => updateClientNotes(notesInput));
    harness.assertEqual(ok.success, true, "Owner saves notes", JSON.stringify(ok));
    const p = await loadClientProfile(lumina.id, client.id);
    harness.assertEqual(p!.client.staffNotes, "Prefers morning shoots.", "Notes saved trimmed");

    const fresh = await db.user.findUniqueOrThrow({ where: { id: client.id } });
    const seenByClient = await withSession(as(fresh, "lumina-cine"), () => getSessionClient(lumina.id));
    harness.assert(!!seenByClient, "Client's own session loads their account");
    harness.assert(!("staffNotes" in (seenByClient as object)), "staffNotes is not on the client's own account record");

    const tooLong = await withSession(as(owner, "lumina-cine"), () => updateClientNotes({ ...notesInput, notes: "x".repeat(5001) }));
    harness.assertEqual(tooLong.success, false, "Notes over 5,000 characters refused");
    const cleared = await withSession(as(owner, "lumina-cine"), () => updateClientNotes({ ...notesInput, notes: "   " }));
    harness.assertEqual(cleared.success, true, "Blank notes save");
    const after = await db.user.findUnique({ where: { id: client.id } });
    harness.assertEqual(after!.staffNotes, null, "Blank notes are stored as null");
  });

  await harness.test("T17-11: export dates are the studio's calendar day, not UTC", async () => {
    // 20:00 UTC on 13 Nov is already 14 Nov in Kuala Lumpur (UTC+8), the default studio zone.
    const lateUtc = new Date("2026-11-13T20:00:00Z");
    harness.assertEqual(studioIsoDate(lateUtc), "2026-11-14", "ISO date uses the studio zone");
    harness.assertEqual(formatStudioDate(lateUtc), "14 Nov 2026", "Label uses the studio zone");
    const rows = await loadClientDirectory(lumina.id);
    const row = rows.find((r) => r.id === client.id)!;
    harness.assert(/^\d{4}-\d{2}-\d{2}$/.test(row.lastActivityDate), "Row carries a YYYY-MM-DD date", row.lastActivityDate);
  });

  await harness.test("T17-12: CSV export quotes cells and neutralises spreadsheet formulas", async () => {
    harness.assertEqual(csvCell("Plain"), "Plain", "Plain text untouched");
    harness.assertEqual(csvCell('Say "hi", ok'), '"Say ""hi"", ok"', "Quotes and commas are quoted");
    harness.assertEqual(csvCell("line1\nline2"), '"line1\nline2"', "Newlines are quoted");
    harness.assertEqual(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"", "Leading = is neutralised");
    harness.assertEqual(csvCell("@SUM(A1)"), "'@SUM(A1)", "Leading @ is neutralised");
    harness.assertEqual(csvCell("-2+3"), "'-2+3", "Formula-like minus is neutralised");
    harness.assertEqual(csvCell("+60 12-345 6789"), "+60 12-345 6789", "Phone numbers are left alone");
    harness.assertEqual(csvCell(-12.5), "-12.5", "Numbers are not prefixed");
    harness.assertEqual(csvCell(null), "", "Null is empty");
    harness.assertEqual(toCsv(["a", "b"], [[1, "x"]]), "a,b\r\n1,x\r\n", "Rows use CRLF");
  });
}
