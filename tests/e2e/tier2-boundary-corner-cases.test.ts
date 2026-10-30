/**
 * Tier 2: Boundary & Corner Cases Test Suite
 * Covers 35 distinct boundary, edge, and corner test cases across 5 critical domains:
 * - Domain 1: Holding Expiration Edge Cases (7 tests)
 * - Domain 2: 50% Paywall Locking & Balance State Validation (8 tests)
 * - Domain 3: Zero and Negative Pricing Validations & Illegal State Transitions (7 tests)
 * - Domain 4: Duplicate SKUs & Slug Uniqueness Collisions Across Tenants (7 tests)
 * - Domain 5: Extreme Solar Coordinates & Input Robustness (6 tests)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { holdBookingSlot } from "@/lib/actions/booking";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { GET as downloadHandler } from "@/app/api/download/route";
import {
  createServicePackage,
  createCampaignCategory,
} from "@/lib/actions/admin-services";
import {
  createSingleBookingSlot,
  deleteBookingSlot,
  forceReleaseHeldSlot,
} from "@/lib/actions/admin-calendar";
import {
  createFrameDesign,
  createPrintSize,
} from "@/lib/actions/admin-frames";
import { acceptProposal } from "@/lib/actions/proposals";
import { createGearItem } from "@/lib/actions/gear";
import { onboardStudio, checkSlugAvailability } from "@/lib/actions/onboarding";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";

export async function runTier2BoundaryTests(harness: TestHarness) {
  harness.setSuite("Tier 2", "Boundary & Corner Cases (Domains 1-5, 35 Tests)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  harness.assert(luminaTenant !== null, "Lumina tenant resolved");
  harness.assert(apexTenant !== null, "Apex tenant resolved");

  // ============================================================================
  // Domain 1: Holding Expiration Edge Cases (7 Tests)
  // ============================================================================
  await harness.test("T2-HOLD-01: Exact 10-Minute Lease Expiration Boundary (+600,000ms)", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-01T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });

    const sessionId_A = `sess_a_${Date.now()}`;
    const t0 = Date.now();
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: sessionId_A,
    });

    harness.assert(holdRes.success === true, "holdBookingSlot succeeded");
    const updated = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(updated?.status, "HELD", "Slot status is HELD");
    harness.assertEqual(updated?.heldBySessionId, sessionId_A, "heldBySessionId set to session A");

    const expectedHeldUntil = t0 + 600000;
    const actualHeldUntil = updated?.heldUntil ? updated.heldUntil.getTime() : 0;
    const diff = Math.abs(actualHeldUntil - expectedHeldUntil);
    harness.assert(diff < 5000, `heldUntil is ~10 minutes from call time (diff: ${diff}ms)`);

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-HOLD-02: Expired Slot Reclamation by Competing Session", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-02T00:00:00.000Z"),
        startTime: "11:00",
        endTime: "12:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "HELD",
        heldBySessionId: "session_old_expired",
        heldUntil: new Date(Date.now() - 2000), // expired 2 seconds ago
      },
    });

    const sessionId_B = `sess_reclaim_${Date.now()}`;
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: sessionId_B,
    });

    harness.assert(holdRes.success === true, "Expired slot reclaimed successfully");
    const updated = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(updated?.status, "HELD", "Status remains HELD");
    harness.assertEqual(updated?.heldBySessionId, sessionId_B, "heldBySessionId updated to competing session B");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-HOLD-03: Active Unexpired Slot Contention Rejection (SLOT_ALREADY_HELD)", async () => {
    const sessionId_A = `sess_holder_${Date.now()}`;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-03T00:00:00.000Z"),
        startTime: "12:00",
        endTime: "13:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "HELD",
        heldBySessionId: sessionId_A,
        heldUntil: new Date(Date.now() + 300000), // active for 5 more minutes
      },
    });

    const sessionId_B = `sess_intruder_${Date.now()}`;
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: sessionId_B,
    });

    harness.assert(holdRes.success === false, "Contention rejected");
    harness.assertEqual(holdRes.error, "SLOT_ALREADY_HELD", "Error is SLOT_ALREADY_HELD");
    const check = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(check?.heldBySessionId, sessionId_A, "Session A retains hold");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-HOLD-04: Checkout Rejection on Expired Slot Lease (SLOT_EXPIRED_OR_UNAVAILABLE)", async () => {
    const sessionId = `sess_expired_checkout_${Date.now()}`;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-04T00:00:00.000Z"),
        startTime: "14:00",
        endTime: "15:00",
        category: "commercial",
        price: 600,
        depositRequired: 200,
        status: "HELD",
        heldBySessionId: sessionId,
        heldUntil: new Date(Date.now() - 1000), // expired 1s ago
      },
    });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId,
      clientName: "Late Checkout Client",
      clientEmail: "late@example.com",
      clientPhone: "+15559876543",
      paymentMethod: "CARD",
    });

    harness.assert(checkoutRes.success === false, "Checkout on expired hold rejected");
    harness.assertEqual(checkoutRes.error, "SLOT_EXPIRED_OR_UNAVAILABLE", "Error code is SLOT_EXPIRED_OR_UNAVAILABLE");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-HOLD-05: Active Session Hold Extension / Refresh", async () => {
    const sessionId = `sess_refresh_${Date.now()}`;
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-05T00:00:00.000Z"),
        startTime: "15:00",
        endTime: "16:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "HELD",
        heldBySessionId: sessionId,
        heldUntil: new Date(Date.now() + 120000), // 2 mins left
      },
    });

    const refreshRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId,
    });

    harness.assert(refreshRes.success === true, "Hold refresh succeeded");
    const updated = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    const remainingMs = updated?.heldUntil ? updated.heldUntil.getTime() - Date.now() : 0;
    harness.assert(remainingMs > 500000, `heldUntil refreshed to ~10 mins (remaining: ${remainingMs}ms)`);

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-HOLD-06: Non-Holdable Slot State Rejection Matrix (BOOKED, BLOCKED, PENDING_VERIFICATION)", async () => {
    const bookedSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-06T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "10:00",
        category: "commercial",
        price: 400,
        depositRequired: 100,
        status: "BOOKED",
      },
    });

    const blockedSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-06T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        category: "commercial",
        price: 400,
        depositRequired: 100,
        status: "BLOCKED",
      },
    });

    const pendingSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-06T00:00:00.000Z"),
        startTime: "11:00",
        endTime: "12:00",
        category: "commercial",
        price: 400,
        depositRequired: 100,
        status: "PENDING_VERIFICATION",
      },
    });

    const resBooked = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: bookedSlot.id,
      sessionId: "session_test",
    });
    harness.assertEqual(resBooked.error, "SLOT_ALREADY_BOOKED", "BOOKED slot rejected with SLOT_ALREADY_BOOKED");

    const resBlocked = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: blockedSlot.id,
      sessionId: "session_test",
    });
    harness.assertEqual(resBlocked.error, "SLOT_BLOCKED", "BLOCKED slot rejected with SLOT_BLOCKED");

    const resPending = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: pendingSlot.id,
      sessionId: "session_test",
    });
    harness.assertEqual(resPending.error, "SLOT_PENDING_VERIFICATION", "PENDING_VERIFICATION slot rejected with SLOT_PENDING_VERIFICATION");

    await db.bookingSlot.deleteMany({
      where: { id: { in: [bookedSlot.id, blockedSlot.id, pendingSlot.id] } },
    });
  });

  await harness.test("T2-HOLD-07: Cross-Tenant Slot Holding Isolation", async () => {
    const luminaSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-06-07T00:00:00.000Z"),
        startTime: "13:00",
        endTime: "14:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });

    // Attempt to hold Lumina slot passing Apex tenant ID
    const crossRes = await holdBookingSlot({
      tenantId: apexTenant!.id,
      slotId: luminaSlot.id,
      sessionId: "session_apex_attacker",
    });

    harness.assert(crossRes.success === false, "Cross-tenant slot holding rejected");
    harness.assertEqual(crossRes.error, "SLOT_NOT_FOUND", "Error is SLOT_NOT_FOUND");
    const check = await db.bookingSlot.findUnique({ where: { id: luminaSlot.id } });
    harness.assertEqual(check?.status, "AVAILABLE", "Lumina slot remains AVAILABLE");

    await db.bookingSlot.delete({ where: { id: luminaSlot.id } });
  });

  // ============================================================================
  // Domain 2: 50% Paywall Locking & Balance State Validation (8 Tests)
  // ============================================================================
  await harness.test("T2-PAY-01: Unpaid Photo Master ZIP Gating (HTTP 403 Forbidden)", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, isFinalBalancePaid: false },
    });
    harness.assert(project !== null, "Unpaid project found");

    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${project!.id}&type=photo_zip`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid project photo ZIP returns 403 Forbidden");
    const data = await res.json();
    harness.assert(data.error.includes("Payment Required"), "Error message specifies Payment Required");
    harness.assertEqual(data.isFinalBalancePaid, false, "Response confirms isFinalBalancePaid is false");
  });

  await harness.test("T2-PAY-02: Unpaid Video 4K Master Gating (HTTP 403 Forbidden)", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, isFinalBalancePaid: false },
    });
    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${project!.id}&type=video_master`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid video master download returns 403 Forbidden");
  });

  await harness.test("T2-PAY-03: Unpaid Single Photo Master Gating (HTTP 403 Forbidden)", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, isFinalBalancePaid: false },
    });
    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${project!.id}&type=photo_master&assetId=asset_123`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid single photo master returns 403 Forbidden");
  });

  await harness.test("T2-PAY-04: Pending Final Balance Verification Does Not Prematurely Unlock", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: luminaTenant!.id } });
    const project = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioLeadId: lead!.id,
        projectNumber: `PJ-TEST-LOCK-${Date.now()}`,
        title: "Paywall Lock Test Project",
        discipline: "HYBRID",
        status: "POST_PRODUCTION",
        budget: 4000,
        isFinalBalancePaid: false,
      },
    });

    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        projectId: project.id,
        invoiceNumber: `INV-LOCK-${Date.now()}`,
        milestoneType: "FINAL_BALANCE_50",
        amount: 2000,
        dueDate: new Date(),
        status: "PENDING_VERIFICATION",
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "PENDING_VERIFICATION invoice does not unlock paywall (403)");

    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
    await db.project.delete({ where: { id: project.id } });
  });

  await harness.test("T2-PAY-05: Instant Online Card Settlement Unlocks Paywall", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: luminaTenant!.id } });
    const project = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioLeadId: lead!.id,
        projectNumber: `PJ-TEST-UNLOCK-${Date.now()}`,
        title: "Card Unlock Test Project",
        discipline: "HYBRID",
        status: "POST_PRODUCTION",
        budget: 4000,
        isFinalBalancePaid: false,
      },
    });

    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        projectId: project.id,
        invoiceNumber: `INV-CARD-${Date.now()}`,
        milestoneType: "FINAL_BALANCE_50",
        amount: 2000,
        dueDate: new Date(),
        status: "PENDING",
      },
    });

    const payRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: invoice.id,
      paymentMethod: "CARD",
    });

    harness.assert(payRes.success === true, "Card settlement succeeded");
    const updatedProject = await db.project.findUnique({ where: { id: project.id } });
    harness.assertEqual(updatedProject?.isFinalBalancePaid, true, "Project.isFinalBalancePaid transitioned to true");

    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
    await db.project.delete({ where: { id: project.id } });
  });

  await harness.test("T2-PAY-06: Studio Admin Manual Verification Approval Unlocks Paywall", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: luminaTenant!.id } });
    const project = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioLeadId: lead!.id,
        projectNumber: `PJ-TEST-VERIFY-${Date.now()}`,
        title: "Manual Verify Unlock Project",
        discipline: "HYBRID",
        status: "POST_PRODUCTION",
        budget: 4000,
        isFinalBalancePaid: false,
      },
    });

    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        projectId: project.id,
        invoiceNumber: `INV-VERIFY-${Date.now()}`,
        milestoneType: "FINAL_BALANCE_50",
        amount: 2000,
        dueDate: new Date(),
        status: "PENDING_VERIFICATION",
      },
    });

    const approveRes = await approvePaymentVerification({
      invoiceId: invoice.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Lead Staff Member",
    });

    harness.assert(approveRes.success === true, "Manual approval succeeded");
    const updatedProject = await db.project.findUnique({ where: { id: project.id } });
    harness.assertEqual(updatedProject?.isFinalBalancePaid, true, "isFinalBalancePaid unlocked to true");

    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
    await db.project.delete({ where: { id: project.id } });
  });

  await harness.test("T2-PAY-07: Valid PKZIP Binary Stream Header on Unlocked Download", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: luminaTenant!.id } });
    const project = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioLeadId: lead!.id,
        projectNumber: `PJ-ZIP-HEAD-${Date.now()}`,
        title: "Zip Header Test Project",
        discipline: "PHOTOGRAPHY",
        status: "COMPLETED",
        budget: 3000,
        isFinalBalancePaid: true,
      },
    });

    const deliverable = await db.clientDeliverable.create({
      data: {
        projectId: project.id,
        discipline: "PHOTOGRAPHY",
        title: "Master Stills",
      },
    });

    await db.deliverableItem.create({
      data: {
        deliverableId: deliverable.id,
        title: "Header_Photo_01",
        itemType: "PHOTO",
        downloadUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
        previewUrl: "/uploads/deliverables/previews/lookbook_01.jpg",
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 200, "Unlocked download returns 200 OK");
    harness.assertEqual(res.headers.get("content-type"), "application/zip", "Content-Type is application/zip");

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    harness.assert(bytes.length >= 4, "ZIP stream contains bytes");
    harness.assert(
      bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
      "Buffer bytes 0-3 match PKZIP magic numbers (0x50, 0x4B, 0x03, 0x04)"
    );

    await db.deliverableItem.deleteMany({ where: { deliverableId: deliverable.id } });
    await db.clientDeliverable.delete({ where: { id: deliverable.id } });
    await db.project.delete({ where: { id: project.id } });
  });

  await harness.test("T2-PAY-08: Cross-Tenant Vault Download Gating (404 Not Found on invalid project)", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=non_existent_project_9999&type=photo_zip");
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 404, "Invalid projectId returns 404 Not Found");
  });

  // ============================================================================
  // Domain 3: Zero and Negative Pricing Validations & Illegal State Transitions (7 Tests)
  // ============================================================================
  await harness.test("T2-PRICE-01: Negative Package & Deposit Pricing Rejection", async () => {
    const res = await createServicePackage({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Negative Price Package",
      category: "commercial",
      discipline: "VIDEOGRAPHY",
      price: -150,
      depositPrice: -50,
      turnaround: "3 Days",
      description: "Should fail validation",
      deliverables: "None",
      isFeatured: false,
    });

    harness.assert(res.success === false, "Negative price creation rejected");
    harness.assertEqual(res.error, "CREATE_PACKAGE_FAILED", "Error code is CREATE_PACKAGE_FAILED");
  });

  await harness.test("T2-PRICE-02: Zero-Dollar ($0.00) Package & Slot Creation", async () => {
    const pkgRes = await createServicePackage({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Complimentary Creative Consultation",
      category: "commercial",
      discipline: "VIDEOGRAPHY",
      price: 0,
      depositPrice: 0,
      turnaround: "Same Day",
      description: "Complimentary initial meeting",
      deliverables: "Creative Brief",
      isFeatured: false,
    });

    harness.assert(pkgRes.success === true, "Zero-dollar package creation allowed");
    harness.assertEqual(pkgRes.package?.price, 0, "Package price is 0");
    harness.assertEqual(pkgRes.package?.depositPrice, 0, "Deposit price is 0");

    const slotRes = await createSingleBookingSlot({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      date: "2027-07-01",
      startTime: "10:00",
      endTime: "10:30",
      category: "commercial",
      campaignTitle: "Free Consult",
      price: 0,
      depositRequired: 0,
      status: "AVAILABLE",
    });

    harness.assert(slotRes.success === true, "Zero-dollar booking slot allowed");
    harness.assertEqual(slotRes.slot?.price, 0, "Slot price is 0");
    harness.assertEqual(slotRes.slot?.depositRequired, 0, "Deposit is 0");

    await db.servicePackage.delete({ where: { id: pkgRes.package!.id } });
    await db.bookingSlot.delete({ where: { id: slotRes.slot!.id } });
  });

  await harness.test("T2-PRICE-03: Negative Frame Molding Dimensions & Price Offset Rejection", async () => {
    const frameRes = await createFrameDesign({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Negative Frame",
      material: "Wood",
      moldingWidth: -1.5,
      frameColor: "#000000",
      previewAsset: "/frames/neg.png",
      priceOffset: -50,
      isAvailable: true,
    });
    harness.assert(frameRes.success === false, "Negative molding width rejected");

    const sizeRes = await createPrintSize({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      code: "NEG8R",
      name: "Negative Size",
      widthInches: -8,
      heightInches: 10,
      basePrice: -100,
    });
    harness.assert(sizeRes.success === false, "Negative dimensions and base price rejected");
  });

  await harness.test("T2-STATE-01: Illegal Re-Verification of Already PAID Invoice (ALREADY_VERIFIED)", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        invoiceNumber: `INV-ALREADY-PD-${Date.now()}`,
        milestoneType: "RETAINER_50",
        amount: 1000,
        dueDate: new Date(),
        status: "PAID",
      },
    });

    const res = await approvePaymentVerification({
      invoiceId: invoice.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Staff Member",
    });

    harness.assert(res.success === false, "Re-verification rejected");
    harness.assertEqual(res.error, "ALREADY_VERIFIED", "Error code is ALREADY_VERIFIED");

    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
  });

  await harness.test("T2-STATE-02: Illegal Re-Payment of Settled Invoice (ALREADY_PAID)", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        invoiceNumber: `INV-ALREADY-SETTLE-${Date.now()}`,
        milestoneType: "RETAINER_50",
        amount: 1000,
        dueDate: new Date(),
        status: "PAID",
      },
    });

    const res = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: invoice.id,
      paymentMethod: "CARD",
    });

    harness.assert(res.success === false, "Re-payment rejected");
    harness.assertEqual(res.error, "ALREADY_PAID", "Error code is ALREADY_PAID");

    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
  });

  await harness.test("T2-STATE-03: Deletion Guard on BOOKED and PENDING Slots (SLOT_HAS_BOOKING)", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-08-01T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "BOOKED",
      },
    });

    const delRes = await deleteBookingSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === false, "Deleting BOOKED slot blocked");
    harness.assertEqual(delRes.error, "SLOT_HAS_BOOKING", "Error code is SLOT_HAS_BOOKING");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T2-STATE-04: Idempotent Proposal Acceptance", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const prop = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-IDEM2-${Date.now()}`,
        title: "Idempotent State Test",
        basePrice: 2000,
        totalPrice: 2000,
        depositAmount: 1000,
        finalBalanceAmount: 1000,
        contractTerms: "Standard Terms",
        status: "SENT",
      },
    });

    const call1 = await acceptProposal({
      proposalId: prop.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    const call2 = await acceptProposal({
      proposalId: prop.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(call1.success === true && call2.success === true, "Both calls returned success");
    harness.assertEqual(call1.projectId, call2.projectId, "Same project returned");
    harness.assertEqual(call1.invoiceId, call2.invoiceId, "Same invoice returned");

    await db.milestoneInvoice.deleteMany({ where: { proposalId: prop.id } });
    await db.project.deleteMany({ where: { proposalId: prop.id } });
    await db.proposal.delete({ where: { id: prop.id } });
  });

  // ============================================================================
  // Domain 4: Duplicate SKUs & Slug Uniqueness Collisions Across Tenants (7 Tests)
  // ============================================================================
  await harness.test("T2-UNIQ-01: Duplicate Equipment SKU in Same Tenant (SKU_EXISTS)", async () => {
    const sku = `DUP-SAME-${Date.now()}`;
    const item1 = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Original Camera",
      sku,
      category: "Cameras",
      discipline: "VIDEOGRAPHY",
    });
    harness.assert(item1.success === true, "Item 1 created");

    const item2 = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Colliding Camera",
      sku,
      category: "Cameras",
      discipline: "VIDEOGRAPHY",
    });

    harness.assert(item2.success === false, "Duplicate SKU rejected");
    harness.assertEqual(item2.error, "SKU_EXISTS", "Error code is SKU_EXISTS");

    await db.inventoryItem.delete({ where: { id: item1.item!.id } });
  });

  await harness.test("T2-UNIQ-02: Global Duplicate SKU Across Different Tenants (SKU_EXISTS)", async () => {
    const sku = `DUP-CROSS-${Date.now()}`;
    const luminaItem = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Lumina Lens",
      sku,
      category: "Lenses",
      discipline: "VIDEOGRAPHY",
    });
    harness.assert(luminaItem.success === true, "Lumina item created");

    const apexItem = await createGearItem({
      tenantId: apexTenant!.id,
      tenantSlug: "apex-media",
      name: "Apex Lens Colliding",
      sku,
      category: "Lenses",
      discipline: "PHOTOGRAPHY",
    });

    harness.assert(apexItem.success === false, "Cross-tenant duplicate SKU rejected globally");
    harness.assertEqual(apexItem.error, "SKU_EXISTS", "Error code is SKU_EXISTS");

    await db.inventoryItem.delete({ where: { id: luminaItem.item!.id } });
  });

  await harness.test("T2-UNIQ-03: Duplicate Studio URL Slug on Onboarding (SLUG_ALREADY_TAKEN)", async () => {
    const res = await onboardStudio({
      name: "Duplicate Lumina Studio",
      slug: "lumina-cine",
      discipline: "VIDEOGRAPHY",
      currency: "USD",
      ownerName: "Attacker",
      ownerEmail: "attacker@example.com",
      ownerPhone: "+15550000000",
      password: "Password123!",
    });

    harness.assert(res.success === false, "Duplicate slug registration rejected");
    harness.assert(
      Boolean(res.error === "SLUG_ALREADY_TAKEN" || res.error?.includes("already taken")),
      "Error indicates slug is already taken"
    );
  });

  await harness.test("T2-UNIQ-04: Reserved Platform Slugs Rejection (checkSlugAvailability)", async () => {
    const reserved = ["admin", "super-admin", "create-studio", "api"];
    for (const r of reserved) {
      const avail = await checkSlugAvailability(r);
      harness.assertEqual(avail.available, false, `Reserved slug '${r}' available is false`);
      harness.assert(avail.error !== undefined, `Reserved slug '${r}' error is defined`);
    }
  });

  await harness.test("T2-UNIQ-05: Studio Settings Slug Update Collision Guard", async () => {
    const res = await updateStudioSettings({
      tenantId: apexTenant!.id,
      tenantSlug: "apex-media",
      name: apexTenant!.name,
      newSlug: "lumina-cine",
      brandColor: apexTenant!.brandColor || "#3B82F6",
      discipline: "PHOTOGRAPHY",
      currency: "MYR",
    });

    harness.assert(res.success === false, "Slug update to existing tenant slug rejected");
    harness.assertEqual(res.error, "SLUG_EXISTS", "Error code is SLUG_EXISTS");
  });

  await harness.test("T2-UNIQ-06: Tenant-Scoped Campaign Category Slug Independence", async () => {
    const sharedSlug = `shared-cat-${Date.now()}`;
    const catLumina = await createCampaignCategory({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Shared Cat Lumina",
      slug: sharedSlug,
      sortOrder: 1,
      isActive: true,
    });

    const catApex = await createCampaignCategory({
      tenantId: apexTenant!.id,
      tenantSlug: "apex-media",
      name: "Shared Cat Apex",
      slug: sharedSlug,
      sortOrder: 1,
      isActive: true,
    });

    harness.assert(catLumina.success === true, "Lumina category with shared slug created");
    harness.assert(catApex.success === true, "Apex category with shared slug created (independent scope)");

    await db.campaignCategory.delete({ where: { id: catLumina.category!.id } });
    await db.campaignCategory.delete({ where: { id: catApex.category!.id } });
  });

  await harness.test("T2-UNIQ-07: Tenant-Scoped Print Size Code Independence", async () => {
    const sharedCode = `S${Date.now().toString().slice(-6)}`;
    const sizeLumina = await createPrintSize({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      code: sharedCode,
      name: "Shared Size Lumina",
      widthInches: 10,
      heightInches: 12,
      basePrice: 50,
    });

    const sizeApex = await createPrintSize({
      tenantId: apexTenant!.id,
      tenantSlug: "apex-media",
      code: sharedCode,
      name: "Shared Size Apex",
      widthInches: 10,
      heightInches: 12,
      basePrice: 60,
    });

    harness.assert(sizeLumina.success === true, "Lumina size created");
    harness.assert(sizeApex.success === true, "Apex size created with identical code (independent scope)");

    await db.printSize.delete({ where: { id: sizeLumina.printSize!.id } });
    await db.printSize.delete({ where: { id: sizeApex.printSize!.id } });
  });

  // ============================================================================
  // Domain 5: Extreme Solar Coordinates & Input Robustness (6 Tests)
  // ============================================================================
  await harness.test("T2-SOLAR-01: Equator Equinox Solar Calculation", async () => {
    const equinox = new Date("2026-03-20T12:00:00Z");
    const solar = calculateGoldenHour(0.0, -78.4678, equinox, -5); // Quito, Ecuador (UTC-5)

    harness.assert(typeof solar.sunrise === "string", "Sunrise calculated");
    harness.assert(typeof solar.sunset === "string", "Sunset calculated");
    harness.assert(!solar.sunrise.includes("NaN"), "Sunrise does not contain NaN");
    harness.assert(!solar.sunset.includes("NaN"), "Sunset does not contain NaN");
    harness.assert(solar.sunrise.startsWith("06:"), "Sunrise is approximately 06:xx AM on Equator Equinox");
  });

  await harness.test("T2-SOLAR-02: Exact North & South Polar Extremities (90.0 and -90.0)", async () => {
    const date = new Date("2026-06-21T12:00:00Z");
    const north = calculateGoldenHour(90.0, 0.0, date, 0);
    const south = calculateGoldenHour(-90.0, 0.0, date, 0);

    harness.assert(!north.sunrise.includes("NaN"), "North pole calculation contains no NaN");
    harness.assert(!south.sunrise.includes("NaN"), "South pole calculation contains no NaN");
    harness.assert(typeof north.goldenHourMorning === "string", "North pole golden hour string returned");
    harness.assert(typeof south.goldenHourMorning === "string", "South pole golden hour string returned");
  });

  await harness.test("T2-SOLAR-03: Arctic Circle Polar Night (Mid-Winter)", async () => {
    const polarNight = new Date("2026-12-21T12:00:00Z");
    const solar = calculateGoldenHour(69.6492, 18.9553, polarNight, 1); // Tromsø, Norway

    harness.assert(!solar.sunrise.includes("NaN"), "Polar night returns valid fallback time without NaN");
    harness.assert(!solar.sunset.includes("NaN"), "Polar night returns valid sunset without NaN");
  });

  await harness.test("T2-SOLAR-04: Southern Hemisphere Summer Solstice", async () => {
    const decSolstice = new Date("2026-12-21T12:00:00Z");
    const solar = calculateGoldenHour(-33.8688, 151.2093, decSolstice, 11); // Sydney, Australia (UTC+11)

    harness.assert(solar.sunrise.startsWith("05:"), "Sydney summer solstice sunrise is early morning (~05:xx AM)");
    harness.assert(solar.sunset.startsWith("08:"), "Sydney summer solstice sunset is late evening (~08:xx PM)");
  });

  await harness.test("T2-SOLAR-05: Leap Year February 29th Astronomical Handling", async () => {
    const leapDay = new Date("2028-02-29T12:00:00Z");
    const solar = calculateGoldenHour(40.7001, -73.985, leapDay, -5); // Brooklyn NY

    harness.assert(typeof solar.sunrise === "string", "Leap day sunrise calculated");
    harness.assert(typeof solar.sunset === "string", "Leap day sunset calculated");
    harness.assert(!solar.sunrise.includes("NaN"), "No NaN on Feb 29");
  });

  await harness.test("T2-SOLAR-06: Location Pin URL & Out-of-Bounds Coordinate Parser", async () => {
    const nullCoord = extractCoordinates(null);
    harness.assertEqual(nullCoord.lat, 40.7001, "Null defaults to Brooklyn lat");

    const textCoord = extractCoordinates("not a coordinate");
    harness.assertEqual(textCoord.lat, 40.7001, "Invalid text defaults to Brooklyn lat");

    const outOfBounds = extractCoordinates("?q=999.0,-999.0");
    harness.assertEqual(outOfBounds.lat, 40.7001, "Out-of-bounds coords default to Brooklyn lat");

    const validGmaps = extractCoordinates("https://maps.google.com/?q=3.1390,101.6869");
    harness.assertEqual(validGmaps.lat, 3.139, "Valid Google Maps URL parsed latitude");
    harness.assertEqual(validGmaps.lng, 101.6869, "Valid Google Maps URL parsed longitude");
  });
}
