/**
 * Tier 13: Invoice documents
 * - The invoice document carries the studio, client, booking and payment plan
 * - Clients can open only their own invoices; staff are sent to the admin view
 * - The admin invoice view is scoped to the studio
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { loadInvoiceDocument, type InvoiceDocument } from "@/lib/invoices/document";
import ClientInvoicePage from "@/app/[tenantSlug]/account/invoices/[invoiceId]/page";
import AdminInvoicePage from "@/app/[tenantSlug]/admin/invoices/[invoiceId]/page";
import { expectSuccess } from "./result-helpers";
import { findProp, provideReactGlobal } from "./react-tree";
import { BOOKING_MILESTONES, billSums, invoiceBookingId, invoiceProposalId } from "@/lib/invoices/bill-groups";

const DAY_MS = 86_400_000;

/** Next's notFound()/redirect() throw errors tagged with a digest. */
async function outcome(fn: () => Promise<unknown>): Promise<{ kind: "ok"; tree: unknown } | { kind: "notFound" } | { kind: "redirect"; to: string }> {
  try {
    return { kind: "ok", tree: await fn() };
  } catch (err) {
    const digest = String((err as { digest?: unknown } | null)?.digest ?? "");
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { kind: "notFound" };
    if (digest.startsWith("NEXT_REDIRECT")) return { kind: "redirect", to: digest.split(";")[2] ?? "" };
    throw err;
  }
}


export async function runTier13InvoiceTests(harness: TestHarness) {
  harness.setSuite("Tier 13", "Invoice Documents & Access");
  await provideReactGlobal();

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const owner = await db.user.findFirst({ where: { tenantId: lumina!.id, role: "STUDIO_OWNER" } });
  const apexOwner = await db.user.findFirst({ where: { tenantId: apex!.id, role: "STUDIO_OWNER" } });
  const pkg = await db.servicePackage.findUnique({ where: { id: "pkg_lumina_comm" } });
  if (!lumina || !apex || !owner || !apexOwner || !pkg) throw new Error("Seed data is required");

  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }, slug: string) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: slug,
  });

  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t13-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t13-" } } });
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t13-" } } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t13-" } } });
  });

  // A client with a package booking whose deposit has been approved (so a balance invoice exists).
  const clientEmail = `t13-owner-${run}@example.test`;
  const slot = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      category: "commercial",
      date: new Date(Date.now() + 14 * DAY_MS),
      startTime: "02:00 PM",
      endTime: "03:00 PM",
      status: "AVAILABLE",
      price: 0,
      depositRequired: 100,
    },
  });
  slotIds.push(slot.id);
  const booked = await withSession(null, () =>
    processBookingCheckout({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: `t13-${run}`,
      clientName: "Invoice Owner",
      clientEmail,
      clientPhone: "0123456789",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/t13.jpg",
      packageId: pkg.id,
    })
  );
  expectSuccess(booked, "booked");
  if (!booked.success) throw new Error(`T13 setup booking failed: ${booked.message}`);
  await withSession(as(owner, "lumina-cine"), () =>
    approvePaymentVerification({ invoiceId: booked.invoiceId, tenantId: lumina.id, tenantSlug: "lumina-cine" })
  );
  const client = await db.user.findFirst({ where: { tenantId: lumina.id, email: clientEmail } });
  const balance = await db.milestoneInvoice.findFirst({ where: { bookingId: booked.bookingId, milestoneType: "BOOKING_BALANCE" } });
  const otherClient = await db.user.create({
    data: { tenantId: lumina.id, name: "Someone Else", email: `t13-other-${run}@example.test`, role: "CLIENT" },
  });

  const clientPage = (invoiceId: string) => () =>
    ClientInvoicePage({ params: Promise.resolve({ tenantSlug: "lumina-cine", invoiceId }), searchParams: Promise.resolve({}) });

  await harness.test("T13-DOC-01: a paid deposit renders as a receipt with the session payment plan", async () => {
    const doc = await loadInvoiceDocument(lumina.id, booked.invoiceId);
    harness.assert(!!doc, "Document loads");
    harness.assertEqual(doc?.status, "PAID", "Deposit is paid");
    harness.assertEqual(doc?.title, "Booking deposit", "Titled as a booking deposit");
    harness.assertEqual(doc?.studio.name, lumina.name, "Studio name on the document");
    harness.assertEqual(doc?.studio.contactEmail, owner.email, "Studio owner as contact");
    harness.assertEqual(doc?.client.email, clientEmail, "Billed to the client");
    harness.assertEqual(doc?.booking?.packageName, pkg.name, "Package shown");
    harness.assertEqual(doc?.booking?.sessionPrice, pkg.price, "Session price in the payment plan");
    harness.assertEqual(doc?.booking?.startTime, "02:00 PM", "Session time shown");
    harness.assertEqual(doc?.lines[0]?.amount, pkg.depositPrice, "Line amount = deposit");
    harness.assert(doc?.lines[0]?.description.includes(pkg.name) ?? false, "Line names the package");
  });

  await harness.test("T13-DOC-02: the balance invoice is titled and linked to the same booking", async () => {
    harness.assert(!!balance, "Balance invoice exists");
    const doc = await loadInvoiceDocument(lumina.id, balance!.id);
    harness.assertEqual(doc?.title, "Session balance", "Titled as the session balance");
    harness.assertEqual(doc?.status, "PENDING", "Unpaid");
    harness.assertEqual(doc?.booking?.trackingCode, (await db.clientBooking.findUnique({ where: { id: booked.bookingId } }))?.trackingCode, "Same booking");
    harness.assertEqual(doc?.amount, pkg.price - pkg.depositPrice, "Balance amount");
  });

  await harness.test("T13-DOC-03: invoices are scoped to their studio", async () => {
    const doc = await loadInvoiceDocument(apex.id, booked.invoiceId);
    harness.assert(doc === null, "Another studio cannot load this invoice");
  });

  await harness.test("T13-ACC-01: the client sees their own invoice and receipt", async () => {
    const res = await withSession(as(client!, "lumina-cine"), () => outcome(clientPage(balance!.id)));
    harness.assertEqual(res.kind, "ok", "Own invoice renders");
    const doc = res.kind === "ok" ? findProp<InvoiceDocument>(res.tree, "doc") : null;
    harness.assertEqual(doc?.id, balance!.id, "Renders the requested invoice");
    const receipt = await withSession(as(client!, "lumina-cine"), () => outcome(clientPage(booked.invoiceId)));
    harness.assertEqual(receipt.kind, "ok", "Own receipt renders");
  });

  await harness.test("T13-ACC-02: other clients, anonymous visitors and other studios can't open it", async () => {
    const other = await withSession(as(otherClient, "lumina-cine"), () => outcome(clientPage(balance!.id)));
    harness.assertEqual(other.kind, "notFound", "Another client gets 'not found'");
    const anon = await withSession(null, () => outcome(clientPage(balance!.id)));
    harness.assertEqual(anon.kind, "redirect", "Anonymous visitor is sent to sign in");
    harness.assert(anon.kind === "redirect" && anon.to.includes("/login"), "Redirected to the login page");
    const apexStaff = await withSession(as(apexOwner, "apex-media"), () =>
      outcome(() => AdminInvoicePage({ params: Promise.resolve({ tenantSlug: "apex-media", invoiceId: balance!.id }) }))
    );
    harness.assertEqual(apexStaff.kind, "notFound", "Another studio's admin view can't show it");
  });

  await harness.test("T13-ACC-03: staff opening a client invoice link are sent to the admin view", async () => {
    const res = await withSession(as(owner, "lumina-cine"), () => outcome(clientPage(balance!.id)));
    harness.assertEqual(res.kind, "redirect", "Staff are redirected");
    harness.assert(res.kind === "redirect" && res.to.endsWith(`/lumina-cine/admin/invoices/${balance!.id}`), "To the admin invoice view");
    const admin = await withSession(as(owner, "lumina-cine"), () =>
      outcome(() => AdminInvoicePage({ params: Promise.resolve({ tenantSlug: "lumina-cine", invoiceId: balance!.id }) }))
    );
    harness.assertEqual(admin.kind, "ok", "Admin view renders for the studio");
  });

  await harness.test("T13-GROUP-01: a print order for a booking's gallery goes on that booking's bill", async () => {
    const byProject = new Map([["proj-1", "booking-1"]]);
    harness.assertEqual(invoiceBookingId({ bookingId: "booking-1", proposalId: null, projectId: "proj-1" }, byProject), "booking-1", "Deposit: its own booking");
    harness.assertEqual(invoiceBookingId({ bookingId: null, proposalId: null, projectId: "proj-1" }, byProject), "booking-1", "Print order: the booking whose gallery it's from");
    harness.assertEqual(invoiceBookingId({ bookingId: null, proposalId: null, projectId: "proj-other" }, byProject), null, "A gallery with no booking: on its own");
    harness.assertEqual(invoiceBookingId({ bookingId: null, proposalId: "prop-1", projectId: "proj-1" }, byProject), null, "A proposal invoice stays with its proposal");
    harness.assertEqual(invoiceBookingId({ bookingId: null, proposalId: null, projectId: null }, byProject), null, "A custom invoice: on its own");
    const byProposalProject = new Map([["proj-2", "prop-1"]]);
    harness.assertEqual(invoiceProposalId({ proposalId: "prop-1", projectId: "proj-2" }, byProposalProject), "prop-1", "Retainer: its own proposal");
    harness.assertEqual(invoiceProposalId({ proposalId: null, projectId: "proj-2" }, byProposalProject), "prop-1", "Print order: the proposal billed for that gallery");
    harness.assertEqual(invoiceProposalId({ proposalId: null, projectId: null }, byProposalProject), null, "A custom invoice: on its own");
  });

  await harness.test("T13-GROUP-02: the booking's bill totals the session and its extras", async () => {
    const deposit = { milestoneType: "BOOKING_DEPOSIT", status: "PAID", amount: 100 };
    const balance = { milestoneType: "BOOKING_BALANCE", status: "PAID", amount: 150 };
    const prints = { milestoneType: "PRINT_FRAME_ORDER", status: "PENDING_VERIFICATION", amount: 350 };
    const review = billSums(250, [deposit, balance, prints], BOOKING_MILESTONES);
    harness.assertEqual(review.totalAmount, 600, "Session 250 + prints 350");
    harness.assertEqual(review.paidAmount, 250, "Paid so far");
    harness.assertEqual(review.isFullyPaid, false, "A slip under review isn't settled");
    harness.assertEqual(review.hasReview, true, "Shown as under review");
    harness.assertEqual(review.percentage, 42, "Paid share of the whole bill");
    const settled = billSums(250, [deposit, balance, { ...prints, status: "PAID" }], BOOKING_MILESTONES);
    harness.assertEqual(settled.isFullyPaid, true, "Settled once the prints are paid");
    harness.assertEqual(settled.percentage, 100, "Full bar");
    const voided = billSums(250, [deposit, balance, { ...prints, status: "VOID" }], BOOKING_MILESTONES);
    harness.assertEqual(voided.totalAmount, 250, "A voided print order doesn't count");
    const noPrice = billSums(0, [deposit, { ...balance, status: "PENDING" }], BOOKING_MILESTONES);
    harness.assertEqual(noPrice.totalAmount, 250, "No session price: the plan's invoices make the total");
    harness.assertEqual(noPrice.balanceDue, 150, "Balance due");
  });
}
