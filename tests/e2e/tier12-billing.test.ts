/**
 * Tier 12: Booking billing
 * - A booking's price and deposit come from the service package the client chose
 * - Once the deposit is paid, a balance invoice is issued (price - deposit), exactly once
 * - QR/cash deposits with no payment proof are released after 24 hours
 * - A paid project retainer issues the final 50% balance invoice
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { createBookingForCustomer } from "@/lib/actions/admin-bookings";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { expireUnpaidDeposits, DEPOSIT_HOLD_HOURS } from "@/lib/bookings/expiry";

const DAY_MS = 86_400_000;

export async function runTier12BillingTests(harness: TestHarness) {
  harness.setSuite("Tier 12", "Booking Billing: Packages, Balance & Deposit Expiry");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants lumina-cine / apex-media are required");
  const owner = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!owner) throw new Error("Seed Lumina owner is required");
  const staff = {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    tenantId: owner.tenantId,
    tenantSlug: "lumina-cine",
  };

  // Lumina's commercial package (seed) and a second package in another category.
  const pkg = await db.servicePackage.findUnique({ where: { id: "pkg_lumina_comm" } });
  const otherCategoryPkg = await db.servicePackage.findUnique({ where: { id: "pkg_lumina_wed" } });
  const apexPkg = await db.servicePackage.findUnique({ where: { id: "pkg_apex_convo" } });
  if (!pkg || !otherCategoryPkg || !apexPkg) throw new Error("Seed packages are required");
  const balanceOf = (p: { price: number; depositPrice: number }) => p.price - p.depositPrice;

  const run = Date.now().toString(36);
  let seq = 0;
  const email = (tag: string) => `t12-${tag}-${run}-${++seq}@example.test`;
  const slotIds: string[] = [];
  const projectIds: string[] = [];

  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t12-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t12-" } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t12-" } } });
  });

  const makeSlot = async (category = "commercial", daysAhead = 20) => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category,
        date: new Date(Date.now() + daysAhead * DAY_MS),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        status: "AVAILABLE",
        price: 0,
        depositRequired: 100,
      },
    });
    slotIds.push(slot.id);
    return slot;
  };

  const checkout = (
    slotId: string,
    paymentMethod: "CARD" | "QR_CODE" | "CASH",
    extra: { packageId?: string; paymentProofUrl?: string; clientEmail?: string } = {}
  ) =>
    withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId,
        sessionId: `t12-${run}-${++seq}`,
        clientName: "Billing Client",
        clientEmail: extra.clientEmail ?? email("client"),
        clientPhone: "0123456789",
        paymentMethod,
        packageId: extra.packageId,
        paymentProofUrl: extra.paymentProofUrl,
      })
    ) as Promise<any>;

  const approve = (invoiceId: string, tenantId = lumina.id, slug = "lumina-cine") =>
    withSession(staff, () => approvePaymentVerification({ invoiceId, tenantId, tenantSlug: slug, staffName: "T12" })) as Promise<any>;

  const balanceFor = (bookingId: string) =>
    db.milestoneInvoice.findMany({ where: { bookingId, milestoneType: "BOOKING_BALANCE" } });

  // ============================================================================
  // 12.1 Package pricing
  // ============================================================================
  await harness.test("T12-PKG-01: a client must choose a package when the studio offers them", async () => {
    const slot = await makeSlot();
    const res = await checkout(slot.id, "QR_CODE");
    harness.assert(res.success === false, "Checkout without a package is refused");
    harness.assertEqual(res.error, "PACKAGE_REQUIRED", "Refused with PACKAGE_REQUIRED");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot untouched");
  });

  await harness.test("T12-PKG-02: packages from another category or studio are refused", async () => {
    const slot = await makeSlot();
    const wrongCategory = await checkout(slot.id, "QR_CODE", { packageId: otherCategoryPkg.id });
    harness.assertEqual(wrongCategory.error, "PACKAGE_MISMATCH", "Package for another category refused");
    const otherStudio = await checkout(slot.id, "QR_CODE", { packageId: apexPkg.id });
    harness.assertEqual(otherStudio.error, "PACKAGE_NOT_FOUND", "Another studio's package refused");
    const after = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(after?.status, "AVAILABLE", "Slot untouched");
  });

  await harness.test("T12-PKG-03: the chosen package sets the deposit and records the price", async () => {
    const slot = await makeSlot();
    const res = await checkout(slot.id, "QR_CODE", { packageId: pkg.id });
    harness.assert(res.success === true, `Checkout succeeds (${res.message ?? "ok"})`);
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(invoice?.amount, pkg.depositPrice, "Deposit invoice = package deposit (not the slot's RM 100)");
    harness.assertEqual(booking?.depositAmount, pkg.depositPrice, "Booking deposit = package deposit");
    harness.assertEqual(booking?.sessionPrice, pkg.price, "Booking records the package price");
    harness.assertEqual(booking?.packageName, pkg.name, "Booking records the package name");
    const hours = ((invoice?.dueDate.getTime() ?? 0) - (invoice?.createdAt.getTime() ?? 0)) / 3_600_000;
    harness.assert(Math.abs(hours - DEPOSIT_HOLD_HOURS) < 0.1, `Deposit due within ${DEPOSIT_HOLD_HOURS} hours (${hours.toFixed(2)}h)`);
    harness.assertEqual((await balanceFor(res.bookingId)).length, 0, "No balance invoice before the deposit is paid");
  });

  // ============================================================================
  // 12.2 Balance invoice once the deposit is paid
  // ============================================================================
  await harness.test("T12-BAL-01: approving the deposit issues one balance invoice, due after the session", async () => {
    const slot = await makeSlot("commercial", 20);
    const res = await checkout(slot.id, "QR_CODE", { packageId: pkg.id, paymentProofUrl: "/uploads/receipts/t12.jpg" });
    const ok = await approve(res.invoiceId);
    harness.assert(ok.success === true, `Deposit approved (${ok.message ?? "ok"})`);

    const balances = await balanceFor(res.bookingId);
    harness.assertEqual(balances.length, 1, "Exactly one balance invoice");
    const bal = balances[0];
    harness.assertEqual(bal?.amount, balanceOf(pkg), "Balance = package price - deposit");
    harness.assertEqual(bal?.status, "PENDING", "Balance awaits payment");
    harness.assertEqual(bal?.clientId, (await db.clientBooking.findUnique({ where: { id: res.bookingId } }))?.userId, "Billed to the booking's client");
    harness.assert((bal?.dueDate.getTime() ?? 0) >= slot.date.getTime() + 7 * DAY_MS - 1000, "Due 7 days after the session date");

    const again = await approve(res.invoiceId);
    harness.assert(again.success === false, "Approving the same deposit twice is refused");
    harness.assertEqual((await balanceFor(res.bookingId)).length, 1, "Still exactly one balance invoice");
  });

  await harness.test("T12-BAL-02: an instantly paid card deposit issues the balance at once", async () => {
    const prev = process.env.ALLOW_SIMULATED_CARD_PAYMENTS;
    process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "true";
    try {
      const slot = await makeSlot();
      const res = await checkout(slot.id, "CARD", { packageId: pkg.id });
      harness.assertEqual(res.status, "PAID", "Simulated card deposit is PAID");
      const balances = await balanceFor(res.bookingId);
      harness.assertEqual(balances.length, 1, "Balance invoice issued");
      harness.assertEqual(balances[0]?.amount, balanceOf(pkg), "Balance amount correct");
    } finally {
      process.env.ALLOW_SIMULATED_CARD_PAYMENTS = prev;
    }
  });

  await harness.test("T12-BAL-03: staff bookings: paid with a package issues the balance; no package issues none", async () => {
    const paid: any = await withSession(staff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot()).id,
        newClient: { name: "Walk In", email: email("walkin"), phone: "0123456789" },
        paymentStatus: "PAID",
        packageId: pkg.id,
      })
    );
    harness.assert(paid.success === true, `Staff booking created (${paid.error ?? "ok"})`);
    const bal = await balanceFor(paid.bookingId);
    harness.assertEqual(bal.length, 1, "Balance issued for a paid package booking");
    harness.assertEqual(bal[0]?.amount, balanceOf(pkg), "Balance amount correct");

    const noPkg: any = await withSession(staff, async () =>
      createBookingForCustomer({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        slotId: (await makeSlot()).id,
        newClient: { name: "No Package", email: email("nopkg"), phone: "0123456789" },
        paymentStatus: "PAID",
      })
    );
    harness.assert(noPkg.success === true, "Staff may book without a package");
    harness.assertEqual((await balanceFor(noPkg.bookingId)).length, 0, "No price known, so no balance invoice");
  });

  await harness.test("T12-BAL-04: the balance is paid like any invoice and leaves the booking confirmed", async () => {
    const slot = await makeSlot();
    const res = await checkout(slot.id, "QR_CODE", { packageId: pkg.id, paymentProofUrl: "/uploads/receipts/t12.jpg" });
    await approve(res.invoiceId);
    const [bal] = await balanceFor(res.bookingId);

    const pay: any = await withSession(null, () =>
      processInvoicePayment({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        invoiceId: bal!.id,
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t12-balance.jpg",
      })
    );
    harness.assert(pay.success === true, `Balance slip submitted (${pay.message ?? "ok"})`);
    const settled = await approve(bal!.id);
    harness.assert(settled.success === true, "Balance approved");
    const paidBal = await db.milestoneInvoice.findUnique({ where: { id: bal!.id } });
    harness.assertEqual(paidBal?.status, "PAID", "Balance invoice PAID");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.status, "CONFIRMED", "Booking stays CONFIRMED");
    harness.assertEqual((await balanceFor(res.bookingId)).length, 1, "Paying the balance issues nothing further");
  });

  // ============================================================================
  // 12.3 24-hour deposit hold
  // ============================================================================
  const ageBooking = async (bookingId: string, hours: number) => {
    await db.clientBooking.update({ where: { id: bookingId }, data: { createdAt: new Date(Date.now() - hours * 3_600_000) } });
  };

  await harness.test("T12-EXP-01: unpaid QR (no slip) and cash deposits are released after 24 hours", async () => {
    const qrSlot = await makeSlot();
    const qr = await checkout(qrSlot.id, "QR_CODE", { packageId: pkg.id });
    const cashSlot = await makeSlot();
    const cash = await checkout(cashSlot.id, "CASH", { packageId: pkg.id });
    await ageBooking(qr.bookingId, 25);
    await ageBooking(cash.bookingId, 25);

    const n = await expireUnpaidDeposits(lumina.id);
    harness.assert(n >= 2, `Expired at least the two stale bookings (${n})`);
    for (const [label, res, slot] of [["QR", qr, qrSlot], ["Cash", cash, cashSlot]] as const) {
      const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
      const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
      const freed = await db.bookingSlot.findUnique({ where: { id: slot.id } });
      harness.assertEqual(booking?.status, "CANCELLED", `${label}: booking cancelled`);
      harness.assertEqual(freed?.status, "AVAILABLE", `${label}: slot reopened`);
      harness.assertEqual(invoice?.status, "VOID", `${label}: deposit invoice voided`);
    }
  });

  await harness.test("T12-EXP-02: recent bookings, uploaded slips and paid deposits are kept", async () => {
    const recent = await checkout((await makeSlot()).id, "QR_CODE", { packageId: pkg.id });
    await ageBooking(recent.bookingId, 23);
    const withSlip = await checkout((await makeSlot()).id, "QR_CODE", { packageId: pkg.id, paymentProofUrl: "/uploads/receipts/t12.jpg" });
    await ageBooking(withSlip.bookingId, 30);
    const paid = await checkout((await makeSlot()).id, "QR_CODE", { packageId: pkg.id, paymentProofUrl: "/uploads/receipts/t12.jpg" });
    await approve(paid.invoiceId);
    await ageBooking(paid.bookingId, 30);

    await expireUnpaidDeposits(lumina.id);
    const status = async (id: string) => (await db.clientBooking.findUnique({ where: { id } }))?.status;
    harness.assertEqual(await status(recent.bookingId), "PENDING", "Under 24 hours: kept");
    harness.assertEqual(await status(withSlip.bookingId), "PENDING", "Slip uploaded, waiting for review: kept");
    harness.assertEqual(await status(paid.bookingId), "CONFIRMED", "Paid deposit: kept");
  });

  await harness.test("T12-EXP-03: a voided deposit invoice can't be paid or approved", async () => {
    const res = await checkout((await makeSlot()).id, "QR_CODE", { packageId: pkg.id });
    await ageBooking(res.bookingId, 25);
    await expireUnpaidDeposits(lumina.id);

    const pay: any = await withSession(null, () =>
      processInvoicePayment({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        invoiceId: res.invoiceId,
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/late.jpg",
      })
    );
    harness.assertEqual(pay.error, "INVOICE_VOID", "Late payment refused");
    const ok = await approve(res.invoiceId);
    harness.assertEqual(ok.error, "INVOICE_VOID", "Approval refused");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.status, "CANCELLED", "Booking stays cancelled");
  });

  // ============================================================================
  // 12.4 Project final balance
  // ============================================================================
  await harness.test("T12-FIN-01: a paid retainer issues the project's final balance invoice once", async () => {
    const clientEmail = email("project");
    const client = await db.user.create({
      data: { tenantId: lumina.id, name: "Project Client", email: clientEmail, phone: "0123456789", role: "CLIENT" },
    });
    const project = await db.project.create({
      data: {
        tenantId: lumina.id,
        projectNumber: `PRJ-T12-${run}`,
        title: "T12 Project",
        clientId: client.id,
        studioLeadId: owner.id,
        discipline: "PHOTOGRAPHY",
        budget: 2000,
      },
    });
    projectIds.push(project.id);
    const retainer = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id,
        invoiceNumber: `INV-T12-${run}`,
        clientId: client.id,
        projectId: project.id,
        milestoneType: "RETAINER_50",
        amount: 1000,
        status: "PENDING_VERIFICATION",
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t12.jpg",
        dueDate: new Date(Date.now() + DAY_MS),
      },
    });

    const ok = await approve(retainer.id);
    harness.assert(ok.success === true, `Retainer approved (${ok.message ?? "ok"})`);
    const finals = await db.milestoneInvoice.findMany({ where: { projectId: project.id, milestoneType: "FINAL_BALANCE_50" } });
    harness.assertEqual(finals.length, 1, "Final balance invoice issued");
    harness.assertEqual(finals[0]?.amount, 1000, "Final balance = budget - retainer");
    harness.assertEqual(finals[0]?.status, "PENDING", "Final balance awaits payment");

    const pay: any = await withSession(null, () =>
      processInvoicePayment({
        tenantId: lumina.id,
        tenantSlug: "lumina-cine",
        invoiceId: finals[0]!.id,
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/t12-final.jpg",
      })
    );
    harness.assert(pay.success === true, "Final balance slip submitted");
    await approve(finals[0]!.id);
    const unlocked = await db.project.findUnique({ where: { id: project.id } });
    harness.assertEqual(unlocked?.isFinalBalancePaid, true, "Paying the final balance unlocks the vault");
    const again = await db.milestoneInvoice.count({ where: { projectId: project.id, milestoneType: "FINAL_BALANCE_50" } });
    harness.assertEqual(again, 1, "No second final balance invoice");
  });
}
