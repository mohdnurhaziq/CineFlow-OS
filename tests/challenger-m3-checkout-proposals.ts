/**
 * Challenger Verification Suite: Milestone 3 Modules 3 & 4
 * Features 15 through 23 of CineFlow OS
 *
 * Mandatory Empirical Stress-Testing:
 * 1. Slot Hold & Checkout Concurrency:
 *    - Expired hold checkout rejection
 *    - Expired hold reclamation
 *    - Concurrent hold collisions (simultaneous holds)
 *    - Concurrent checkout collisions (simultaneous checkouts on same slot)
 *    - Double-submit duplicate checkout prevention
 * 2. Checkout Method Invariants:
 *    - Card checkout -> PAID invoice, CONFIRMED booking, BOOKED slot
 *    - QR checkout -> PENDING_VERIFICATION invoice, PENDING booking, PENDING_VERIFICATION slot
 *    - Cash checkout -> PENDING_VERIFICATION invoice, PENDING booking, PENDING_VERIFICATION slot
 *    - Direct invoice payment & ALREADY_PAID guards
 *    - Multi-tenant checkout isolation
 * 3. Studio Manual Verification 1-Click Approve / Reject:
 *    - 1-Click Approve -> PAID invoice, CONFIRMED booking, BOOKED slot
 *    - 1-Click Reject -> REJECTED invoice, CANCELLED booking, AVAILABLE slot (heldUntil & heldBySessionId nulled)
 *    - Immediate re-booking of released slot
 *    - Reason string validation (< 3 chars rejected)
 *    - Multi-tenant isolation guards
 * 4. Interactive Proposal Calculations & Digital Signature:
 *    - Base price recalculation with zero add-ons
 *    - Dynamic recalculation with selected add-ons
 *    - Exact cent math (50% deposit + 50% balance == total price)
 *    - Malformed signature rejection (< 50 chars)
 *    - Missing consent rejection
 *    - Project creation (PRE_PRODUCTION) & Retainer invoice generation (RETAINER_50)
 *    - Idempotency & Tamper Resistance (re-acceptance cannot overwrite signature or price)
 *    - Multi-tenant proposal isolation
 */

import { db } from "@/lib/db";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { approvePaymentVerification, rejectPaymentVerification } from "@/lib/actions/admin-verification";
import { acceptProposal, toggleProposalAddOn } from "@/lib/actions/proposals";
import { holdBookingSlot } from "@/lib/actions/booking";

async function runChallengerM3Suite() {
  console.log("==================================================================");
  console.log("   CineFlow OS Milestone 3 Empirical Adversarial Challenge Suite  ");
  console.log("   Target: Modules 3 & 4 (Features 15-23: Checkout & Proposals)   ");
  console.log("==================================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, failureDetails?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS [${totalTests}]: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL [${totalTests}]: ${testName}`);
      if (failureDetails) {
        console.error(`     ↳ Details: ${failureDetails}`);
      }
      failedTests++;
      process.exitCode = 1;
    }
  }

  // Resolve Test Tenants
  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Required tenants 'lumina-cine' or 'apex-media' missing. Run database seed first.");
  }

  const validSignature =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==_VALID_SIGNATURE_DATA_PADDING_FOR_TESTS_1234567890";

  // ============================================================================
  // MANDATE 1: Slot Hold & Checkout Concurrency
  // ============================================================================
  console.log("\n==================================================================");
  console.log("MANDATE 1: Slot Hold & Checkout Concurrency");
  console.log("==================================================================");

  // 1.1 Expired Hold Direct Checkout by Hold Holder
  console.log("\n--- 1.1 Expired Slot Hold Direct Checkout Rejection ---");
  {
    const expiredSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 2),
        startTime: "09:00 AM",
        endTime: "10:00 AM",
        category: "COMMERCIAL",
        price: 800.0,
        depositRequired: 400.0,
        status: "HELD",
        heldUntil: new Date(Date.now() - 1000 * 60 * 5), // Expired 5 minutes ago
        heldBySessionId: "sess_expired_holder_1",
      },
    });

    // Attempt checkout by the original hold session
    const resHolder = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: expiredSlot.id,
      sessionId: "sess_expired_holder_1",
      clientName: "Expired Holder",
      clientEmail: `holder.${Date.now()}@test.com`,
      clientPhone: "+15550001",
      paymentMethod: "CARD",
    });

    assert(
      resHolder.success === false && resHolder.error === "SLOT_EXPIRED_OR_UNAVAILABLE",
      "Original holder cannot checkout after hold expiration (SLOT_EXPIRED_OR_UNAVAILABLE)",
      JSON.stringify(resHolder)
    );

    // 1.2 Expired Hold Direct Checkout by Third Party
    const resThirdParty = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: expiredSlot.id,
      sessionId: "sess_third_party_2",
      clientName: "Third Party",
      clientEmail: `third.${Date.now()}@test.com`,
      clientPhone: "+15550002",
      paymentMethod: "CARD",
    });

    assert(
      resThirdParty.success === false && resThirdParty.error === "SLOT_EXPIRED_OR_UNAVAILABLE",
      "Third party cannot directly checkout an expired unreleased hold",
      JSON.stringify(resThirdParty)
    );

    // 1.3 Expired Hold Reclamation via holdBookingSlot
    const reclaimRes = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: expiredSlot.id,
      sessionId: "sess_reclaimer_3",
    });

    assert(reclaimRes.success === true, "Third party can reclaim expired slot hold via holdBookingSlot");

    const reclaimedSlot = await db.bookingSlot.findUnique({ where: { id: expiredSlot.id } });
    assert(
      reclaimedSlot?.heldBySessionId === "sess_reclaimer_3" &&
        reclaimedSlot.status === "HELD" &&
        Boolean(reclaimedSlot.heldUntil && reclaimedSlot.heldUntil > new Date()),
      "Reclaimed slot is now owned by reclaimer with a fresh future hold timestamp"
    );

    // 1.4 Active Hold Conflict Protection
    const unauthorizedCheckout = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: expiredSlot.id,
      sessionId: "sess_intruder_4",
      clientName: "Intruder User",
      clientEmail: `intruder.${Date.now()}@test.com`,
      clientPhone: "+15550003",
      paymentMethod: "CARD",
    });

    assert(
      unauthorizedCheckout.success === false && unauthorizedCheckout.error === "SLOT_EXPIRED_OR_UNAVAILABLE",
      "Intruder cannot checkout a slot held by an active session"
    );
  }

  // 1.5 Concurrency Race: Simultaneous holdBookingSlot on Same Available Slot
  console.log("\n--- 1.5 Concurrency: Simultaneous holdBookingSlot Race ---");
  {
    const raceSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 3),
        startTime: "02:00 PM",
        endTime: "03:00 PM",
        category: "STUDIO_PORTRAIT",
        price: 500.0,
        depositRequired: 250.0,
        status: "AVAILABLE",
      },
    });

    // 5 concurrent users attempt to hold the exact same slot at the same millisecond
    const sessions = [1, 2, 3, 4, 5].map((i) => `sess_race_${i}_${Date.now()}`);
    const holdPromises = sessions.map((sess) =>
      holdBookingSlot({
        tenantId: luminaTenant.id,
        slotId: raceSlot.id,
        sessionId: sess,
      })
    );

    const holdResults = await Promise.all(holdPromises);
    const successCount = holdResults.filter((r) => r.success === true).length;
    const conflictCount = holdResults.filter((r) => r.success === false && r.error === "SLOT_ALREADY_HELD").length;

    assert(successCount === 1, `Exactly 1 winner in 5-way simultaneous hold race (got ${successCount})`);
    assert(conflictCount === 4, `Remaining 4 competitors rejected with SLOT_ALREADY_HELD (got ${conflictCount})`);

    const finalSlot = await db.bookingSlot.findUnique({ where: { id: raceSlot.id } });
    assert(finalSlot?.status === "HELD", "Slot status is HELD after race resolution");
  }

  // 1.6 Concurrency Race: Simultaneous processBookingCheckout on Same Slot
  console.log("\n--- 1.6 Concurrency: Simultaneous processBookingCheckout Race ---");
  {
    const checkoutRaceSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 4),
        startTime: "04:00 PM",
        endTime: "05:00 PM",
        category: "COMMERCIAL",
        price: 1500.0,
        depositRequired: 750.0,
        status: "AVAILABLE",
      },
    });

    // User A and User B concurrently submit checkout for the available slot
    const [resA, resB] = await Promise.all([
      processBookingCheckout({
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        slotId: checkoutRaceSlot.id,
        sessionId: "sess_user_a_" + Date.now(),
        clientName: "User Alpha",
        clientEmail: `alpha.${Date.now()}@test.com`,
        clientPhone: "+15551111",
        paymentMethod: "CARD",
      }),
      processBookingCheckout({
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        slotId: checkoutRaceSlot.id,
        sessionId: "sess_user_b_" + Date.now(),
        clientName: "User Beta",
        clientEmail: `beta.${Date.now()}@test.com`,
        clientPhone: "+15552222",
        paymentMethod: "CARD",
      }),
    ]);

    const oneSucceeded = (resA.success && !resB.success) || (!resA.success && resB.success);
    assert(oneSucceeded, "Atomic concurrency: Exactly one checkout succeeds and one fails in checkout race");

    // Verify DB integrity: only 1 booking for this slotId, only 1 invoice
    const linkedBookings = await db.clientBooking.findMany({ where: { slotId: checkoutRaceSlot.id } });
    assert(linkedBookings.length === 1, `Database holds exactly 1 booking for contested slot (got ${linkedBookings.length})`);

    const finalRaceSlot = await db.bookingSlot.findUnique({ where: { id: checkoutRaceSlot.id } });
    assert(finalRaceSlot?.status === "BOOKED", "Slot status is safely transitioned to BOOKED");
  }

  // 1.7 Double-Submit Concurrency Prevention
  console.log("\n--- 1.7 Double-Submit Concurrency on Same Session ---");
  {
    const doubleSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 5),
        startTime: "11:00 AM",
        endTime: "12:00 PM",
        category: "STUDIO_PORTRAIT",
        price: 600.0,
        depositRequired: 300.0,
        status: "AVAILABLE",
      },
    });

    const sessionId = "sess_double_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: doubleSlot.id, sessionId });

    const clientEmail = `double.${Date.now()}@test.com`;
    const [sub1, sub2] = await Promise.all([
      processBookingCheckout({
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        slotId: doubleSlot.id,
        sessionId,
        clientName: "Rapid Clicker",
        clientEmail,
        clientPhone: "+15553333",
        paymentMethod: "CARD",
      }),
      processBookingCheckout({
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        slotId: doubleSlot.id,
        sessionId,
        clientName: "Rapid Clicker",
        clientEmail,
        clientPhone: "+15553333",
        paymentMethod: "CARD",
      }),
    ]);

    const successCount = (sub1.success ? 1 : 0) + (sub2.success ? 1 : 0);
    assert(successCount === 1, `Double-submit race handled safely: exactly 1 succeeded (got ${successCount})`);

    const userInvoices = await db.milestoneInvoice.findMany({
      where: { tenantId: luminaTenant.id, client: { email: clientEmail } },
    });
    assert(userInvoices.length === 1, `Atomic transaction rollback ensured no duplicate invoice (got ${userInvoices.length})`);
  }

  // ============================================================================
  // MANDATE 2: Checkout Method Invariants
  // ============================================================================
  console.log("\n==================================================================");
  console.log("MANDATE 2: Checkout Method Invariants");
  console.log("==================================================================");

  let qrInvoiceId = "";
  let cashInvoiceId = "";
  let cashSlotId = "";

  // 2.1 Card Checkout Invariants
  console.log("\n--- 2.1 Card Checkout Method Invariants ---");
  {
    const cardSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 6),
        startTime: "01:00 PM",
        endTime: "02:00 PM",
        category: "COMMERCIAL",
        price: 1000.0,
        depositRequired: 500.0,
        status: "AVAILABLE",
      },
    });

    const cardSessionId = "sess_card_inv_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: cardSlot.id, sessionId: cardSessionId });

    const cardRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: cardSlot.id,
      sessionId: cardSessionId,
      clientName: "Cardholder Prime",
      clientEmail: `card.${Date.now()}@test.com`,
      clientPhone: "+15554444",
      paymentMethod: "CARD",
      cardDetails: { cardNumber: "4242424242424242" },
    });

    assert(cardRes.success === true, "Card checkout succeeds");
    assert(cardRes.status === "PAID", "Card checkout returns status: PAID");

    const slotDb = await db.bookingSlot.findUnique({ where: { id: cardSlot.id } });
    assert(slotDb?.status === "BOOKED", "Slot status is BOOKED");
    assert(slotDb?.heldUntil === null && slotDb.heldBySessionId === null, "Slot hold fields are cleared");

    const invDb = await db.milestoneInvoice.findUnique({ where: { id: cardRes.invoiceId } });
    assert(invDb?.status === "PAID", "MilestoneInvoice status is PAID");
    assert(invDb?.paymentMethod === "CARD", "MilestoneInvoice paymentMethod is CARD");
    assert(invDb?.verifiedBy === "System Auto", "MilestoneInvoice verifiedBy is 'System Auto'");
    assert(invDb?.paidAt !== null, "MilestoneInvoice paidAt timestamp is recorded");

    const bkDb = await db.clientBooking.findUnique({ where: { trackingCode: cardRes.trackingCode! } });
    assert(bkDb?.status === "CONFIRMED", "ClientBooking status is CONFIRMED");
    assert(bkDb?.depositPaid === true, "ClientBooking depositPaid is true");
  }

  // 2.2 QR Checkout Invariants
  console.log("\n--- 2.2 QR Code Checkout Invariants ---");
  {
    const qrSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 7),
        startTime: "03:00 PM",
        endTime: "04:00 PM",
        category: "STUDIO_PORTRAIT",
        price: 700.0,
        depositRequired: 350.0,
        status: "AVAILABLE",
      },
    });

    const qrSessionId = "sess_qr_inv_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: qrSlot.id, sessionId: qrSessionId });

    const qrRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: qrSlot.id,
      sessionId: qrSessionId,
      clientName: "QR Payee",
      clientEmail: `qr.${Date.now()}@test.com`,
      clientPhone: "+15555555",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "https://example.com/receipt_slip_123.jpg",
      paymentReference: "QR-DUITNOW-998877",
    });

    assert(qrRes.success === true, "QR checkout succeeds");
    assert(qrRes.status === "PENDING_VERIFICATION", "QR checkout returns status: PENDING_VERIFICATION");
    qrInvoiceId = qrRes.invoiceId!;

    const qrSlotDb = await db.bookingSlot.findUnique({ where: { id: qrSlot.id } });
    assert(qrSlotDb?.status === "PENDING_VERIFICATION", "Slot status is PENDING_VERIFICATION");

    const qrInvDb = await db.milestoneInvoice.findUnique({ where: { id: qrRes.invoiceId } });
    assert(qrInvDb?.status === "PENDING_VERIFICATION", "Invoice status is PENDING_VERIFICATION");
    assert(qrInvDb?.paymentMethod === "QR_CODE", "Invoice paymentMethod is QR_CODE");
    assert(qrInvDb?.paymentProofUrl === "https://example.com/receipt_slip_123.jpg", "Invoice stored receipt slip URL");
    assert(qrInvDb?.verifiedBy === null, "Invoice verifiedBy is null");
    assert(qrInvDb?.paidAt === null, "Invoice paidAt is null");

    const qrBkDb = await db.clientBooking.findUnique({ where: { trackingCode: qrRes.trackingCode! } });
    assert(qrBkDb?.status === "PENDING", "ClientBooking is strictly PENDING (NOT prematurely confirmed)");
    assert(qrBkDb?.depositPaid === false, "ClientBooking depositPaid is false");
  }

  // 2.3 Cash Counter Checkout Invariants
  console.log("\n--- 2.3 Cash Checkout Invariants ---");
  {
    const cashSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 8),
        startTime: "05:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 900.0,
        depositRequired: 450.0,
        status: "AVAILABLE",
      },
    });
    cashSlotId = cashSlot.id;

    const cashSessionId = "sess_cash_inv_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: cashSlot.id, sessionId: cashSessionId });

    const cashRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: cashSlot.id,
      sessionId: cashSessionId,
      clientName: "Cash Walkin",
      clientEmail: `cash.${Date.now()}@test.com`,
      clientPhone: "+15556666",
      paymentMethod: "CASH",
    });

    assert(cashRes.success === true, "Cash checkout succeeds");
    assert(cashRes.status === "PENDING_VERIFICATION", "Cash checkout returns status: PENDING_VERIFICATION");
    cashInvoiceId = cashRes.invoiceId!;

    const cashSlotDb = await db.bookingSlot.findUnique({ where: { id: cashSlot.id } });
    assert(cashSlotDb?.status === "PENDING_VERIFICATION", "Slot status is PENDING_VERIFICATION");

    const cashInvDb = await db.milestoneInvoice.findUnique({ where: { id: cashRes.invoiceId } });
    assert(cashInvDb?.status === "PENDING_VERIFICATION", "Invoice status is PENDING_VERIFICATION");
    assert(cashInvDb?.paymentMethod === "CASH", "Invoice paymentMethod is CASH");
    assert(cashInvDb?.paymentReference === "CASH_COUNTER", "Invoice holds CASH_COUNTER reference");
    assert(cashInvDb?.verifiedBy === null, "Invoice verifiedBy is null");
  }

  // 2.4 Direct Invoice Settlement & ALREADY_PAID Guard
  console.log("\n--- 2.4 Direct Invoice Settlement & ALREADY_PAID Guard ---");
  {
    // Create standalone test invoice
    const testInvUser = await db.user.create({
      data: {
        tenantId: luminaTenant.id,
        name: "Invoice Payer",
        email: `invpayer.${Date.now()}@test.com`,
      },
    });

    const standaloneInvoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant.id,
        invoiceNumber: `INV-TEST-${Date.now().toString(36).toUpperCase()}`,
        clientId: testInvUser.id,
        milestoneType: "BOOKING_DEPOSIT",
        amount: 250.0,
        status: "PENDING",
        dueDate: new Date(Date.now() + 86400000 * 7),
      },
    });

    const payRes = await processInvoicePayment({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      invoiceId: standaloneInvoice.id,
      paymentMethod: "CARD",
    });

    assert(payRes.success === true, "processInvoicePayment with CARD succeeds");
    assert(payRes.status === "PAID", "processInvoicePayment returns status: PAID");

    // Attempt second payment on already paid invoice
    const secondPayRes = await processInvoicePayment({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      invoiceId: standaloneInvoice.id,
      paymentMethod: "CARD",
    });

    assert(
      secondPayRes.success === false && secondPayRes.error === "ALREADY_PAID",
      "Re-payment of already paid invoice rejected with ALREADY_PAID"
    );
  }

  // 2.5 Multi-Tenant Isolation on Checkout
  console.log("\n--- 2.5 Multi-Tenant Isolation on Checkout ---");
  {
    const crossSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 86400000 * 9),
        startTime: "09:00 AM",
        endTime: "10:00 AM",
        status: "AVAILABLE",
      },
    });

    const crossRes = await processBookingCheckout({
      tenantId: apexTenant.id, // Mismatched tenant
      tenantSlug: apexTenant.slug,
      slotId: crossSlot.id,
      sessionId: "sess_cross_" + Date.now(),
      clientName: "Cross Tenant Intruder",
      clientEmail: `cross.${Date.now()}@test.com`,
      clientPhone: "+15557777",
      paymentMethod: "CARD",
    });

    assert(
      crossRes.success === false && crossRes.error === "SLOT_NOT_FOUND",
      "Multi-tenant isolation: Tenant B cannot checkout Tenant A slot (SLOT_NOT_FOUND)"
    );
  }

  // ============================================================================
  // MANDATE 3: Studio Manual Verification 1-Click Approve / Reject
  // ============================================================================
  console.log("\n==================================================================");
  console.log("MANDATE 3: Studio Manual Verification 1-Click Approve / Reject");
  console.log("==================================================================");

  // 3.1 1-Click Approve
  console.log("\n--- 3.1 Studio Verification: 1-Click Approve ---");
  {
    assert(Boolean(qrInvoiceId), "QR Invoice ID available for verification");

    const approveRes = await approvePaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Marcus Vance (Studio Manager)",
      notes: "Bank slip matched against Maybank transaction feed",
    });

    assert(approveRes.success === true, "approvePaymentVerification returned success: true");
    assert(approveRes.verifiedBy === "Marcus Vance (Studio Manager)", "verifiedBy staff name recorded");

    const approvedInv = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(approvedInv?.status === "PAID", "Invoice status transitioned to PAID");
    assert(approvedInv?.verifiedBy === "Marcus Vance (Studio Manager)", "Invoice verifiedBy persisted");
    assert(approvedInv?.paidAt !== null, "Invoice paidAt timestamp recorded");

    const approvedBooking = await db.clientBooking.findFirst({
      where: { userId: approvedInv!.clientId, tenantId: luminaTenant.id },
    });
    assert(approvedBooking?.status === "CONFIRMED", "Linked booking transitioned to CONFIRMED");
    assert(approvedBooking?.depositPaid === true, "Linked booking depositPaid is true");

    const approvedSlot = await db.bookingSlot.findUnique({ where: { id: approvedBooking!.slotId! } });
    assert(approvedSlot?.status === "BOOKED", "Linked slot transitioned to BOOKED");
    assert(approvedSlot?.heldUntil === null, "Slot heldUntil is cleared");
    assert(approvedSlot?.heldBySessionId === null, "Slot heldBySessionId is cleared");

    // 3.2 Approve Idempotency Guard
    const reApproveRes = await approvePaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Another Staff",
    });

    assert(
      reApproveRes.success === false && reApproveRes.error === "ALREADY_VERIFIED",
      "Re-approval of already verified invoice returns ALREADY_VERIFIED error"
    );
  }

  // 3.3 1-Click Reject & Immediate Slot Release
  console.log("\n--- 3.3 Studio Verification: 1-Click Reject with Immediate Slot Release ---");
  {
    assert(Boolean(cashInvoiceId), "Cash Invoice ID available for rejection test");

    const rejectRes = await rejectPaymentVerification({
      invoiceId: cashInvoiceId,
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Elena Cruz (Front Desk)",
      reason: "Client failed to show up at studio front desk within 2 hours",
    });

    assert(rejectRes.success === true, "rejectPaymentVerification returned success: true");
    assert(rejectRes.rejectedBy === "Elena Cruz (Front Desk)", "rejectedBy staff name recorded");

    const rejectedInv = await db.milestoneInvoice.findUnique({ where: { id: cashInvoiceId } });
    assert(rejectedInv?.status === "REJECTED", "Invoice status transitioned to REJECTED");
    assert(
      Boolean(rejectedInv?.paymentReference?.includes("Client failed to show up")),
      "Invoice paymentReference holds rejection reason"
    );

    const rejectedBooking = await db.clientBooking.findFirst({
      where: { userId: rejectedInv!.clientId, tenantId: luminaTenant.id },
    });
    assert(rejectedBooking?.status === "CANCELLED", "Linked booking transitioned to CANCELLED");

    const releasedSlot = await db.bookingSlot.findUnique({ where: { id: cashSlotId } });
    assert(releasedSlot?.status === "AVAILABLE", "CRITICAL: Slot status immediately restored to AVAILABLE");
    assert(releasedSlot?.heldUntil === null, "CRITICAL: Slot heldUntil is null");
    assert(releasedSlot?.heldBySessionId === null, "CRITICAL: Slot heldBySessionId is null");

    // 3.4 Immediate Re-Booking of Released Slot
    const newSessionId = "sess_rebook_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: cashSlotId, sessionId: newSessionId });

    const rebookRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: cashSlotId,
      sessionId: newSessionId,
      clientName: "Lucky New Client",
      clientEmail: `lucky.${Date.now()}@test.com`,
      clientPhone: "+15558888",
      paymentMethod: "CARD",
    });

    assert(rebookRes.success === true, "Released slot is immediately re-bookable by another client");
    const rebookedSlot = await db.bookingSlot.findUnique({ where: { id: cashSlotId } });
    assert(rebookedSlot?.status === "BOOKED", "Re-booked slot transitioned to BOOKED");
  }

  // 3.5 Rejection Reason Validation
  console.log("\n--- 3.5 Rejection Reason Validation Guard ---");
  {
    const shortReasonRes = await rejectPaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Staff Member",
      reason: "no", // Less than 3 characters
    });

    assert(
      shortReasonRes.success === false && shortReasonRes.error === "REJECT_FAILED",
      "Rejection without valid reason string (< 3 chars) is rejected by validation"
    );
  }

  // 3.6 Multi-Tenant Verification Guard
  console.log("\n--- 3.6 Multi-Tenant Verification Isolation ---");
  {
    const crossApprove = await approvePaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: apexTenant.id, // Mismatched tenant
      tenantSlug: apexTenant.slug,
      staffName: "Apex Staff",
    });

    assert(
      crossApprove.success === false && crossApprove.error === "INVOICE_NOT_FOUND",
      "Staff from Tenant B cannot approve Tenant A's invoice (INVOICE_NOT_FOUND)"
    );
  }

  // 3.7 Rejecting an Already PAID Invoice
  console.log("\n--- 3.7 Rejecting an Already PAID Invoice Guard ---");
  {
    const rejectPaidRes = await rejectPaymentVerification({
      invoiceId: qrInvoiceId, // Already marked PAID in 3.1
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Staff Member",
      reason: "Attempting to reject an already paid invoice",
    });

    // Check what happens
    const invStatusAfter = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(
      rejectPaidRes.success === false || invStatusAfter?.status === "PAID",
      "Security guard: Already PAID invoice must not be silently corrupted to REJECTED",
      `rejectPaidRes: ${JSON.stringify(rejectPaidRes)}, current status: ${invStatusAfter?.status}`
    );
  }

  // 3.8 Rejecting an Already REJECTED Invoice (Idempotency)
  console.log("\n--- 3.8 Rejecting an Already REJECTED Invoice ---");
  {
    const reRejectRes = await rejectPaymentVerification({
      invoiceId: cashInvoiceId, // Already marked REJECTED in 3.3
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Staff Member",
      reason: "Attempting duplicate rejection",
    });

    const reRejectedInv = await db.milestoneInvoice.findUnique({ where: { id: cashInvoiceId } });
    assert(
      reRejectedInv?.status === "REJECTED",
      "Invoice status remains REJECTED on repeated rejection calls"
    );
  }

  // ============================================================================
  // MANDATE 4: Interactive Proposal Calculations & Digital Signature
  // ============================================================================
  console.log("\n==================================================================");
  console.log("MANDATE 4: Interactive Proposal Calculations & Digital Signature");
  console.log("==================================================================");

  // Setup client and studio users for proposal tests
  const propClient = await db.user.create({
    data: {
      tenantId: luminaTenant.id,
      name: "Arthur Pendelton",
      email: `arthur.${Date.now()}@corporate.com`,
      role: "CLIENT",
    },
  });

  const propStudio = await db.user.findFirst({
    where: { tenantId: luminaTenant.id, role: "STUDIO_OWNER" },
  });

  if (!propStudio) {
    throw new Error("Studio owner user not found for Lumina Cine.");
  }

  // 4.1 Base Calculation Math with Zero Add-ons
  console.log("\n--- 4.1 Proposal Recalculation: Zero Add-ons ---");
  {
    const propZero = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-01-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Standard Commercial Shoot",
        discipline: "PHOTOGRAPHY",
        basePrice: 4000.0,
        totalPrice: 4000.0,
        depositPercentage: 50.0,
        depositAmount: 2000.0,
        finalBalanceAmount: 2000.0,
        status: "SENT",
        contractTerms: "Standard production terms",
      },
    });

    const addOn1 = await db.proposalAddOn.create({
      data: {
        proposalId: propZero.id,
        name: "Drone Aerial Coverage",
        description: "4K HDR aerial b-roll",
        price: 800.0,
        isSelected: false,
      },
    });

    const zeroRes = await acceptProposal({
      proposalId: propZero.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature,
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [], // 0 add-ons selected
      consentAccepted: true,
    });

    assert(zeroRes.success === true, "acceptProposal with 0 add-ons succeeds");
    assert(zeroRes.amount === 2000.0, "Computed 50% deposit amount is exactly 2000.0");

    const propZeroDb = await db.proposal.findUnique({ where: { id: propZero.id } });
    assert(propZeroDb?.totalPrice === 4000.0, "Proposal totalPrice matches basePrice (4000.0)");
    assert(propZeroDb?.depositAmount === 2000.0, "Proposal depositAmount is 2000.0 (50%)");
    assert(propZeroDb?.finalBalanceAmount === 2000.0, "Proposal finalBalanceAmount is 2000.0 (50%)");
    assert(
      propZeroDb!.depositAmount + propZeroDb!.finalBalanceAmount === propZeroDb!.totalPrice,
      "Exact penny integrity: deposit + balance === totalPrice"
    );

    const retainerInv = await db.milestoneInvoice.findUnique({ where: { id: zeroRes.invoiceId } });
    assert(retainerInv?.amount === 2000.0, "RETAINER_50 invoice created for exact 2000.0 amount");
    assert(retainerInv?.status === "PENDING", "RETAINER_50 invoice status is PENDING");
  }

  // 4.2 Dynamic Recalculation with Toggled Add-ons
  console.log("\n--- 4.2 Dynamic Proposal Recalculation with Selected Add-ons ---");
  {
    const propDynamic = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-02-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Multi-Unit Commercial Production",
        discipline: "HYBRID",
        basePrice: 5000.0,
        totalPrice: 5000.0,
        depositPercentage: 50.0,
        depositAmount: 2500.0,
        finalBalanceAmount: 2500.0,
        status: "SENT",
        contractTerms: "Hybrid production agreement",
      },
    });

    const addonDrone = await db.proposalAddOn.create({
      data: {
        proposalId: propDynamic.id,
        name: "Drone 4K Aerial Coverage",
        description: "FAA Part 107 certified pilot",
        price: 650.0,
        isSelected: false,
      },
    });

    const addonSSD = await db.proposalAddOn.create({
      data: {
        proposalId: propDynamic.id,
        name: "RAW Master SSD Media Transfer",
        description: "2TB SanDisk Extreme Pro SSD",
        price: 350.0,
        isSelected: false,
      },
    });

    const addonSecondCam = await db.proposalAddOn.create({
      data: {
        proposalId: propDynamic.id,
        name: "Second Unit Cinematographer",
        description: "B-camera operator",
        price: 800.0,
        isSelected: false,
      },
    });

    // Select Drone ($650) and SSD ($350) -> Addons = $1000. Total = $6000. Deposit = $3000.
    const acceptRes = await acceptProposal({
      proposalId: propDynamic.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature,
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [addonDrone.id, addonSSD.id], // 2 out of 3 selected
      consentAccepted: true,
    });

    assert(acceptRes.success === true, "acceptProposal with selected add-ons succeeds");
    assert(acceptRes.amount === 3000.0, "Computed 50% deposit amount is 3000.0");

    const propDb = await db.proposal.findUnique({
      where: { id: propDynamic.id },
      include: { addOns: true, project: true },
    });

    assert(propDb?.totalPrice === 6000.0, "Proposal totalPrice recalculated to 6000.0 (5000 + 650 + 350)");
    assert(propDb?.depositAmount === 3000.0, "Proposal depositAmount recalculated to 3000.0");
    assert(propDb?.finalBalanceAmount === 3000.0, "Proposal finalBalanceAmount recalculated to 3000.0");

    const droneDb = propDb?.addOns.find((a) => a.id === addonDrone.id);
    const ssdDb = propDb?.addOns.find((a) => a.id === addonSSD.id);
    const secondCamDb = propDb?.addOns.find((a) => a.id === addonSecondCam.id);

    assert(droneDb?.isSelected === true, "Drone add-on isSelected updated to true");
    assert(ssdDb?.isSelected === true, "SSD add-on isSelected updated to true");
    assert(secondCamDb?.isSelected === false, "Unselected secondCam add-on remains false");

    // Project and Retainer Invoice verification
    assert(Boolean(propDb?.project), "Project created for accepted proposal");
    assert(propDb?.project?.status === "PRE_PRODUCTION", "Project status is PRE_PRODUCTION");
    assert(propDb?.project?.budget === 6000.0, "Project budget matches recalculated total price (6000.0)");

    const retainerInvoice = await db.milestoneInvoice.findUnique({ where: { id: acceptRes.invoiceId } });
    assert(retainerInvDbCheck(retainerInvoice, 3000.0), "Retainer invoice generated with exact 3000.0 amount");
  }

  function retainerInvDbCheck(inv: any, expectedAmount: number) {
    return (
      inv &&
      inv.milestoneType === "RETAINER_50" &&
      inv.amount === expectedAmount &&
      inv.status === "PENDING"
    );
  }

  // 4.3 Floating Point Precision & Odd Cents Split
  console.log("\n--- 4.3 Floating Point Precision & Odd Cents Math ---");
  {
    const propOdd = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-03-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Odd Cent Precision Shoot",
        discipline: "PHOTOGRAPHY",
        basePrice: 5250.75,
        totalPrice: 5250.75,
        depositPercentage: 50.0,
        depositAmount: 2625.38,
        finalBalanceAmount: 2625.37,
        status: "SENT",
        contractTerms: "Standard production terms",
      },
    });

    const oddAddon = await db.proposalAddOn.create({
      data: {
        proposalId: propOdd.id,
        name: "Custom Film Preset Stock",
        description: "Specialized color grading",
        price: 349.50,
        isSelected: false,
      },
    });

    // Total: 5250.75 + 349.50 = 5600.25
    // 50% deposit = Math.round(5600.25 * 0.5 * 100) / 100 = 2800.13 (or 2800.12)
    // Balance = Math.round((5600.25 - 2800.13) * 100) / 100 = 2800.12
    // Sum must equal 5600.25 exactly
    const oddRes = await acceptProposal({
      proposalId: propOdd.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature,
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [oddAddon.id],
      consentAccepted: true,
    });

    assert(oddRes.success === true, "acceptProposal with odd cents succeeds");

    const oddDb = await db.proposal.findUnique({ where: { id: propOdd.id } });
    assert(oddDb?.totalPrice === 5600.25, `Total price rounded to 5600.25 (got ${oddDb?.totalPrice})`);
    assert(
      oddDb!.depositAmount + oddDb!.finalBalanceAmount === oddDb!.totalPrice,
      `Penny integrity verified on odd amounts: deposit (${oddDb!.depositAmount}) + balance (${oddDb!.finalBalanceAmount}) === ${oddDb!.totalPrice}`
    );
  }

  // 4.4 Malformed Signature Rejection
  console.log("\n--- 4.4 Malformed Signature & Missing Consent Rejections ---");
  {
    const propReject = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-04-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Signature Security Test Shoot",
        discipline: "PHOTOGRAPHY",
        basePrice: 2000.0,
        totalPrice: 2000.0,
        depositPercentage: 50.0,
        depositAmount: 1000.0,
        finalBalanceAmount: 1000.0,
        status: "SENT",
        contractTerms: "Standard terms",
      },
    });

    // Attempt with signature less than 50 characters
    const shortSigRes = await acceptProposal({
      proposalId: propReject.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: "data:image/png;base64,too_short",
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [],
      consentAccepted: true,
    });

    assert(
      shortSigRes.success === false && shortSigRes.error === "ACCEPT_FAILED",
      "Signature shorter than 50 characters rejected by Zod schema (ACCEPT_FAILED)"
    );

    // Attempt with consentAccepted === false
    const noConsentRes = await acceptProposal({
      proposalId: propReject.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature,
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [],
      consentAccepted: false as any,
    });

    assert(
      noConsentRes.success === false && noConsentRes.error === "ACCEPT_FAILED",
      "Missing contract terms consent rejected by Zod schema (ACCEPT_FAILED)"
    );
  }

  // 4.5 Idempotency & Tamper Resistance on Already-Accepted Proposal
  console.log("\n--- 4.5 Idempotency & Tamper Resistance ---");
  {
    const propTamper = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-05-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Tamper Resistance Test",
        discipline: "COMMERCIAL",
        basePrice: 3000.0,
        totalPrice: 3000.0,
        depositPercentage: 50.0,
        depositAmount: 1500.0,
        finalBalanceAmount: 1500.0,
        status: "SENT",
        contractTerms: "Strict terms",
      },
    });

    const originalAddon = await db.proposalAddOn.create({
      data: {
        proposalId: propTamper.id,
        name: "Original Feature Addon",
        description: "Initial selection",
        price: 500.0,
        isSelected: false,
      },
    });

    const newAddon = await db.proposalAddOn.create({
      data: {
        proposalId: propTamper.id,
        name: "Unauthorized Late Addon",
        description: "Injected later",
        price: 2000.0,
        isSelected: false,
      },
    });

    // 1st Legit Acceptance
    const firstAccept = await acceptProposal({
      proposalId: propTamper.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature + "_ORIGINAL_SIG",
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [originalAddon.id], // Total = 3500. Deposit = 1750.
      consentAccepted: true,
    });

    assert(firstAccept.success === true, "First proposal acceptance succeeds");
    assert(firstAccept.amount === 1750.0, "First acceptance deposit is 1750.0");

    // 2nd Malicious Attempt: Try to tamper with add-ons and signature
    const tamperRes = await acceptProposal({
      proposalId: propTamper.id,
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: validSignature + "_TAMPERED_SIG",
      signerName: "Malicious Hacker",
      selectedAddOnIds: [originalAddon.id, newAddon.id], // Attempting to alter price
      consentAccepted: true,
    });

    assert(tamperRes.success === true, "Idempotent re-acceptance returns success: true");
    assert(tamperRes.projectId === firstAccept.projectId, "Returned projectId matches original project");
    assert(tamperRes.invoiceId === firstAccept.invoiceId, "Returned invoiceId matches original invoice");

    // Verify DB records were NOT tampered
    const propAfterTamper = await db.proposal.findUnique({
      where: { id: propTamper.id },
      include: { addOns: true },
    });

    assert(
      propAfterTamper?.clientSignature === validSignature + "_ORIGINAL_SIG",
      "Tamper resistance: Original digital signature was NOT overwritten"
    );
    assert(
      propAfterTamper?.totalPrice === 3500.0,
      "Tamper resistance: Total price was NOT altered (remains 3500.0)"
    );

    const injectedAddonDb = propAfterTamper?.addOns.find((a) => a.id === newAddon.id);
    assert(
      injectedAddonDb?.isSelected === false,
      "Tamper resistance: Unauthorized late add-on was NOT selected"
    );

    // Verify exactly 1 project and 1 invoice exist
    const projectCount = await db.project.count({ where: { proposalId: propTamper.id } });
    const invoiceCount = await db.milestoneInvoice.count({ where: { proposalId: propTamper.id } });
    assert(projectCount === 1, `Strict idempotency: Exactly 1 Project created (got ${projectCount})`);
    assert(invoiceCount === 1, `Strict idempotency: Exactly 1 MilestoneInvoice created (got ${invoiceCount})`);
  }

  // 4.6 Multi-Tenant Proposal Isolation Guard
  console.log("\n--- 4.6 Multi-Tenant Proposal Isolation ---");
  {
    const propCross = await db.proposal.create({
      data: {
        tenantId: luminaTenant.id,
        proposalNumber: `PR-CHALLENGE-06-${Date.now()}`,
        clientId: propClient.id,
        studioId: propStudio.id,
        title: "Cross Tenant Proposal Isolation Test",
        discipline: "PHOTOGRAPHY",
        basePrice: 1500.0,
        totalPrice: 1500.0,
        depositPercentage: 50.0,
        depositAmount: 750.0,
        finalBalanceAmount: 750.0,
        status: "SENT",
        contractTerms: "Standard",
      },
    });

    const crossAccept = await acceptProposal({
      proposalId: propCross.id,
      tenantSlug: apexTenant.slug, // Wrong tenant slug
      signatureDataUrl: validSignature,
      signerName: "Arthur Pendelton",
      selectedAddOnIds: [],
      consentAccepted: true,
    });

    assert(
      crossAccept.success === false && crossAccept.error === "PROPOSAL_NOT_FOUND",
      "Multi-tenant isolation: Tenant B cannot accept Tenant A's proposal (PROPOSAL_NOT_FOUND)"
    );
  }

  // ============================================================================
  // FINAL SUMMARY REPORT
  // ============================================================================
  console.log("\n==================================================================");
  console.log("   CineFlow OS Milestone 3 Empirical Challenge Results           ");
  console.log("==================================================================");
  console.log(`Total Assertions Run : ${totalTests}`);
  console.log(`Passed Assertions    : ${passedTests}`);
  console.log(`Failed Assertions    : ${failedTests}`);
  console.log("==================================================================");

  if (failedTests === 0) {
    console.log("VERDICT: ALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY [APPROVE]");
  } else {
    console.error(`VERDICT: ${failedTests} CHALLENGE(S) FAILED [REQUEST_CHANGES]`);
    process.exitCode = 1;
  }
}

runChallengerM3Suite().catch((err) => {
  console.error("Fatal uncaught error during challenger test execution:", err);
  process.exit(1);
});
