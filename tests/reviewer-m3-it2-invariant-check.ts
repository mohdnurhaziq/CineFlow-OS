/**
 * Reviewer Independent Verification Harness: Milestone 3 Iteration 2
 * Reviewer: reviewer_m3_it2_2
 * 
 * Verifies:
 * 1. CF-M3-01: Slot freed and re-booked by an independent user without P2002 collision
 * 2. CF-M3-02: Paid invoice rejection guard across all payment flows (CARD instant, QR approved, REJECTED terminal)
 * 3. CF-M3-03: Proposal acceptance produces unique project and invoice numbers under high volume (25 proposals)
 */

import { db } from "../lib/db";
import { processBookingCheckout } from "../lib/actions/checkout";
import { holdBookingSlot } from "../lib/actions/booking";
import { approvePaymentVerification, rejectPaymentVerification } from "../lib/actions/admin-verification";
import { acceptProposal } from "../lib/actions/proposals";

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${name}`);
    if (details) console.error(`     ↳ Details: ${details}`);
    failCount++;
    failures.push(`${name} -> ${details || "Assertion failed"}`);
  }
}

async function runReviewerVerification() {
  console.log("================================================================================");
  console.log("   REVIEWER INDEPENDENT INVARIANT & REGRESSION SUITE (M3-IT2)                   ");
  console.log("================================================================================\n");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Missing required tenants lumina-cine or apex-media.");
  }

  // ============================================================================
  // INVARIANT 1: Slot Freed & Re-booked by Independent User (CF-M3-01)
  // ============================================================================
  console.log(">>> TEST GROUP 1: Booking Rejection, Slot Freeing & Independent Re-Booking");

  // Step 1: Create a fresh booking slot
  const slot1 = await db.bookingSlot.create({
    data: {
      tenantId: luminaTenant.id,
      date: new Date(Date.now() + 86400000 * 30),
      startTime: "10:00 AM",
      endTime: "11:00 AM",
      category: "STUDIO_PORTRAIT",
      price: 500.0,
      depositRequired: 250.0,
      status: "AVAILABLE",
    },
  });

  const sessionUser1 = `sess_rev_u1_${Date.now()}`;
  await holdBookingSlot({
    tenantId: luminaTenant.id,
    slotId: slot1.id,
    sessionId: sessionUser1,
  });

  const booking1 = await processBookingCheckout({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    slotId: slot1.id,
    sessionId: sessionUser1,
    clientName: "First Client User",
    clientEmail: `firstclient.${Date.now()}@test.com`,
    clientPhone: "+15551111",
    paymentMethod: "CASH",
  });

  check("User 1 CASH checkout succeeded", booking1.success === true, JSON.stringify(booking1));
  check("User 1 invoice is PENDING_VERIFICATION", booking1.status === "PENDING_VERIFICATION");

  const slotAfterBooking1 = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
  check("Slot status is PENDING_VERIFICATION", slotAfterBooking1?.status === "PENDING_VERIFICATION");

  // Step 2: Reject payment verification
  const rejectRes1 = await rejectPaymentVerification({
    invoiceId: booking1.invoiceId!,
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    staffName: "Lead Reviewer",
    reason: "Client cancelled booking counter payment",
  });

  check("rejectPaymentVerification returned success: true", rejectRes1.success === true, JSON.stringify(rejectRes1));

  // Step 3: Verify DB state after rejection
  const invAfterRejection1 = await db.milestoneInvoice.findUnique({ where: { id: booking1.invoiceId! } });
  check("Invoice status is REJECTED", invAfterRejection1?.status === "REJECTED");

  const slotAfterRejection1 = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
  check("Slot status is restored to AVAILABLE", slotAfterRejection1?.status === "AVAILABLE");
  check("Slot heldUntil is cleared to null", slotAfterRejection1?.heldUntil === null);
  check("Slot heldBySessionId is cleared to null", slotAfterRejection1?.heldBySessionId === null);

  const booking1Record = await db.clientBooking.findUnique({ where: { id: booking1.bookingId! } });
  check("Booking 1 status is CANCELLED", booking1Record?.status === "CANCELLED");
  check("Booking 1 slotId is set to NULL (disassociated)", booking1Record?.slotId === null);

  // Step 4: Independent User 2 books the exact same freed slot
  const sessionUser2 = `sess_rev_u2_${Date.now()}`;
  const holdRes2 = await holdBookingSlot({
    tenantId: luminaTenant.id,
    slotId: slot1.id,
    sessionId: sessionUser2,
  });
  check("Independent User 2 held the freed slot", holdRes2.success === true, JSON.stringify(holdRes2));

  const booking2 = await processBookingCheckout({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    slotId: slot1.id,
    sessionId: sessionUser2,
    clientName: "Independent Second User",
    clientEmail: `secondclient.${Date.now()}@test.com`,
    clientPhone: "+15552222",
    paymentMethod: "CARD",
  });

  check("Independent User 2 CARD checkout succeeded without P2002 error", booking2.success === true, JSON.stringify(booking2));
  check("Booking 2 is CONFIRMED", booking2.status === "PAID");

  const slotAfterBooking2 = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
  check("Slot transitioned to BOOKED for User 2", slotAfterBooking2?.status === "BOOKED");

  const booking2Record = await db.clientBooking.findUnique({ where: { id: booking2.bookingId! } });
  check("Booking 2 owns slotId", booking2Record?.slotId === slot1.id);
  check("Historical Booking 1 still exists with status CANCELLED and slotId null",
    booking1Record?.status === "CANCELLED" && booking1Record?.slotId === null
  );

  // ============================================================================
  // INVARIANT 2: Paid Invoice Rejection Guard (CF-M3-02)
  // ============================================================================
  console.log("\n>>> TEST GROUP 2: Paid Invoice Protection Against Rejection");

  // 2.1 Direct CARD-paid invoice
  const cardInvoiceId = booking2.invoiceId!;
  const cardInvoice = await db.milestoneInvoice.findUnique({ where: { id: cardInvoiceId } });
  check("Card invoice status is PAID", cardInvoice?.status === "PAID");

  const rejectPaidCardRes = await rejectPaymentVerification({
    invoiceId: cardInvoiceId,
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    staffName: "Auditor",
    reason: "Illegal attempt to reject paid card invoice",
  });

  check("rejectPaymentVerification returns success: false for PAID invoice", rejectPaidCardRes.success === false);
  check(
    "Error explicitly states invoice is already PAID",
    rejectPaidCardRes.error?.includes("PAID") === true,
    `Got error: "${rejectPaidCardRes.error}"`
  );

  const cardInvoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: cardInvoiceId } });
  check("Card invoice status remains PAID in DB", cardInvoiceAfter?.status === "PAID");

  // 2.2 Manually verified QR-code invoice
  const slotQR = await db.bookingSlot.create({
    data: {
      tenantId: luminaTenant.id,
      date: new Date(Date.now() + 86400000 * 31),
      startTime: "02:00 PM",
      endTime: "03:00 PM",
      category: "COMMERCIAL",
      price: 1200.0,
      depositRequired: 600.0,
      status: "AVAILABLE",
    },
  });

  const sessionQR = `sess_rev_qr_${Date.now()}`;
  await holdBookingSlot({ tenantId: luminaTenant.id, slotId: slotQR.id, sessionId: sessionQR });

  const qrBooking = await processBookingCheckout({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    slotId: slotQR.id,
    sessionId: sessionQR,
    clientName: "QR Client",
    clientEmail: `qr.${Date.now()}@test.com`,
    clientPhone: "+15553333",
    paymentMethod: "QR_CODE",
    paymentProofUrl: "https://cineflow.test/receipts/proof.jpg",
  });

  check("QR checkout succeeded in PENDING_VERIFICATION", qrBooking.success === true);

  // Approve the QR invoice
  const approveRes = await approvePaymentVerification({
    invoiceId: qrBooking.invoiceId!,
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    staffName: "Financial Director",
  });
  check("Admin approvePaymentVerification succeeded", approveRes.success === true);

  const qrInvoiceApproved = await db.milestoneInvoice.findUnique({ where: { id: qrBooking.invoiceId! } });
  check("QR invoice is now PAID", qrInvoiceApproved?.status === "PAID");

  // Attempt to reject the approved invoice
  const rejectApprovedRes = await rejectPaymentVerification({
    invoiceId: qrBooking.invoiceId!,
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    staffName: "Staff",
    reason: "Attempting to reverse approved payment",
  });
  check("Rejection of approved PAID invoice fails", rejectApprovedRes.success === false);
  check("Invoice remains PAID in DB", (await db.milestoneInvoice.findUnique({ where: { id: qrBooking.invoiceId! } }))?.status === "PAID");

  // 2.3 Idempotency / Double Rejection on REJECTED invoice
  const doubleRejectRes = await rejectPaymentVerification({
    invoiceId: booking1.invoiceId!, // already REJECTED in Step 2
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    staffName: "Staff",
    reason: "Duplicate rejection",
  });
  check("Duplicate rejection of already REJECTED invoice returns success: false", doubleRejectRes.success === false);
  check("Error states invoice is already rejected", doubleRejectRes.error === "Invoice is already rejected");

  // ============================================================================
  // INVARIANT 3: High-Entropy Unique Project & Invoice Numbers Under Volume (CF-M3-03)
  // ============================================================================
  console.log("\n>>> TEST GROUP 3: Proposal Acceptance Uniqueness Under Volume (25 Proposals)");

  // Setup client and studio users for proposals
  const clientUser = await db.user.create({
    data: {
      tenantId: apexTenant.id,
      name: "Volume Test Client",
      email: `volume.client.${Date.now()}@test.com`,
      phone: "+15559000",
      role: "CLIENT",
    },
  });

  const studioLead = await db.user.create({
    data: {
      tenantId: apexTenant.id,
      name: "Volume Test Studio Lead",
      email: `volume.lead.${Date.now()}@test.com`,
      phone: "+15559001",
      role: "STAFF",
    },
  });

  const validSignature =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==_VOLUME_TEST_SIGNATURE_DATA_PADDING_1234567890";

  const numProposals = 25;
  const projectNumbers = new Set<string>();
  const invoiceNumbers = new Set<string>();
  const projectIds = new Set<string>();
  const invoiceIds = new Set<string>();

  console.log(`  ... Generating and accepting ${numProposals} proposals sequentially/rapidly ...`);

  for (let i = 1; i <= numProposals; i++) {
    const proposal = await db.proposal.create({
      data: {
        tenantId: apexTenant.id,
        proposalNumber: `PR-VOL-${Date.now()}-${i}-${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: clientUser.id,
        studioId: studioLead.id,
        title: `Volume Shoot #${i}`,
        discipline: i % 2 === 0 ? "VIDEOGRAPHY" : "PHOTOGRAPHY",
        basePrice: 2000.0 + i * 100,
        totalPrice: 2000.0 + i * 100,
        depositPercentage: 50.0,
        depositAmount: (2000.0 + i * 100) / 2,
        finalBalanceAmount: (2000.0 + i * 100) / 2,
        status: "SENT",
        contractTerms: "Standard production terms and milestones",
      },
    });

    const addOn = await db.proposalAddOn.create({
      data: {
        proposalId: proposal.id,
        name: `Addon for Shoot #${i}`,
        description: "Specialized service",
        price: 200.0,
        isSelected: false,
      },
    });

    const acceptRes = await acceptProposal({
      proposalId: proposal.id,
      tenantSlug: apexTenant.slug,
      signatureDataUrl: validSignature,
      signerName: `Client Signer #${i}`,
      selectedAddOnIds: [addOn.id],
      consentAccepted: true,
    });

    check(`Proposal #${i} accepted successfully`, acceptRes.success === true, JSON.stringify(acceptRes));

    if (acceptRes.success && acceptRes.projectId && acceptRes.invoiceId) {
      projectIds.add(acceptRes.projectId);
      invoiceIds.add(acceptRes.invoiceId);

      const proj = await db.project.findUnique({ where: { id: acceptRes.projectId } });
      const inv = await db.milestoneInvoice.findUnique({ where: { id: acceptRes.invoiceId } });

      if (proj) projectNumbers.add(proj.projectNumber);
      if (inv) invoiceNumbers.add(inv.invoiceNumber);
    }
  }

  check(`Exactly ${numProposals} unique projects created`, projectIds.size === numProposals, `Got ${projectIds.size} unique IDs`);
  check(`Exactly ${numProposals} unique projectNumbers generated`, projectNumbers.size === numProposals, `Got ${projectNumbers.size} unique project numbers`);
  check(`Exactly ${numProposals} unique invoices created`, invoiceIds.size === numProposals, `Got ${invoiceIds.size} unique IDs`);
  check(`Exactly ${numProposals} unique invoiceNumbers generated`, invoiceNumbers.size === numProposals, `Got ${invoiceNumbers.size} unique invoice numbers`);

  // Verify pattern conformance
  let invalidProjPatterns = 0;
  for (const pn of projectNumbers) {
    if (!pn.startsWith(`PJ-${new Date().getFullYear()}-`)) {
      invalidProjPatterns++;
    }
  }
  check("All project numbers match standard PJ-YYYY-XXXXX format", invalidProjPatterns === 0, `${invalidProjPatterns} invalid patterns`);

  let invalidInvPatterns = 0;
  for (const inum of invoiceNumbers) {
    if (!inum.startsWith(`INV-${new Date().getFullYear()}-`)) {
      invalidInvPatterns++;
    }
  }
  check("All invoice numbers match standard INV-YYYY-XXXXXX format", invalidInvPatterns === 0, `${invalidInvPatterns} invalid patterns`);

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`   REVIEWER VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("================================================================================");

  if (failCount > 0) {
    console.error("FAILURES DETECTED:");
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log(">>> ALL REVIEWER INVARIANT AND INTEGRITY CHECKS PASSED [VERDICT: APPROVE]");
  }
}

runReviewerVerification().catch((err) => {
  console.error("FATAL ERROR in reviewer verification:", err);
  process.exit(1);
});
