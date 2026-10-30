import { db } from "../lib/db";
import { processBookingCheckout } from "../lib/actions/checkout";
import { holdBookingSlot } from "../lib/actions/booking";
import { approvePaymentVerification, rejectPaymentVerification } from "../lib/actions/admin-verification";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, description: string, details?: any) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ PASS [${totalAssertions}]: ${description}`);
  } else {
    failedAssertions++;
    console.error(`  ✗ FAIL [${totalAssertions}]: ${description}`);
    if (details) {
      console.error(`    Details:`, details);
    }
  }
}

async function runEmpiricalStressSuite() {
  console.log("==================================================================");
  console.log("   CineFlow OS M3-IT2 Independent Empirical Verification Suite    ");
  console.log("==================================================================");

  // Setup / verify tenant
  let tenant = await db.tenant.findUnique({ where: { slug: "lumina" } });
  if (!tenant) {
    tenant = await db.tenant.findFirst();
  }
  if (!tenant) {
    throw new Error("No tenant found for testing.");
  }
  console.log(`Using tenant: ${tenant.name} (${tenant.id}, slug: ${tenant.slug})`);

  // ==================================================================
  // SCOPE 2: Re-Booking of Rejected Slots
  // ==================================================================
  console.log("\n--- SCOPE 2.1: Single Cycle Reject & Immediate Re-Book ---");
  {
    const testSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 10),
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        category: "STUDIO_PORTRAIT",
        price: 350.0,
        depositRequired: 175.0,
        status: "AVAILABLE",
      },
    });

    const sessionUser1 = `sess_usr1_${Date.now()}`;
    const holdRes1 = await holdBookingSlot({
      tenantId: tenant.id,
      slotId: testSlot.id,
      sessionId: sessionUser1,
    });
    assert(holdRes1.success === true, "User 1 successfully held the slot");

    const checkoutUser1 = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: testSlot.id,
      sessionId: sessionUser1,
      clientName: "User One Rejected",
      clientEmail: `user1.${Date.now()}@example.com`,
      clientPhone: "+15550001",
      paymentMethod: "CASH",
    });

    assert(checkoutUser1.success === true, "User 1 CASH checkout succeeded (pending verification)");
    const invoiceId1 = checkoutUser1.invoiceId;
    assert(Boolean(invoiceId1), "Invoice generated for User 1 checkout");

    const slotPending = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(slotPending?.status === "PENDING_VERIFICATION", "Slot status is PENDING_VERIFICATION");

    // Admin rejects payment verification
    const rejectRes = await rejectPaymentVerification({
      invoiceId: invoiceId1!,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Quality Auditor",
      reason: "Invalid counter cash handover",
    });

    assert(rejectRes.success === true, "rejectPaymentVerification returned success: true");

    // Verify DB state after rejection
    const rejectedInvoice = await db.milestoneInvoice.findUnique({ where: { id: invoiceId1 } });
    assert(rejectedInvoice?.status === "REJECTED", "MilestoneInvoice status is REJECTED in database");

    const cancelledBooking = await db.clientBooking.findFirst({
      where: { userId: rejectedInvoice!.clientId, tenantId: tenant.id },
    });
    assert(cancelledBooking?.status === "CANCELLED", "ClientBooking status is CANCELLED");
    assert(cancelledBooking?.slotId === null, "CRITICAL: ClientBooking.slotId is disassociated (null)");

    const releasedSlot = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(releasedSlot?.status === "AVAILABLE", "BookingSlot status immediately restored to AVAILABLE");
    assert(releasedSlot?.heldUntil === null, "BookingSlot heldUntil is cleared to null");
    assert(releasedSlot?.heldBySessionId === null, "BookingSlot heldBySessionId is cleared to null");

    // User 2 immediately books the released slot
    const sessionUser2 = `sess_usr2_${Date.now()}`;
    const holdRes2 = await holdBookingSlot({
      tenantId: tenant.id,
      slotId: testSlot.id,
      sessionId: sessionUser2,
    });
    assert(holdRes2.success === true, "User 2 successfully held the released slot");

    const checkoutUser2 = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: testSlot.id,
      sessionId: sessionUser2,
      clientName: "User Two Winner",
      clientEmail: `user2.${Date.now()}@example.com`,
      clientPhone: "+15550002",
      paymentMethod: "CARD",
    });

    assert(checkoutUser2.success === true, "User 2 CARD checkout succeeded with zero P2002 errors");
    
    const user2Booking = await db.clientBooking.findUnique({ where: { id: checkoutUser2.bookingId } });
    assert(user2Booking?.slotId === testSlot.id, "User 2 ClientBooking owns testSlot.id");
    assert(user2Booking?.status === "CONFIRMED", "User 2 ClientBooking is CONFIRMED");

    const finalSlotState = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(finalSlotState?.status === "BOOKED", "BookingSlot status is transitioned to BOOKED");

    // Confirm that the cancelled booking still exists with historical integrity
    const historicalBooking = await db.clientBooking.findUnique({ where: { id: cancelledBooking!.id } });
    assert(
      historicalBooking?.status === "CANCELLED" && historicalBooking?.slotId === null,
      "Historical cancelled booking preserved with status CANCELLED and slotId null"
    );
  }

  console.log("\n--- SCOPE 2.2: Multi-Cycle Chained Rejection & Final Approval Stress ---");
  {
    // A single slot undergoes 3 cycles of rejection followed by 1 successful final booking
    const churnSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 12),
        startTime: "02:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 800.0,
        depositRequired: 400.0,
        status: "AVAILABLE",
      },
    });

    for (let cycle = 1; cycle <= 3; cycle++) {
      const cycleSession = `sess_churn_c${cycle}_${Date.now()}`;
      await holdBookingSlot({ tenantId: tenant.id, slotId: churnSlot.id, sessionId: cycleSession });

      const cycleCheckout = await processBookingCheckout({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        slotId: churnSlot.id,
        sessionId: cycleSession,
        clientName: `Churn Client ${cycle}`,
        clientEmail: `churn${cycle}.${Date.now()}@test.com`,
        clientPhone: `+155500${cycle}`,
        paymentMethod: "CASH",
      });

      assert(cycleCheckout.success === true, `Cycle ${cycle} CASH checkout succeeded`);

      const rejRes = await rejectPaymentVerification({
        invoiceId: cycleCheckout.invoiceId!,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        staffName: "Manager",
        reason: `Rejection cycle test #${cycle}`,
      });

      assert(rejRes.success === true, `Cycle ${cycle} rejectPaymentVerification succeeded`);

      const slotAfterRej = await db.bookingSlot.findUnique({ where: { id: churnSlot.id } });
      assert(slotAfterRej?.status === "AVAILABLE", `Cycle ${cycle} slot restored to AVAILABLE`);
    }

    // Now final client books with CARD
    const finalSession = `sess_churn_final_${Date.now()}`;
    await holdBookingSlot({ tenantId: tenant.id, slotId: churnSlot.id, sessionId: finalSession });

    const finalCheckout = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: churnSlot.id,
      sessionId: finalSession,
      clientName: "Final Victorious Client",
      clientEmail: `victor.${Date.now()}@test.com`,
      clientPhone: "+15559999",
      paymentMethod: "CARD",
    });

    assert(finalCheckout.success === true, "Multi-churn slot successfully booked by final client with CARD");
    const finalSlot = await db.bookingSlot.findUnique({ where: { id: churnSlot.id } });
    assert(finalSlot?.status === "BOOKED", "Multi-churn slot is in BOOKED status");

    // Verify there are exactly 3 CANCELLED bookings and 1 CONFIRMED booking
    const bookings = await db.clientBooking.findMany({
      where: {
        tenantId: tenant.id,
        clientEmail: { contains: "churn" },
      },
    });
    assert(bookings.length === 3, `Exactly 3 churn cancelled bookings exist in DB (got ${bookings.length})`);
    for (const b of bookings) {
      assert(b.status === "CANCELLED" && b.slotId === null, `Booking ${b.trackingCode} is CANCELLED with slotId null`);
    }
  }

  console.log("\n--- SCOPE 2.3: Defensive Dissociation Test ---");
  {
    // Emulate a scenario where a database row somehow retained slotId with CANCELLED status
    const defSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 15),
        startTime: "11:00 AM",
        endTime: "12:00 PM",
        category: "FASHION_LOOKBOOK",
        price: 600.0,
        depositRequired: 300.0,
        status: "AVAILABLE",
      },
    });

    // Create a client user
    const dummyUser = await db.user.create({
      data: {
        tenantId: tenant.id,
        name: "Lingering Booking User",
        email: `lingering.${Date.now()}@example.com`,
        phone: "+15553333",
        role: "CLIENT",
      },
    });

    // Artificially inject a CANCELLED booking that still holds defSlot.id
    const lingeringBooking = await db.clientBooking.create({
      data: {
        tenantId: tenant.id,
        trackingCode: `TRK-LINGER-${Date.now().toString().slice(-4)}`,
        category: defSlot.category,
        clientName: dummyUser.name,
        clientEmail: dummyUser.email,
        clientPhone: dummyUser.phone!,
        discipline: "PHOTOGRAPHY",
        serviceTier: "STANDARD",
        targetDate: "2026-11-15",
        status: "CANCELLED",
        depositPaid: false,
        depositAmount: defSlot.depositRequired,
        paymentMethod: "CASH",
        slotId: defSlot.id,
        userId: dummyUser.id,
      },
    });

    assert(lingeringBooking.slotId === defSlot.id, "Lingering cancelled booking created with slotId assigned");

    // New client checks out this slot
    const defSession = `sess_def_${Date.now()}`;
    await holdBookingSlot({ tenantId: tenant.id, slotId: defSlot.id, sessionId: defSession });

    const defCheckout = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: defSlot.id,
      sessionId: defSession,
      clientName: "New Defender Client",
      clientEmail: `defender.${Date.now()}@example.com`,
      clientPhone: "+15554444",
      paymentMethod: "CARD",
    });

    assert(defCheckout.success === true, "processBookingCheckout defensively resolved lingering CANCELLED booking without P2002 error");

    // Verify the lingering booking had its slotId cleared by defensive dissociation
    const cleanedLingeringBooking = await db.clientBooking.findUnique({ where: { id: lingeringBooking.id } });
    assert(cleanedLingeringBooking?.slotId === null, "Lingering booking slotId was set to null by defensive dissociation");
  }

  // ==================================================================
  // SCOPE 3: Rejecting a PAID Invoice
  // ==================================================================
  console.log("\n--- SCOPE 3.1: Rejecting an Auto-Paid (CARD) Invoice ---");
  {
    const cardSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 20),
        startTime: "09:00 AM",
        endTime: "10:00 AM",
        category: "PORTRAIT",
        price: 400.0,
        depositRequired: 200.0,
        status: "AVAILABLE",
      },
    });

    const cardSession = `sess_card_paid_${Date.now()}`;
    await holdBookingSlot({ tenantId: tenant.id, slotId: cardSlot.id, sessionId: cardSession });

    const cardCheckout = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: cardSlot.id,
      sessionId: cardSession,
      clientName: "Card Payer",
      clientEmail: `cardpayer.${Date.now()}@test.com`,
      clientPhone: "+15557777",
      paymentMethod: "CARD",
    });

    assert(cardCheckout.success === true, "Card checkout succeeded");
    const paidInvoiceId = cardCheckout.invoiceId!;

    // Check DB status is PAID
    const invBefore = await db.milestoneInvoice.findUnique({ where: { id: paidInvoiceId } });
    assert(invBefore?.status === "PAID", "Card invoice is immediately PAID in database");

    // Attempt to reject the PAID invoice
    const rejectAttempt = await rejectPaymentVerification({
      invoiceId: paidInvoiceId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Rogue Staff",
      reason: "Attempting to reject a settled card payment",
    });

    assert(rejectAttempt.success === false, "rejectPaymentVerification on PAID invoice returned success: false");
    assert(
      rejectAttempt.error === "Cannot reject an invoice that has already been verified and marked as PAID" ||
      (typeof rejectAttempt.error === "string" && rejectAttempt.error.toLowerCase().includes("paid")),
      `Error message indicates invoice is already paid (got: "${rejectAttempt.error}")`
    );

    // Verify database was NOT mutated
    const invAfter = await db.milestoneInvoice.findUnique({ where: { id: paidInvoiceId } });
    assert(invAfter?.status === "PAID", "Invoice status remains PAID in database after reject attempt");

    const slotAfter = await db.bookingSlot.findUnique({ where: { id: cardSlot.id } });
    assert(slotAfter?.status === "BOOKED", "Slot status remains BOOKED and was NOT released");

    const bookingAfter = await db.clientBooking.findUnique({ where: { id: cardCheckout.bookingId } });
    assert(bookingAfter?.status === "CONFIRMED", "ClientBooking remains CONFIRMED and was NOT cancelled");
  }

  console.log("\n--- SCOPE 3.2: Rejecting a Manually Verified (Approve -> Reject) Invoice ---");
  {
    const qrSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 22),
        startTime: "01:00 PM",
        endTime: "02:00 PM",
        category: "BRANDING",
        price: 900.0,
        depositRequired: 450.0,
        status: "AVAILABLE",
      },
    });

    const qrSession = `sess_qr_paid_${Date.now()}`;
    await holdBookingSlot({ tenantId: tenant.id, slotId: qrSlot.id, sessionId: qrSession });

    const qrCheckout = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: qrSlot.id,
      sessionId: qrSession,
      clientName: "QR Slip Payer",
      clientEmail: `qrpayer.${Date.now()}@test.com`,
      clientPhone: "+15556666",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "https://storage.cineflow.io/receipts/test_qr.jpg",
    });

    assert(qrCheckout.success === true, "QR checkout succeeded (PENDING_VERIFICATION)");
    const qrInvoiceId = qrCheckout.invoiceId!;

    // Admin approves the invoice
    const approveRes = await approvePaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Lead Admin",
    });
    assert(approveRes.success === true, "Admin approved payment verification");

    const invVerified = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(invVerified?.status === "PAID", "Invoice status transitioned to PAID");

    // Now try to reject this approved/PAID invoice
    const rejectAfterApprove = await rejectPaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Confused Admin",
      reason: "Accidental late rejection attempt",
    });

    assert(rejectAfterApprove.success === false, "rejectPaymentVerification returned success: false on approved PAID invoice");
    assert(
      rejectAfterApprove.error === "Cannot reject an invoice that has already been verified and marked as PAID" ||
      (typeof rejectAfterApprove.error === "string" && rejectAfterApprove.error.toLowerCase().includes("paid")),
      `Appropriate error returned (got: "${rejectAfterApprove.error}")`
    );

    const invStillPaid = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(invStillPaid?.status === "PAID", "Invoice remains PAID in database");

    const qrSlotAfter = await db.bookingSlot.findUnique({ where: { id: qrSlot.id } });
    assert(qrSlotAfter?.status === "BOOKED", "Slot remains BOOKED and not released");
  }

  console.log("\n--- SCOPE 3.3: Rejecting an Already REJECTED Invoice (Terminal State) ---");
  {
    const cashSlot = await db.bookingSlot.create({
      data: {
        tenantId: tenant.id,
        date: new Date(Date.now() + 86400000 * 25),
        startTime: "03:00 PM",
        endTime: "04:00 PM",
        category: "EDITORIAL",
        price: 500.0,
        depositRequired: 250.0,
        status: "AVAILABLE",
      },
    });

    const cashSession = `sess_cash_rej_${Date.now()}`;
    await holdBookingSlot({ tenantId: tenant.id, slotId: cashSlot.id, sessionId: cashSession });

    const cashCheckout = await processBookingCheckout({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      slotId: cashSlot.id,
      sessionId: cashSession,
      clientName: "Double Reject Subject",
      clientEmail: `dbrej.${Date.now()}@test.com`,
      clientPhone: "+15555555",
      paymentMethod: "CASH",
    });

    const cashInvoiceId = cashCheckout.invoiceId!;

    // First rejection: should succeed
    const firstRej = await rejectPaymentVerification({
      invoiceId: cashInvoiceId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Admin",
      reason: "Initial rejection",
    });
    assert(firstRej.success === true, "Initial rejection succeeded");

    // Second rejection: should fail gracefully
    const secondRej = await rejectPaymentVerification({
      invoiceId: cashInvoiceId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      staffName: "Admin",
      reason: "Duplicate rejection attempt",
    });
    assert(secondRej.success === false, "Duplicate rejection returned success: false");
    assert(secondRej.error === "Invoice is already rejected", `Error is 'Invoice is already rejected' (got: "${secondRej.error}")`);

    const invStatus = await db.milestoneInvoice.findUnique({ where: { id: cashInvoiceId } });
    assert(invStatus?.status === "REJECTED", "Invoice status remains REJECTED");
  }

  console.log("\n==================================================================");
  console.log("   Summary of Independent Empirical Verification Results          ");
  console.log("==================================================================");
  console.log(`Total Assertions Run : ${totalAssertions}`);
  console.log(`Passed Assertions    : ${passedAssertions}`);
  console.log(`Failed Assertions    : ${failedAssertions}`);
  console.log("==================================================================");

  if (failedAssertions > 0) {
    console.error(`VERDICT: REQUEST_CHANGES (${failedAssertions} assertions failed)`);
    process.exit(1);
  } else {
    console.log("VERDICT: APPROVE (All empirical stress tests passed with 0 failures)");
  }
}

runEmpiricalStressSuite().catch((err) => {
  console.error("FATAL UNCAUGHT ERROR in empirical stress suite:", err);
  process.exit(1);
});
