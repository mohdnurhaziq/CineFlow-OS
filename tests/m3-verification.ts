import { db } from "@/lib/db";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { approvePaymentVerification, rejectPaymentVerification } from "@/lib/actions/admin-verification";
import { acceptProposal } from "@/lib/actions/proposals";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { GET as downloadHandler } from "@/app/api/download/route";
import { NextRequest } from "next/server";
import { holdBookingSlot } from "@/lib/actions/booking";

async function runM3Verification() {
  console.log("===============================================================");
  console.log("   CineFlow OS Milestone 3 Verification Suite (Modules 3, 4, 7) ");
  console.log("===============================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`✗ FAIL: ${testName}`);
      if (details) console.error(`  ↳ Details: ${details}`);
      failedCount++;
      process.exitCode = 1;
    }
  }

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Seed tenants lumina-cine or apex-media not found. Run prisma:seed first.");
  }

  // ============================================================================
  // Test Scenario 1: Card checkout completes instantly and sets slot to BOOKED
  // ============================================================================
  console.log("--- 1. Online Card Checkout (Instant Authorization) ---");
  {
    // Create a fresh test booking slot for Lumina
    const testSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 1200.0,
        depositRequired: 600.0,
        status: "AVAILABLE",
      },
    });

    const sessionId = "sess_card_test_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: testSlot.id, sessionId });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: testSlot.id,
      sessionId,
      clientName: "Elena Rostova",
      clientEmail: `elena.${Date.now()}@example.com`,
      clientPhone: "+1 (555) 234-5678",
      creativeBrief: "High fashion editorial with amber backlights",
      paymentMethod: "CARD",
      cardDetails: {
        cardNumber: "4242424242424242",
        cardExp: "12/28",
        cardCvc: "888",
        cardholderName: "Elena Rostova",
      },
    });

    assert(checkoutRes.success === true, "Card checkout returned success: true");
    assert(checkoutRes.status === "PAID", "Card checkout returned status: PAID");
    assert(Boolean(checkoutRes.trackingCode), "Tracking code generated");
    assert(Boolean(checkoutRes.invoiceNumber), "Invoice number generated");

    // Verify in database
    const slotAfter = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(slotAfter?.status === "BOOKED", "Slot status updated to BOOKED");
    assert(slotAfter?.heldBySessionId === null, "Slot heldBySessionId cleared");

    const invoiceAfter = await db.milestoneInvoice.findUnique({
      where: { id: checkoutRes.invoiceId },
    });
    assert(invoiceAfter?.status === "PAID", "Invoice status in DB is PAID");
    assert(invoiceAfter?.paymentMethod === "CARD", "Invoice paymentMethod is CARD");
    assert(invoiceAfter?.verifiedBy === "System Auto", "Invoice verifiedBy is 'System Auto'");
    assert(invoiceAfter?.paidAt !== null, "Invoice paidAt is recorded");

    const bookingAfter = await db.clientBooking.findUnique({
      where: { trackingCode: checkoutRes.trackingCode! },
    });
    assert(bookingAfter?.status === "CONFIRMED", "ClientBooking status is CONFIRMED");
    assert(bookingAfter?.depositPaid === true, "ClientBooking depositPaid is true");
  }

  // ============================================================================
  // Test Scenario 2: QR slip upload creates PENDING_VERIFICATION invoice
  // ============================================================================
  console.log("\n--- 2. Studio QR Code Scan & Receipt Slip Upload ---");
  let qrInvoiceId = "";
  let qrSlotId = "";
  {
    const testSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        date: new Date(Date.now() + 6 * 24 * 3600 * 1000),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "PORTRAIT",
        price: 800.0,
        depositRequired: 400.0,
        status: "AVAILABLE",
      },
    });
    qrSlotId = testSlot.id;

    const sessionId = "sess_qr_test_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant.id, slotId: testSlot.id, sessionId });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      slotId: testSlot.id,
      sessionId,
      clientName: "Marcus Vance",
      clientEmail: `marcus.${Date.now()}@example.com`,
      clientPhone: "+1 (555) 987-6543",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/receipt_sample_qr.jpg",
      paymentReference: "CHASE-TRX-772819",
    });

    assert(checkoutRes.success === true, "QR checkout returned success: true");
    assert(checkoutRes.status === "PENDING_VERIFICATION", "QR checkout returned status: PENDING_VERIFICATION");
    qrInvoiceId = checkoutRes.invoiceId!;

    const slotAfter = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(slotAfter?.status === "PENDING_VERIFICATION", "Slot status set to PENDING_VERIFICATION");

    const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(invoiceAfter?.status === "PENDING_VERIFICATION", "Invoice status in DB is PENDING_VERIFICATION");
    assert(invoiceAfter?.paymentMethod === "QR_CODE", "Invoice paymentMethod is QR_CODE");
    assert(invoiceAfter?.paymentProofUrl === "/uploads/receipts/receipt_sample_qr.jpg", "Invoice holds paymentProofUrl");

    const bookingAfter = await db.clientBooking.findUnique({
      where: { trackingCode: checkoutRes.trackingCode! },
    });
    assert(bookingAfter?.status === "PENDING", "ClientBooking status is PENDING");
    assert(bookingAfter?.depositPaid === false, "ClientBooking depositPaid is false");
  }

  // ============================================================================
  // Test Scenario 3: Cash counter booking creates PENDING_VERIFICATION invoice
  // ============================================================================
  console.log("\n--- 3. Cash Counter Payment Booking ---");
  let cashInvoiceId = "";
  let cashSlotId = "";
  {
    const testSlot = await db.bookingSlot.create({
      data: {
        tenantId: apexTenant.id,
        date: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        startTime: "11:00 AM",
        endTime: "01:00 PM",
        category: "CONVOCATION",
        price: 450.0,
        depositRequired: 225.0,
        status: "AVAILABLE",
      },
    });
    cashSlotId = testSlot.id;

    const sessionId = "sess_cash_test_" + Date.now();
    await holdBookingSlot({ tenantId: apexTenant.id, slotId: testSlot.id, sessionId });

    const checkoutRes = await processBookingCheckout({
      tenantId: apexTenant.id,
      tenantSlug: apexTenant.slug,
      slotId: testSlot.id,
      sessionId,
      clientName: "Nurul Huda",
      clientEmail: `nurul.${Date.now()}@example.com`,
      clientPhone: "+60 17-889 1234",
      paymentMethod: "CASH",
      paymentReference: "Paying cash counter at 10:30 AM before session",
    });

    assert(checkoutRes.success === true, "Cash checkout returned success: true");
    assert(checkoutRes.status === "PENDING_VERIFICATION", "Cash checkout returned status: PENDING_VERIFICATION");
    cashInvoiceId = checkoutRes.invoiceId!;

    const slotAfter = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(slotAfter?.status === "PENDING_VERIFICATION", "Cash slot status set to PENDING_VERIFICATION");

    const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: cashInvoiceId } });
    assert(invoiceAfter?.status === "PENDING_VERIFICATION", "Cash invoice status in DB is PENDING_VERIFICATION");
    assert(invoiceAfter?.paymentMethod === "CASH", "Cash invoice paymentMethod is CASH");
  }

  // ============================================================================
  // Test Scenario 4: Studio Manual Verification 1-Click Approve Action
  // ============================================================================
  console.log("\n--- 4. Studio Manual Verification 1-Click Approve ---");
  {
    // Approve the QR invoice from Scenario 2
    const approveRes = await approvePaymentVerification({
      invoiceId: qrInvoiceId,
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Sarah Tan",
      notes: "Verified against Chase incoming transaction list",
    });

    assert(approveRes.success === true, "approvePaymentVerification returned success: true");
    assert(approveRes.verifiedBy === "Sarah Tan", "verifiedBy is Sarah Tan");

    const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: qrInvoiceId } });
    assert(invoiceAfter?.status === "PAID", "Invoice status transitioned to PAID");
    assert(invoiceAfter?.verifiedBy === "Sarah Tan", "Invoice verifiedBy recorded in DB");
    assert(invoiceAfter?.paidAt !== null, "Invoice paidAt timestamp set");

    const slotAfter = await db.bookingSlot.findUnique({ where: { id: qrSlotId } });
    assert(slotAfter?.status === "BOOKED", "Linked slot transitioned to BOOKED");

    const bookingAfter = await db.clientBooking.findFirst({
      where: { slotId: qrSlotId },
    });
    assert(bookingAfter?.status === "CONFIRMED", "Linked booking transitioned to CONFIRMED");
    assert(bookingAfter?.depositPaid === true, "Linked booking depositPaid is true");
  }

  // ============================================================================
  // Test Scenario 5: Studio Manual Verification 1-Click Reject Action
  // ============================================================================
  console.log("\n--- 5. Studio Manual Verification 1-Click Reject ---");
  {
    // Reject the Cash invoice from Scenario 3
    const rejectRes = await rejectPaymentVerification({
      invoiceId: cashInvoiceId,
      tenantId: apexTenant.id,
      tenantSlug: apexTenant.slug,
      staffName: "David Chong",
      reason: "Client canceled walk-in attendance",
    });

    assert(rejectRes.success === true, "rejectPaymentVerification returned success: true");
    assert(rejectRes.rejectedBy === "David Chong", "rejectedBy is David Chong");

    const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: cashInvoiceId } });
    assert(invoiceAfter?.status === "REJECTED", "Invoice status transitioned to REJECTED");

    const slotAfter = await db.bookingSlot.findUnique({ where: { id: cashSlotId } });
    assert(slotAfter?.status === "AVAILABLE", "Linked slot released back to AVAILABLE");
    assert(slotAfter?.heldUntil === null, "Slot heldUntil cleared");
    assert(slotAfter?.heldBySessionId === null, "Slot heldBySessionId cleared");

    const cancelledBooking = await db.clientBooking.findFirst({
      where: { userId: invoiceAfter!.clientId, tenantId: apexTenant.id },
    });
    assert(
      cancelledBooking?.status === "CANCELLED" && cancelledBooking?.slotId === null,
      "Linked booking transitioned to CANCELLED and slotId is unlinked"
    );
  }

  // ============================================================================
  // Test Scenario 6: Final balance invoice payment sets Project.isFinalBalancePaid = true
  // ============================================================================
  console.log("\n--- 6. Final Balance Payment & Project Paywall Unlocking ---");
  {
    // Ensure clean baseline state for scenario 6
    await db.project.update({
      where: { id: "proj_lumina_01" },
      data: { isFinalBalancePaid: false },
    });
    await db.milestoneInvoice.update({
      where: { id: "inv_lum_2" },
      data: { status: "PENDING", verifiedBy: null, paidAt: null },
    });

    const projectBefore = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
    assert(projectBefore !== null, "Project proj_lumina_01 exists");
    assert(projectBefore?.isFinalBalancePaid === false, "Project isFinalBalancePaid is initially false");

    // Settle inv_lum_2 via Card or Approve
    const settleRes = await approvePaymentVerification({
      invoiceId: "inv_lum_2",
      tenantId: luminaTenant.id,
      tenantSlug: luminaTenant.slug,
      staffName: "Production Lead",
      notes: "Client wired final 50% milestone",
    });

    assert(settleRes.success === true, "approvePaymentVerification returned success for final balance");
    assert(settleRes.unlockedDownloads === true, "unlockedDownloads flag is true");

    const projectAfter = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
    assert(projectAfter?.isFinalBalancePaid === true, "Project.isFinalBalancePaid atomically updated to true!");

    const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: "inv_lum_2" } });
    assert(invoiceAfter?.status === "PAID", "FINAL_BALANCE_50 invoice marked as PAID");
  }

  // ============================================================================
  // Test Scenario 7: Proposal builder add-on recalculation math & signature acceptance
  // ============================================================================
  console.log("\n--- 7. Interactive Proposal Builder & Retainer Invoicing ---");
  {
    // Ensure clean baseline state for scenario 7
    await db.milestoneInvoice.deleteMany({
      where: { proposalId: "prop_lumina_02", milestoneType: "RETAINER_50" },
    });
    await db.project.deleteMany({
      where: { proposalId: "prop_lumina_02" },
    });
    await db.proposal.update({
      where: { id: "prop_lumina_02" },
      data: {
        status: "SENT",
        totalPrice: 5200.0,
        depositAmount: 2600.0,
        finalBalanceAmount: 2600.0,
        clientSignature: null,
        signedAt: null,
      },
    });
    await db.proposalAddOn.updateMany({
      where: { proposalId: "prop_lumina_02" },
      data: { isSelected: false },
    });

    const proposal = await db.proposal.findUnique({
      where: { id: "prop_lumina_02" },
      include: { addOns: true },
    });

    assert(proposal !== null, "Active SENT proposal prop_lumina_02 found");
    assert(proposal?.status === "SENT", "prop_lumina_02 is in SENT status");

    const droneAddon = proposal?.addOns.find((a) => a.name.includes("Drone"));
    const rawAddon = proposal?.addOns.find((a) => a.name.includes("RAW"));

    assert(Boolean(droneAddon), "Drone add-on exists ($450)");
    assert(Boolean(rawAddon), "RAW SSD add-on exists ($350)");

    // Base: 5200.0, Drone: 450, RAW: 350 => Total: 6000.0, Deposit (50%): 3000.0
    const acceptRes = await acceptProposal({
      proposalId: "prop_lumina_02",
      tenantSlug: luminaTenant.slug,
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      signerName: "Julian Sterling",
      signerTitle: "Managing Director",
      selectedAddOnIds: [droneAddon!.id, rawAddon!.id],
      consentAccepted: true,
    });

    assert(acceptRes.success === true, "acceptProposal returned success: true");
    assert(acceptRes.amount === 3000.0, `Computed 50% deposit amount is 3000.0 (got ${acceptRes.amount})`);

    const proposalAfter = await db.proposal.findUnique({
      where: { id: "prop_lumina_02" },
      include: { addOns: true, project: true, invoices: true },
    });

    assert(proposalAfter?.status === "ACCEPTED", "Proposal status updated to ACCEPTED");
    assert(proposalAfter?.totalPrice === 6000.0, `Proposal totalPrice updated to 6000.0 (got ${proposalAfter?.totalPrice})`);
    assert(proposalAfter?.depositAmount === 3000.0, "Proposal depositAmount is 3000.0");
    assert(proposalAfter?.finalBalanceAmount === 3000.0, "Proposal finalBalanceAmount is 3000.0");
    assert(proposalAfter?.clientSignature !== null, "Proposal holds clientSignature");
    assert(proposalAfter?.signedAt !== null, "Proposal holds signedAt timestamp");

    // Check add-ons isSelected state
    const droneAfter = proposalAfter?.addOns.find((a) => a.id === droneAddon!.id);
    const rawAfter = proposalAfter?.addOns.find((a) => a.id === rawAddon!.id);
    assert(droneAfter?.isSelected === true, "Drone add-on isSelected is true");
    assert(rawAfter?.isSelected === true, "RAW SSD add-on isSelected is true");

    // Check Project created in PRE_PRODUCTION
    assert(Boolean(proposalAfter?.project), "Project created for accepted proposal");
    assert(proposalAfter?.project?.status === "PRE_PRODUCTION", "Project status is PRE_PRODUCTION");
    assert(proposalAfter?.project?.budget === 6000.0, "Project budget matches total price");

    // Check MilestoneInvoice for RETAINER_50
    const retainerInvoice = proposalAfter?.invoices.find((i) => i.milestoneType === "RETAINER_50");
    assert(Boolean(retainerInvoice), "RETAINER_50 milestone invoice created");
    assert(retainerInvoice?.amount === 3000.0, "Retainer invoice amount is 3000.0");
    assert(retainerInvoice?.status === "PENDING", "Retainer invoice status is PENDING");
  }

  // ============================================================================
  // Test Scenario 8: Paywall delivery vault download security (403 vs 200)
  // ============================================================================
  console.log("\n--- 8. Paywall Download Gating Security Enforcement ---");
  {
    // A: Test with UNPAID project (temporarily toggle proj_lumina_01 isFinalBalancePaid = false)
    await db.project.update({
      where: { id: "proj_lumina_01" },
      data: { isFinalBalancePaid: false },
    });

    const unpaidReq = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
    const unpaidRes = await downloadHandler(unpaidReq);

    assert(unpaidRes.status === 403, `Unpaid project download returns 403 Forbidden (got ${unpaidRes.status})`);
    const unpaidBody = await unpaidRes.json();
    assert(
      unpaidBody.error?.includes("Payment Required"),
      "403 response includes 'Payment Required' error message"
    );

    // B: Test with PAID project (proj_apex_01 has isFinalBalancePaid = true in seed)
    const paidReq = new NextRequest("http://localhost:3000/api/download?projectId=proj_apex_01&type=photo_zip");
    const paidRes = await downloadHandler(paidReq);

    assert(paidRes.status === 200, `Paid project download returns 200 OK (got ${paidRes.status})`);
    assert(
      paidRes.headers.get("content-type") === "application/zip",
      "Paid project photo_zip Content-Type is application/zip"
    );
    assert(
      paidRes.headers.get("content-disposition")?.includes("Master_Deliverables.zip") === true,
      "Content-Disposition specifies Master_Deliverables.zip"
    );

    const zipBuffer = Buffer.from(await paidRes.arrayBuffer());
    assert(zipBuffer.length > 0, "ZIP buffer stream has non-zero size");
    // Standard PKZIP header signature is 0x04034b50 ("PK\x03\x04")
    assert(
      zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b,
      "Valid PKZIP archive magic header (0x50, 0x4b)"
    );

    // Restore proj_lumina_01 to paid
    await db.project.update({
      where: { id: "proj_lumina_01" },
      data: { isFinalBalancePaid: true },
    });

    // C: Test Video Master Download on paid project (proj_lumina_01 has 4K video deliverable)
    const videoReq = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=video_master");
    const videoRes = await downloadHandler(videoReq);
    assert(videoRes.status === 200, "Paid video master download returns 200 OK");
  }

  // ============================================================================
  // Test Scenario 9: Client favorite toggling and retouch notes persistence
  // ============================================================================
  console.log("\n--- 9. Client Favorites Hearting & Retouch Feedback ---");
  {
    const photoItem = await db.deliverableItem.findFirst({
      where: { itemType: "PHOTO" },
    });

    assert(photoItem !== null, "Deliverable photo item found in database");

    // A: Toggle Favorite to true
    const favRes1 = await toggleClientFavorite({ itemId: photoItem!.id, isFav: true });
    assert(favRes1.success === true, "toggleClientFavorite (true) returned success");
    const itemFav1 = await db.deliverableItem.findUnique({ where: { id: photoItem!.id } });
    assert(itemFav1?.isClientFav === true, "Database updated isClientFav to true");

    // B: Toggle Favorite back to false
    const favRes2 = await toggleClientFavorite({ itemId: photoItem!.id, isFav: false });
    assert(favRes2.success === true, "toggleClientFavorite (false) returned success");
    const itemFav2 = await db.deliverableItem.findUnique({ where: { id: photoItem!.id } });
    assert(itemFav2?.isClientFav === false, "Database updated isClientFav to false");

    // C: Submit Retouch Note
    const testNote = "Color grading note: please lift shadows in background curtain by +8%";
    const noteRes = await submitRetouchNote({ itemId: photoItem!.id, note: testNote });
    assert(noteRes.success === true, "submitRetouchNote returned success");
    const itemNote = await db.deliverableItem.findUnique({ where: { id: photoItem!.id } });
    assert(itemNote?.clientNotes === testNote, "Retouch note persisted in database");
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n===============================================================");
  console.log(`Milestone 3 Verification Complete: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("===============================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runM3Verification()
  .catch((err) => {
    console.error("Unhandled error in M3 verification suite:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
