/**
 * Tier 18: Where checkout sends the client, and what they see there
 * - Booking confirmations by payment method (slip, cash, simulated card)
 * - Invoice confirmations, before and after the studio approves the slip
 * - A confirmation link only ever shows the signed-in client's own booking or invoice
 * - The account and invoice pages render the confirmation only when asked and allowed
 * - Checkout sends clients to their invoice, staff to the admin invoice
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { expectSuccess } from "./result-helpers";
import { findProp, provideReactGlobal } from "./react-tree";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { loadBookingConfirmation, loadInvoiceConfirmation, type PaymentConfirmation } from "@/lib/payments/confirmation";
import { DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";
import { signedOutHref } from "@/lib/auth/signed-out";
import ClientAccountPage from "@/app/[tenantSlug]/account/page";
import ClientInvoicePage from "@/app/[tenantSlug]/account/invoices/[invoiceId]/page";
import CheckoutPage from "@/app/[tenantSlug]/checkout/page";

const DAY_MS = 86_400_000;

export async function runTier18PaymentConfirmationTests(harness: TestHarness) {
  harness.setSuite("Tier 18", "Post-Payment Landing & Confirmation");
  await provideReactGlobal();

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const owner = await db.user.findFirst({ where: { tenantId: lumina!.id, role: "STUDIO_OWNER" } });
  const pkg = await db.servicePackage.findUnique({ where: { id: "pkg_lumina_comm" } });
  if (!lumina || !apex || !owner || !pkg) throw new Error("Seed data is required for Tier 18");

  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: "lumina-cine",
  });

  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t18-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t18-" } } });
    // Approving a commercial deposit provisions a project for the client.
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t18-" } } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t18-" } } });
  });

  let seq = 0;
  const book = async (method: "QR_CODE" | "CASH" | "CARD") => {
    seq += 1;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "commercial",
        date: new Date(Date.now() + (20 + seq) * DAY_MS),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 0,
        depositRequired: 100,
      },
    });
    slotIds.push(slot.id);
    const clientEmail = `t18-${method.toLowerCase()}-${run}-${seq}@example.test`;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: slot.id,
        sessionId: `t18-${run}-${seq}`,
        clientName: "Confirm Client",
        clientEmail,
        clientPhone: "0123456789",
        paymentMethod: method,
        ...(method === "QR_CODE" ? { paymentProofUrl: "/uploads/receipts/t18.jpg" } : {}),
        packageId: pkg.id,
      })
    );
    expectSuccess(res, `${method} checkout`);
    const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, email: clientEmail } });
    return { res, client };
  };

  const qr = await book("QR_CODE");
  const cash = await book("CASH");
  const card = await book("CARD");

  await harness.test("T18-BOOK-01: a slip payment is 'received, awaiting the studio's check'", async () => {
    const c = await loadBookingConfirmation(lumina.id, qr.client.id, qr.res.trackingCode!);
    harness.assertEqual(c?.state, "AWAITING_CHECK", "Awaiting the studio's check");
    harness.assertEqual(c?.kind, "BOOKING", "Booking confirmation");
    harness.assertEqual(c?.trackingCode, qr.res.trackingCode, "Carries the tracking code");
    harness.assertEqual(c?.paymentMethod, "QR_CODE", "Slip method");
    harness.assertEqual(c?.amount, pkg.depositPrice, "Amount is the package deposit");
    harness.assertEqual(c?.holdHours, null, "No hold countdown while a slip waits for review");
  });

  await harness.test("T18-BOOK-02: cash is 'pay at the studio' with the hold time, never 'payment submitted'", async () => {
    const c = await loadBookingConfirmation(lumina.id, cash.client.id, cash.res.trackingCode!);
    harness.assertEqual(c?.state, "PAY_AT_STUDIO", "Pay at the studio");
    harness.assertEqual(c?.paymentMethod, "CASH", "Cash method");
    harness.assertEqual(c?.holdHours, DEPOSIT_HOLD_HOURS, "Tells how long the slot is held");
  });

  await harness.test("T18-BOOK-03: a settled card payment is 'confirmed'", async () => {
    const c = await loadBookingConfirmation(lumina.id, card.client.id, card.res.trackingCode!);
    harness.assertEqual(c?.state, "PAID", "Confirmed");
  });

  await harness.test("T18-SEC-01: a tracking code only confirms the signed-in client's own booking", async () => {
    harness.assertEqual(await loadBookingConfirmation(lumina.id, cash.client.id, qr.res.trackingCode!), null, "Another client's code: nothing");
    harness.assertEqual(await loadBookingConfirmation(apex.id, qr.client.id, qr.res.trackingCode!), null, "Through another studio: nothing");
    harness.assertEqual(await loadBookingConfirmation(lumina.id, qr.client.id, "BK-NOT-REAL"), null, "Unknown code: nothing");
    harness.assertEqual(await loadInvoiceConfirmation(lumina.id, cash.client.id, qr.res.invoiceId!), null, "Another client's invoice: nothing");
  });

  await harness.test("T18-INV-01: an invoice confirmation follows the studio's approval", async () => {
    const before = await loadInvoiceConfirmation(lumina.id, qr.client.id, qr.res.invoiceId!);
    harness.assertEqual(before?.state, "AWAITING_CHECK", "Before approval: awaiting check");
    harness.assertEqual(before?.invoiceNumber, qr.res.invoiceNumber, "Invoice number");
    await withSession(as(owner), () =>
      approvePaymentVerification({ invoiceId: qr.res.invoiceId!, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    const after = await loadInvoiceConfirmation(lumina.id, qr.client.id, qr.res.invoiceId!);
    harness.assertEqual(after?.state, "PAID", "After approval: paid");
    harness.assertEqual(after?.vaultProjectId, null, "A deposit does not open a vault");
    const booking = await loadBookingConfirmation(lumina.id, qr.client.id, qr.res.trackingCode!);
    harness.assertEqual(booking?.state, "PAID", "The booking now reads as confirmed too");
  });

  // ---- Pages -------------------------------------------------------------------------
  const accountPage = (code?: string) =>
    ClientAccountPage({
      params: Promise.resolve({ tenantSlug: "lumina-cine" }),
      searchParams: Promise.resolve(code ? { tab: "bookings", confirmed: code } : { tab: "bookings" }),
    });
  const bannerOf = (tree: unknown) => findProp<PaymentConfirmation>(findProp(tree, "banner"), "confirmation");

  await harness.test("T18-PAGE-01: My account shows the confirmation for the client's own booking only", async () => {
    const own = await withSession(as(cash.client), () => accountPage(cash.res.trackingCode));
    harness.assertEqual(bannerOf(own)?.state, "PAY_AT_STUDIO", "Own booking: banner with its state");
    const other = await withSession(as(cash.client), () => accountPage(card.res.trackingCode));
    harness.assertEqual(findProp(other, "banner"), null, "Someone else's code: no banner");
    const plain = await withSession(as(cash.client), () => accountPage());
    harness.assertEqual(findProp(plain, "banner"), null, "No code: no banner");
  });

  const invoicePage = (invoiceId: string, paid: boolean) =>
    ClientInvoicePage({
      params: Promise.resolve({ tenantSlug: "lumina-cine", invoiceId }),
      searchParams: Promise.resolve(paid ? { paid: "1" } : {}),
    });

  await harness.test("T18-PAGE-02: the invoice page shows the payment confirmation when arriving from checkout", async () => {
    const arrived = await withSession(as(qr.client), () => invoicePage(qr.res.invoiceId!, true));
    harness.assertEqual(findProp<PaymentConfirmation>(arrived, "confirmation")?.state, "PAID", "Arriving from checkout: confirmation shown");
    const later = await withSession(as(qr.client), () => invoicePage(qr.res.invoiceId!, false));
    harness.assertEqual(findProp(later, "confirmation"), undefined, "Opened normally: no confirmation");
  });

  await harness.test("T18-OUT-01: sign-out destinations carry the signed-out flag, keeping their query", async () => {
    harness.assertEqual(signedOutHref("/lumina-cine"), "/lumina-cine?signedOut=1", "Plain path");
    harness.assertEqual(signedOutHref("/lumina-cine/login?callbackUrl=%2Fx"), "/lumina-cine/login?callbackUrl=%2Fx&signedOut=1", "Existing query kept");
    harness.assertEqual(signedOutHref("/a?signedOut=1"), "/a?signedOut=1", "Not doubled");
  });

  await harness.test("T18-PAGE-03: after paying an invoice, clients go to their invoice and staff to the admin invoice", async () => {
    const checkoutFor = () =>
      CheckoutPage({
        params: Promise.resolve({ tenantSlug: "lumina-cine" }),
        searchParams: Promise.resolve({ invoiceId: cash.res.invoiceId! }),
      });
    const byClient = await withSession(as(cash.client), checkoutFor);
    harness.assertEqual(
      findProp(byClient, "invoiceDoneHref"),
      `/lumina-cine/account/invoices/${cash.res.invoiceId}?paid=1`,
      "Client: their invoice, with the confirmation"
    );
    const byStaff = await withSession(as(owner), checkoutFor);
    harness.assertEqual(findProp(byStaff, "invoiceDoneHref"), `/lumina-cine/admin/invoices/${cash.res.invoiceId}`, "Staff: the admin invoice");
  });
}
