/**
 * Tier 3: Cross-Feature Combinations & Canonical Client Journey Test Suite
 * Covers:
 * - Section A: 6 Pairwise Cross-Feature Combinations (T3-COMBO-01 to T3-COMBO-06)
 * - Section B: The Canonical 9-Step Full Lifecycle Client Journey (T3-JOURNEY-01)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { holdBookingSlot } from "@/lib/actions/booking";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { GET as downloadHandler } from "@/app/api/download/route";
import { acceptProposal } from "@/lib/actions/proposals";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";
import { generateWhatsAppCallSheetUrl, type CallSheetWithDetails } from "@/lib/whatsapp";
import {
  createGearItem,
  createKitBundle,
  checkBundleAvailability,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "@/lib/actions/gear";
import { createPrintOrder } from "@/lib/actions/visualizer";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";

export async function runTier3CrossFeatureTests(harness: TestHarness) {
  harness.setSuite("Tier 3", "Cross-Feature Combinations & Full Client Journey (7 Suites)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  harness.assert(luminaTenant !== null, "Lumina tenant resolved");
  harness.assert(apexTenant !== null, "Apex tenant resolved");

  const clientUser = await db.user.findFirst({ where: { role: "CLIENT" } });
  const leadUser = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: luminaTenant!.id } });
  harness.assert(clientUser !== null, "Client user resolved");
  harness.assert(leadUser !== null, "Studio lead user resolved");

  // ============================================================================
  // Section A: Pairwise Cross-Feature Combinations (6 Tests)
  // ============================================================================

  await harness.test("T3-COMBO-01: Booking Slot Hold × Multi-Mode Checkout (Instant Card vs QR Pending)", async () => {
    // 1. Slot S1: Card checkout -> instant BOOKED
    const slot1 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-09-01T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });

    const sess1 = `sess_card_${Date.now()}`;
    await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot1.id,
      sessionId: sess1,
    });

    const checkoutCard = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot1.id,
      sessionId: sess1,
      clientName: "Card Buyer",
      clientEmail: "card@buyer.com",
      clientPhone: "+15551112222",
      paymentMethod: "CARD",
    });

    harness.assert(checkoutCard.success === true, "Card checkout succeeded");
    harness.assertEqual(checkoutCard.status, "PAID", "Card invoice is immediately PAID");
    const updatedSlot1 = await db.bookingSlot.findUnique({ where: { id: slot1.id } });
    harness.assertEqual(updatedSlot1?.status, "BOOKED", "Slot 1 transitioned to BOOKED");
    harness.assertEqual(updatedSlot1?.heldBySessionId, null, "heldBySessionId cleared");

    // 2. Slot S2: QR Code checkout -> PENDING_VERIFICATION
    const slot2 = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-09-02T00:00:00.000Z"),
        startTime: "11:00",
        endTime: "12:00",
        category: "commercial",
        price: 500,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });

    const sess2 = `sess_qr_${Date.now()}`;
    await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot2.id,
      sessionId: sess2,
    });

    const checkoutQr = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot2.id,
      sessionId: sess2,
      clientName: "QR Buyer",
      clientEmail: "qr@buyer.com",
      clientPhone: "+15553334444",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/proof.jpg",
      paymentReference: "QR-SLIP-9900",
    });

    harness.assert(checkoutQr.success === true, "QR checkout submitted");
    harness.assertEqual(checkoutQr.status, "PENDING_VERIFICATION", "Invoice is PENDING_VERIFICATION");
    const updatedSlot2 = await db.bookingSlot.findUnique({ where: { id: slot2.id } });
    harness.assertEqual(updatedSlot2?.status, "PENDING_VERIFICATION", "Slot 2 transitioned to PENDING_VERIFICATION");

    // Clean up
    await db.clientBooking.deleteMany({ where: { slotId: { in: [slot1.id, slot2.id] } } });
    await db.milestoneInvoice.deleteMany({ where: { id: { in: [checkoutCard.invoiceId!, checkoutQr.invoiceId!] } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: [slot1.id, slot2.id] } } });
  });

  await harness.test("T3-COMBO-02: Manual Verification Console × Delivery Vault 50% Paywall", async () => {
    const project = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: clientUser!.id,
        studioLeadId: leadUser!.id,
        projectNumber: `PJ-COMBO2-${Date.now()}`,
        title: "Combo 2 Verification Paywall",
        discipline: "HYBRID",
        status: "POST_PRODUCTION",
        budget: 6000,
        isFinalBalancePaid: false,
      },
    });

    const deliverable = await db.clientDeliverable.create({
      data: {
        projectId: project.id,
        discipline: "PHOTOGRAPHY",
        title: "Master Campaign Photos",
      },
    });

    await db.deliverableItem.create({
      data: {
        deliverableId: deliverable.id,
        title: "Combo2_Photo_Master",
        itemType: "PHOTO",
        downloadUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
        previewUrl: "/uploads/deliverables/previews/lookbook_01.jpg",
      },
    });

    const invoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: clientUser!.id,
        projectId: project.id,
        invoiceNumber: `INV-COMBO2-${Date.now()}`,
        milestoneType: "FINAL_BALANCE_50",
        amount: 3000,
        dueDate: new Date(),
        status: "PENDING_VERIFICATION",
      },
    });

    // 1. Verify 403 Forbidden before approval
    const preReq = new NextRequest(`http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`);
    const preRes = await downloadHandler(preReq);
    harness.assertEqual(preRes.status, 403, "Master download is blocked before manual approval (403)");

    // 2. Studio Admin approves verification
    const approveRes = await approvePaymentVerification({
      invoiceId: invoice.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Operations Lead",
    });
    harness.assert(approveRes.success === true, "Payment verification approved");

    // 3. Verify paywall unlocked in database
    const updatedProject = await db.project.findUnique({ where: { id: project.id } });
    harness.assertEqual(updatedProject?.isFinalBalancePaid, true, "isFinalBalancePaid unlocked to true");

    // 4. Verify 200 OK after approval
    const postReq = new NextRequest(`http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`);
    const postRes = await downloadHandler(postReq);
    harness.assertEqual(postRes.status, 200, "Master download unlocked after approval (200 OK)");

    // Clean up
    await db.deliverableItem.deleteMany({ where: { deliverableId: deliverable.id } });
    await db.clientDeliverable.delete({ where: { id: deliverable.id } });
    await db.milestoneInvoice.delete({ where: { id: invoice.id } });
    await db.project.delete({ where: { id: project.id } });
  });

  await harness.test("T3-COMBO-03: Dynamic Proposal Builder × Retainer Invoicing × Project Provisioning", async () => {
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const prop = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: clientUser!.id,
        studioId: leadUser!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-COMBO3-${Date.now()}`,
        title: "Commercial Film Proposal with Add-Ons",
        basePrice: 5000,
        totalPrice: 5000,
        depositAmount: 2500,
        finalBalanceAmount: 2500,
        contractTerms: "Standard Production Terms",
        status: "SENT",
      },
    });

    const addOn1 = await db.proposalAddOn.create({
      data: {
        proposalId: prop.id,
        name: "Drone 4K Footage",
        description: "Cinema 4K Aerial Coverage",
        price: 500,
        unit: "fixed",
        isSelected: false,
      },
    });

    const addOn2 = await db.proposalAddOn.create({
      data: {
        proposalId: prop.id,
        name: "Lighting Truck Package",
        description: "Full Grip & Lighting Truck Package",
        price: 300,
        unit: "fixed",
        isSelected: false,
      },
    });

    // Accept selecting only Drone ($500) -> total: $5,500, retainer: $2,750
    const acceptRes = await acceptProposal({
      proposalId: prop.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "Elena Rostova",
      signerTitle: "Brand Director",
      consentAccepted: true,
      selectedAddOnIds: [addOn1.id],
    });

    harness.assert(acceptRes.success === true, "Proposal accepted");
    harness.assert(Boolean(acceptRes.projectId), "Linked project created");
    harness.assert(Boolean(acceptRes.invoiceId), "Retainer invoice generated");

    const updatedProp = await db.proposal.findUnique({ where: { id: prop.id } });
    harness.assertEqual(updatedProp?.status, "ACCEPTED", "Proposal status is ACCEPTED");
    harness.assertEqual(updatedProp?.totalPrice, 5500, "totalPrice updated to 5500");
    harness.assertEqual(updatedProp?.depositAmount, 2750, "depositAmount updated to 2750");

    const createdProject = await db.project.findUnique({ where: { id: acceptRes.projectId } });
    harness.assertEqual(createdProject?.status, "PRE_PRODUCTION", "Project status is PRE_PRODUCTION");
    harness.assertEqual(createdProject?.budget, 5500, "Project budget matches proposal total");
    harness.assertEqual(createdProject?.isFinalBalancePaid, false, "isFinalBalancePaid is false initially");

    const retainerInvoice = await db.milestoneInvoice.findUnique({ where: { id: acceptRes.invoiceId } });
    harness.assertEqual(retainerInvoice?.milestoneType, "RETAINER_50", "Milestone is RETAINER_50");
    harness.assertEqual(retainerInvoice?.amount, 2750, "Retainer invoice amount is exactly 2750");
    harness.assertEqual(retainerInvoice?.status, "PENDING", "Retainer status is PENDING");

    // Clean up
    await db.milestoneInvoice.deleteMany({ where: { proposalId: prop.id } });
    await db.project.deleteMany({ where: { proposalId: prop.id } });
    await db.proposalAddOn.deleteMany({ where: { proposalId: prop.id } });
    await db.proposal.delete({ where: { id: prop.id } });
  });

  await harness.test("T3-COMBO-04: Call Sheet Solar Engine × WhatsApp Dispatch URL Generator", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const callSheet = await db.callSheet.findFirst({
      where: { projectId: project!.id },
      include: {
        project: {
          include: {
            tenant: true,
          },
        },
      },
    });

    harness.assert(callSheet !== null, "Call sheet found");

    const coords = extractCoordinates(callSheet!.locationPinUrl);
    const solar = calculateGoldenHour(coords.lat, coords.lng, callSheet!.shootDate, -5);

    const enrichedCallSheet: CallSheetWithDetails = {
      ...(callSheet as CallSheetWithDetails),
      sunriseTime: solar.sunrise,
      sunsetTime: solar.sunset,
      goldenHourMorning: solar.goldenHourMorning,
      goldenHourEvening: solar.goldenHourEvening,
    };

    const waResult = generateWhatsAppCallSheetUrl(
      enrichedCallSheet,
      "+15559876543",
      "http://localhost:3000"
    );

    harness.assert(waResult.url.startsWith("https://wa.me/15559876543?text="), "WhatsApp URL formatted correctly");
    const decodedMessage = decodeURIComponent(waResult.url.split("?text=")[1] || "");
    harness.assert(decodedMessage.includes("OFFICIAL CALL SHEET"), "Message contains header");
    harness.assert(decodedMessage.includes(solar.sunrise), "Message embeds calculated sunrise");
    harness.assert(decodedMessage.includes(solar.sunset), "Message embeds calculated sunset");
    harness.assert(decodedMessage.includes(`/set-hud/${callSheet!.id}`), "Message embeds companion HUD link");
  });

  await harness.test("T3-COMBO-05: Kit Bundle BOM Availability × Pre/Post-Shoot Inspection Logs", async () => {
    const item = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "BOM Test Camera",
      sku: `BOM-CAM-${Date.now()}`,
      category: "Cameras",
      discipline: "VIDEOGRAPHY",
    });

    const bundle = await createKitBundle({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "BOM Test Kit Bundle",
      description: "Kit bundle for BOM inspection test",
      discipline: "VIDEOGRAPHY",
      dailyRate: 600,
      items: [{ itemId: item.item!.id, quantity: 1 }],
    });

    // 1. Initial check: Fully available
    const initAvail = await checkBundleAvailability(bundle.bundle!.id, luminaTenant!.id);
    harness.assertEqual(initAvail.isFullyAvailable, true, "Bundle is initially fully available");

    // 2. Reserve equipment for project
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.item!.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });

    // 3. Pre-shoot checkout
    await logPreShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId: res.reservation!.id,
      inspectorName: "Gear Supervisor",
      condition: "EXCELLENT",
    });

    // 4. Post-shoot check-in with DAMAGE
    await logPostShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId: res.reservation!.id,
      inspectorName: "Gear Supervisor",
      condition: "DAMAGED",
      damageFlag: true,
      notes: "Dropped on shoot",
    });

    const updatedItem = await db.inventoryItem.findUnique({ where: { id: item.item!.id } });
    harness.assertEqual(updatedItem?.status, "MAINTENANCE", "Item quarantined to MAINTENANCE");
    harness.assertEqual(updatedItem?.condition, "DAMAGED", "Item condition marked DAMAGED");

    // 5. Subsequent BOM check: Not available!
    const postAvail = await checkBundleAvailability(bundle.bundle!.id, luminaTenant!.id);
    harness.assertEqual(postAvail.isFullyAvailable, false, "Bundle is now unavailable due to damaged item");
    harness.assertEqual(postAvail.conflictingItems.length, 1, "Conflicting items contains 1 damaged item");

    // Clean up
    await db.inspectionLog.deleteMany({ where: { reservationId: res.reservation!.id } });
    await db.equipmentReservation.deleteMany({ where: { id: res.reservation!.id } });
    await db.kitBundleItem.deleteMany({ where: { bundleId: bundle.bundle!.id } });
    await db.kitBundle.delete({ where: { id: bundle.bundle!.id } });
    await db.inventoryItem.delete({ where: { id: item.item!.id } });
  });

  await harness.test("T3-COMBO-06: Interactive Wall Visualizer × 1-Click Print Order Invoicing × Checkout", async () => {
    const size = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    const frame = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });

    const orderRes = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      printSizeId: size!.id,
      frameDesignId: frame!.id,
      matBoardType: "WHITE_2INCH",
      orientation: "PORTRAIT",
      photoUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      photoTitle: "Wall Art Masterpiece",
      clientName: "Art Collector",
      clientEmail: "collector@example.com",
    });

    harness.assert(orderRes.success === true, "createPrintOrder succeeded");
    harness.assert(Boolean(orderRes.invoiceId), "Invoice created for print order");
    harness.assert(Boolean(orderRes.checkoutUrl), "Checkout redirect URL returned");

    const expectedTotal = size!.basePrice + frame!.priceOffset + 25;
    const invoice = await db.milestoneInvoice.findUnique({ where: { id: orderRes.invoiceId } });
    harness.assertEqual(invoice?.amount, expectedTotal, "Total price equals printPrice + frameOffset + matFee");
    harness.assertEqual(invoice?.milestoneType, "PRINT_FRAME_ORDER", "milestoneType is PRINT_FRAME_ORDER");

    // Pay invoice via Card
    const payRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: invoice!.id,
      paymentMethod: "CARD",
    });

    harness.assert(payRes.success === true, "Invoice payment succeeded");
    const settledInvoice = await db.milestoneInvoice.findUnique({ where: { id: invoice!.id } });
    harness.assertEqual(settledInvoice?.status, "PAID", "Invoice status is PAID");

    // Clean up
    await db.milestoneInvoice.delete({ where: { id: invoice!.id } });
  });

  // ============================================================================
  // Section B: The Canonical 9-Step Full Lifecycle Client Journey (1 Master Test)
  // ============================================================================

  await harness.test("T3-JOURNEY-01: Canonical 9-Step Full Lifecycle Client Journey (Lumina Flagship)", async () => {
    // --------------------------------------------------------------------------
    // Step 1: Showcase & Slot Hold
    // --------------------------------------------------------------------------
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-10-01T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "10:30",
        category: "commercial",
        campaignTitle: "Flagship Brand Production",
        price: 2500,
        depositRequired: 1000,
        status: "AVAILABLE",
      },
    });

    const clientSessionId = `sess_flagship_${Date.now()}`;
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: clientSessionId,
    });
    harness.assert(holdRes.success === true, "Step 1: Slot held successfully");
    const heldSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(heldSlot?.status, "HELD", "Step 1: Slot status is HELD");

    // --------------------------------------------------------------------------
    // Step 2: Slot Checkout via Studio QR Slip Upload
    // --------------------------------------------------------------------------
    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: clientSessionId,
      clientName: "Julian Sterling",
      clientEmail: "julian@sterlingmedia.com",
      clientPhone: "+15557778899",
      creativeBrief: "Flagship global commercial campaign shoot",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/chase_wire_9921.jpg",
      paymentReference: "CHASE-WIRE-9921",
    });

    harness.assert(checkoutRes.success === true, "Step 2: QR checkout submitted");
    harness.assertEqual(checkoutRes.status, "PENDING_VERIFICATION", "Step 2: Invoice status is PENDING_VERIFICATION");
    const pendingSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(pendingSlot?.status, "PENDING_VERIFICATION", "Step 2: Slot status is PENDING_VERIFICATION");

    // --------------------------------------------------------------------------
    // Step 3: Studio Admin Payment Verification Approval
    // --------------------------------------------------------------------------
    const approveRes = await approvePaymentVerification({
      invoiceId: checkoutRes.invoiceId!,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Studio Admin Director",
      notes: "Verified Chase wire receipt against studio bank balance.",
    });

    harness.assert(approveRes.success === true, "Step 3: Admin approved payment verification");
    const depositInvoice = await db.milestoneInvoice.findUnique({ where: { id: checkoutRes.invoiceId } });
    harness.assertEqual(depositInvoice?.status, "PAID", "Step 3: Deposit invoice marked PAID");
    const bookedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(bookedSlot?.status, "BOOKED", "Step 3: Slot status is permanently BOOKED");

    // --------------------------------------------------------------------------
    // Step 4: Dynamic Proposal Builder Add-On Toggling & Signature Acceptance
    // --------------------------------------------------------------------------
    const dummySig =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const proposal = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: clientUser!.id,
        studioId: leadUser!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-JOURNEY-${Date.now()}`,
        title: "Sterling Media Brand Campaign",
        basePrice: 6000,
        totalPrice: 6000,
        depositAmount: 3000,
        finalBalanceAmount: 3000,
        contractTerms: "Master Production Agreement",
        status: "SENT",
      },
    });

    const droneAddOn = await db.proposalAddOn.create({
      data: {
        proposalId: proposal.id,
        name: "4K Cinema Drone Coverage",
        description: "Cinematic aerial coverage with licensed pilot",
        price: 800,
        unit: "fixed",
        isSelected: false,
      },
    });

    const acceptRes = await acceptProposal({
      proposalId: proposal.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySig,
      signerName: "Julian Sterling",
      signerTitle: "CEO",
      consentAccepted: true,
      selectedAddOnIds: [droneAddOn.id],
    });

    harness.assert(acceptRes.success === true, "Step 4: Proposal accepted with digital signature");
    const journeyProjectId = acceptRes.projectId!;
    const journeyRetainerInvoiceId = acceptRes.invoiceId!;

    const acceptedProp = await db.proposal.findUnique({ where: { id: proposal.id } });
    harness.assertEqual(acceptedProp?.totalPrice, 6800, "Step 4: Proposal total dynamically updated to $6,800");

    // --------------------------------------------------------------------------
    // Step 5: Retainer Milestone Invoice Generation & Settlement
    // --------------------------------------------------------------------------
    const payRetainerRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: journeyRetainerInvoiceId,
      paymentMethod: "CARD",
    });

    harness.assert(payRetainerRes.success === true, "Step 5: Retainer paid via Card");
    const paidRetainer = await db.milestoneInvoice.findUnique({ where: { id: journeyRetainerInvoiceId } });
    harness.assertEqual(paidRetainer?.status, "PAID", "Step 5: Retainer invoice status is PAID");

    // --------------------------------------------------------------------------
    // Step 6: Delivery Vault Watermarked Review & Paywall Enforcement
    // --------------------------------------------------------------------------
    const deliverable = await db.clientDeliverable.create({
      data: {
        projectId: journeyProjectId,
        discipline: "HYBRID",
        title: "Master Campaign Deliverables",
      },
    });

    const photoItem = await db.deliverableItem.create({
      data: {
        deliverableId: deliverable.id,
        title: "Hero_Lookbook_01",
        itemType: "PHOTO",
        downloadUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
        previewUrl: "/uploads/deliverables/previews/lookbook_01.jpg",
      },
    });

    // Client hearts photo and submits retouch note
    const favRes = await toggleClientFavorite({ itemId: photoItem.id, isFav: true });
    harness.assert(favRes.success === true, "Step 6: Favorite toggled");

    const noteRes = await submitRetouchNote({
      itemId: photoItem.id,
      note: "Slightly increase warm tone in hair rim light",
    });
    harness.assert(noteRes.success === true, "Step 6: Retouch note submitted");

    // Direct download is strictly blocked
    const paywallReq = new NextRequest(`http://localhost:3000/api/download?projectId=${journeyProjectId}&type=photo_zip`);
    const paywallRes = await downloadHandler(paywallReq);
    harness.assertEqual(paywallRes.status, 403, "Step 6: Master download is strictly paywalled (403 Forbidden)");

    // --------------------------------------------------------------------------
    // Step 7: 50% Final Balance Settlement
    // --------------------------------------------------------------------------
    const finalInvoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: clientUser!.id,
        projectId: journeyProjectId,
        invoiceNumber: `INV-FINAL-${Date.now()}`,
        milestoneType: "FINAL_BALANCE_50",
        amount: 3400,
        dueDate: new Date(),
        status: "PENDING",
      },
    });

    const payFinalRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: finalInvoice.id,
      paymentMethod: "CARD",
    });

    harness.assert(payFinalRes.success === true, "Step 7: Final balance paid via Card");
    harness.assertEqual(payFinalRes.unlockedDownloads, true, "Step 7: unlockedDownloads returned true");
    const finalProject = await db.project.findUnique({ where: { id: journeyProjectId } });
    harness.assertEqual(finalProject?.isFinalBalancePaid, true, "Step 7: Project.isFinalBalancePaid is now true");

    // --------------------------------------------------------------------------
    // Step 8: Master Deliverables Instant Unlock (PKZIP Binary Validated)
    // --------------------------------------------------------------------------
    const unlockReq = new NextRequest(`http://localhost:3000/api/download?projectId=${journeyProjectId}&type=photo_zip`);
    const unlockRes = await downloadHandler(unlockReq);
    harness.assertEqual(unlockRes.status, 200, "Step 8: Master ZIP download returns 200 OK");
    harness.assertEqual(unlockRes.headers.get("content-type"), "application/zip", "Step 8: Content-Type is application/zip");

    const zipBuffer = await unlockRes.arrayBuffer();
    const zipBytes = new Uint8Array(zipBuffer);
    harness.assert(
      zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04,
      "Step 8: Buffer matches PKZIP magic signature (0x50, 0x4B, 0x03, 0x04)"
    );

    // --------------------------------------------------------------------------
    // Step 9: Interactive Wall Visualizer 1-Click Archival Framed Print Order
    // --------------------------------------------------------------------------
    const printSize = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    const frameDesign = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });

    const printOrderRes = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: journeyProjectId,
      printSizeId: printSize!.id,
      frameDesignId: frameDesign!.id,
      matBoardType: "WHITE_2INCH",
      orientation: "PORTRAIT",
      photoUrl: photoItem.downloadUrl,
      photoTitle: "Julian Sterling Executive Portrait",
      clientName: "Julian Sterling",
      clientEmail: "julian@sterlingmedia.com",
    });

    harness.assert(printOrderRes.success === true, "Step 9: Wall visualizer 1-click order placed");
    harness.assert(Boolean(printOrderRes.invoiceId), "Step 9: PRINT_FRAME_ORDER invoice generated");

    const printInvoice = await db.milestoneInvoice.findUnique({ where: { id: printOrderRes.invoiceId } });
    harness.assertEqual(printInvoice?.milestoneType, "PRINT_FRAME_ORDER", "Step 9: milestoneType is PRINT_FRAME_ORDER");

    const payPrintRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: printInvoice!.id,
      paymentMethod: "CARD",
    });
    harness.assert(payPrintRes.success === true, "Step 9: Archival print order paid via Card");

    const finalPrintInv = await db.milestoneInvoice.findUnique({ where: { id: printInvoice!.id } });
    harness.assertEqual(finalPrintInv?.status, "PAID", "Step 9: Archival print invoice marked PAID");

    // Clean up
    await db.milestoneInvoice.delete({ where: { id: printInvoice!.id } });
    await db.deliverableItem.deleteMany({ where: { deliverableId: deliverable.id } });
    await db.clientDeliverable.delete({ where: { id: deliverable.id } });
    await db.milestoneInvoice.delete({ where: { id: finalInvoice.id } });
    await db.milestoneInvoice.delete({ where: { id: journeyRetainerInvoiceId } });
    await db.project.delete({ where: { id: journeyProjectId } });
    await db.proposalAddOn.deleteMany({ where: { proposalId: proposal.id } });
    await db.proposal.delete({ where: { id: proposal.id } });
    await db.clientBooking.deleteMany({ where: { slotId: slot.id } });
    await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId! } });
    await db.bookingSlot.delete({ where: { id: slot.id } });
  });
}
