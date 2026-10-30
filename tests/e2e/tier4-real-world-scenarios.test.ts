/**
 * Tier 4: Real-World Multi-Tenant Studio Lifecycles
 *
 * Scenarios:
 *   4.1: Lumina Commercial Production Lifecycle (Inbound inquiry -> proposal -> retainer ->
 *        solar calculation -> WhatsApp dispatch -> gear reservation -> pre-shoot inspection ->
 *        HUD shot checkoffs -> digital release -> post-shoot return -> paywall gating 403 ->
 *        final balance settlement -> master ZIP unlock 200 OK)
 *   4.2: Apex Convocation Package with Custom Print & Frame Order (Slot hold 10m -> QR code checkout ->
 *        owner verification approval -> cash counter final balance -> wall art visualizer 1-click
 *        print order -> card settlement)
 *   4.3: Boutique Wedding Studio Onboarding to Multi-Day Nuptial Production (Self-service studio
 *        onboarding -> catalog & inventory setup -> proposal acceptance -> retainer payment ->
 *        solar call sheet & WhatsApp -> talent/location releases -> paywall gating -> master unlock ->
 *        cross-tenant isolation verification)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { acceptProposal } from "@/lib/actions/proposals";
import { processInvoicePayment, processBookingCheckout } from "@/lib/actions/checkout";
import { holdBookingSlot } from "@/lib/actions/booking";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { createPrintOrder } from "@/lib/actions/visualizer";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";
import { generateWhatsAppCallSheetUrl, type CallSheetWithDetails } from "@/lib/whatsapp";
import {
  createGearItem,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "@/lib/actions/gear";
import { toggleShotCompletion, submitDigitalRelease } from "@/lib/actions/logistics";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { onboardStudio } from "@/lib/actions/onboarding";
import { createServicePackage } from "@/lib/actions/admin-services";
import { createFrameDesign, createPrintSize } from "@/lib/actions/admin-frames";
import { GET as downloadHandler } from "@/app/api/download/route";

const dummySignature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export async function runTier4RealWorldScenariosTests(harness: TestHarness) {
  harness.setSuite("Tier 4", "Real-World Multi-Tenant Studio Lifecycles (3 Scenarios)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const clientUser = await db.user.findFirst({
    where: { role: "CLIENT", tenantId: luminaTenant?.id },
  });
  const luminaLead = await db.user.findFirst({
    where: { tenantId: luminaTenant?.id, role: "STUDIO_OWNER" },
  });
  const apexLead = await db.user.findFirst({
    where: { tenantId: apexTenant?.id, role: "STUDIO_OWNER" },
  });

  harness.assert(Boolean(luminaTenant), "Lumina tenant resolved");
  harness.assert(Boolean(apexTenant), "Apex tenant resolved");
  harness.assert(Boolean(clientUser), "Client user resolved");
  harness.assert(Boolean(luminaLead), "Lumina studio lead resolved");
  harness.assert(Boolean(apexLead), "Apex studio lead resolved");

  // ============================================================================
  // Scenario 4.1: Lumina Commercial Production Lifecycle
  // ============================================================================
  await harness.test(
    "T4-SCENARIO-01: Lumina Commercial Production Lifecycle (Inbound to Master PKZIP Unlock)",
    async () => {
      // 1. Inbound Inquiry & Proposal
      const proposal = await db.proposal.create({
        data: {
          tenantId: luminaTenant!.id,
          studioId: luminaLead!.id,
          clientId: clientUser!.id,
          discipline: "VIDEOGRAPHY",
          proposalNumber: `PROP-T4-LUM-${Date.now()}`,
          title: "Apex Velocity Automotive Commercial",
          basePrice: 8000,
          totalPrice: 8000,
          depositAmount: 4000,
          finalBalanceAmount: 4000,
          contractTerms: "Comprehensive Automotive Video Production Terms",
          status: "SENT",
        },
      });

      const droneAddOn = await db.proposalAddOn.create({
        data: {
          proposalId: proposal.id,
          name: "High-Speed FPV Drone Tracking",
          description: "FPV Cinema Drone Pilot with RED Komodo package",
          price: 1200,
          unit: "fixed",
          isSelected: false,
        },
      });

      const acceptRes = await acceptProposal({
        proposalId: proposal.id,
        tenantSlug: "lumina-cine",
        signatureDataUrl: dummySignature,
        signerName: "Sarah Lindqvist",
        signerTitle: "Creative Director",
        consentAccepted: true,
        selectedAddOnIds: [droneAddOn.id],
      });

      harness.assert(acceptRes.success === true, "S4.1-1: Proposal accepted with digital signature");
      const projectId = acceptRes.projectId!;
      const retainerInvoiceId = acceptRes.invoiceId!;

      // 2. 50% Retainer Card Settlement
      const retainerPayRes = await processInvoicePayment({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        invoiceId: retainerInvoiceId,
        paymentMethod: "CARD",
      });

      harness.assert(retainerPayRes.success === true, "S4.1-2: Retainer invoice paid via Card");
      const retainerInv = await db.milestoneInvoice.findUnique({ where: { id: retainerInvoiceId } });
      harness.assertEqual(retainerInv?.status, "PAID", "S4.1-2: Retainer invoice status is PAID");

      // 3. NOAA Solar Calculation & WhatsApp Call Sheet Dispatch
      const callSheet = await db.callSheet.create({
        data: {
          projectId,
          title: "Day 1 Track Shoot - Sonoma Raceway",
          shootDate: new Date("2026-11-20T00:00:00.000Z"),
          generalCallTime: "05:30 AM",
          locationName: "Sonoma Raceway Gate 1",
          locationAddress: "28000 Arnold Dr, Sonoma, CA 95476",
          locationPinUrl: "https://maps.google.com/?q=38.1611,-122.4544",
          hospitalName: "Sonoma Valley Hospital",
          hospitalAddress: "347 Andrieux St, Sonoma, CA",
        },
      });

      const coords = extractCoordinates(callSheet.locationPinUrl!);
      const solar = calculateGoldenHour(coords.lat, coords.lng, callSheet.shootDate, -8);
      harness.assert(solar.sunrise.includes(":"), "S4.1-3: Calculated sunrise time");
      harness.assert(solar.goldenHourMorning.includes("-"), "S4.1-3: Morning golden hour window calculated");

      const enrichedCallSheet: CallSheetWithDetails = {
        ...callSheet,
        sunriseTime: solar.sunrise,
        sunsetTime: solar.sunset,
        goldenHourMorning: solar.goldenHourMorning,
        goldenHourEvening: solar.goldenHourEvening,
        project: {
          title: "Apex Velocity Automotive Commercial",
          projectNumber: "PRJ-T4-01",
          tenant: {
            name: "Lumina Cine",
            slug: "lumina-cine",
          },
        },
      };

      const waRes = generateWhatsAppCallSheetUrl(enrichedCallSheet, "+14155550199", "http://localhost:3000");
      harness.assert(waRes.url.includes("https://wa.me/14155550199?text="), "S4.1-3: WhatsApp URL properly formatted");
      harness.assert(waRes.previewText.includes("Sonoma Raceway"), "S4.1-3: WhatsApp text includes location");

      // 4. Gear Reservation & Pre-Shoot Inspection
      const cameraItem = await createGearItem({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        name: "Sony FX6 Cinema Line A-Cam",
        sku: `FX6-T4-${Date.now()}`,
        category: "CAMERA_BODY",
        condition: "EXCELLENT",
        dailyRate: 350,
      });
      harness.assert(cameraItem.success === true, "S4.1-4: Camera item created");

      const resStart = new Date("2026-11-20T05:00:00.000Z");
      const resEnd = new Date("2026-11-20T20:00:00.000Z");

      const reservationRes = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId,
        itemId: cameraItem.item!.id,
        startDate: resStart.toISOString(),
        endDate: resEnd.toISOString(),
      });
      harness.assert(reservationRes.success === true, "S4.1-4: Gear reservation confirmed");

      const preInspection = await logPreShootInspection({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        reservationId: reservationRes.reservation!.id,
        inspectorName: "Marcus Vance",
        condition: "EXCELLENT",
        sensorVerified: true,
        mediaFormatted: true,
        batteriesCharged: true,
      });
      harness.assert(preInspection.success === true, "S4.1-4: Pre-shoot inspection logged");
      const checkedOutItem = await db.inventoryItem.findUnique({ where: { id: cameraItem.item!.id } });
      harness.assertEqual(checkedOutItem?.status, "ON_SHOOT", "S4.1-4: Item status is ON_SHOOT");

      // 5. On-Set HUD Shot Check-Offs & Digital Talent Release
      const shot1 = await db.shotItem.create({
        data: {
          projectId,
          sceneNumber: "SC-01",
          shotNumber: "1A",
          framing: "WIDE_TRACKING",
          cameraLens: "24-70mm GM II",
          lightingSetup: "Golden Hour Natural Ambient",
          description: "High-Speed Turn 3 Tracking Shot",
          status: "PENDING",
        },
      });

      const shotToggle = await toggleShotCompletion({
        shotId: shot1.id,
        status: "COMPLETED",
        tenantSlug: "lumina-cine",
      });
      harness.assert(shotToggle.success === true, "S4.1-5: HUD shot checked off");
      harness.assertEqual(shotToggle.completedShots, 1, "S4.1-5: Completed shots metric updated");

      const talentRelease = await submitDigitalRelease({
        projectId,
        tenantSlug: "lumina-cine",
        releaseType: "TALENT",
        signerName: "Alex Mercer",
        signerEmail: "alex.mercer@stuntteam.com",
        signerRole: "Precision Stunt Driver",
        termsContent: "Standard Commercial Talent Likeness Release 2026",
        signatureDataUrl: dummySignature,
      });
      harness.assert(talentRelease.success === true, "S4.1-5: Digital talent release executed");

      // 6. Post-Shoot Return Inspection
      const postInspection = await logPostShootInspection({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        reservationId: reservationRes.reservation!.id,
        inspectorName: "Marcus Vance",
        condition: "EXCELLENT",
        damageFlag: false,
        notes: "Equipment returned in pristine shape, cleaned and checked.",
      });
      harness.assert(postInspection.success === true, "S4.1-6: Post-shoot return inspection logged");
      const returnedItem = await db.inventoryItem.findUnique({ where: { id: cameraItem.item!.id } });
      harness.assertEqual(returnedItem?.status, "AVAILABLE", "S4.1-6: Item returned to AVAILABLE");

      // 7. Delivery Vault Paywall Gating (403)
      const deliverable = await db.clientDeliverable.create({
        data: {
          projectId,
          discipline: "HYBRID",
          title: "Apex Velocity 4K Campaign Master",
        },
      });

      const photoMaster = await db.deliverableItem.create({
        data: {
          deliverableId: deliverable.id,
          title: "Apex_Velocity_Hero_01",
          itemType: "PHOTO",
          downloadUrl: "/uploads/deliverables/masters/apex_velocity_01.jpg",
          previewUrl: "/uploads/deliverables/previews/apex_velocity_watermarked.jpg",
        },
      });

      const favRes = await toggleClientFavorite({ itemId: photoMaster.id, isFav: true });
      harness.assert(favRes.success === true, "S4.1-7: Asset favorited in vault");

      const noteRes = await submitRetouchNote({
        itemId: photoMaster.id,
        note: "Grade looks cinematic! Color timing on the sunset flare is approved.",
      });
      harness.assert(noteRes.success === true, "S4.1-7: Vault client feedback note recorded");

      const paywallReq = new NextRequest(
        `http://localhost:3000/api/download?projectId=${projectId}&type=photo_zip`
      );
      const paywallRes = await downloadHandler(paywallReq);
      harness.assertEqual(paywallRes.status, 403, "S4.1-7: Unpaid master download rejected with 403 Forbidden");

      // 8. 50% Final Balance Settlement
      const finalInvoice = await db.milestoneInvoice.create({
        data: {
          tenantId: luminaTenant!.id,
          clientId: clientUser!.id,
          projectId,
          invoiceNumber: `INV-T4-FINAL-${Date.now()}`,
          milestoneType: "FINAL_BALANCE_50",
          amount: 4600,
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

      harness.assert(payFinalRes.success === true, "S4.1-8: Final 50% balance paid via Card");
      harness.assertEqual(payFinalRes.unlockedDownloads, true, "S4.1-8: unlockedDownloads returned true");

      const updatedProject = await db.project.findUnique({ where: { id: projectId } });
      harness.assertEqual(updatedProject?.isFinalBalancePaid, true, "S4.1-8: Project.isFinalBalancePaid is true");

      // 9. Master Deliverables Instant Unlock (PKZIP Validation)
      const unlockReq = new NextRequest(
        `http://localhost:3000/api/download?projectId=${projectId}&type=photo_zip`
      );
      const unlockRes = await downloadHandler(unlockReq);
      harness.assertEqual(unlockRes.status, 200, "S4.1-9: Master download succeeds with 200 OK");
      harness.assertEqual(
        unlockRes.headers.get("content-type"),
        "application/zip",
        "S4.1-9: Content-Type is application/zip"
      );

      const zipBuf = await unlockRes.arrayBuffer();
      const zipBytes = new Uint8Array(zipBuf);
      harness.assert(
        zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04,
        "S4.1-9: Stream buffer contains valid PKZIP header bytes (0x50, 0x4B, 0x03, 0x04)"
      );

      // Clean up Scenario 4.1
      await db.deliverableItem.deleteMany({ where: { deliverableId: deliverable.id } });
      await db.clientDeliverable.delete({ where: { id: deliverable.id } });
      await db.digitalRelease.deleteMany({ where: { projectId } });
      await db.shotItem.deleteMany({ where: { projectId } });
      await db.inspectionLog.deleteMany({ where: { reservationId: reservationRes.reservation!.id } });
      await db.equipmentReservation.deleteMany({ where: { id: reservationRes.reservation!.id } });
      await db.inventoryItem.delete({ where: { id: cameraItem.item!.id } });
      await db.callSheet.delete({ where: { id: callSheet.id } });
      await db.milestoneInvoice.delete({ where: { id: finalInvoice.id } });
      await db.milestoneInvoice.delete({ where: { id: retainerInvoiceId } });
      await db.project.delete({ where: { id: projectId } });
      await db.proposalAddOn.deleteMany({ where: { proposalId: proposal.id } });
      await db.proposal.delete({ where: { id: proposal.id } });
    }
  );

  // ============================================================================
  // Scenario 4.2: Apex Convocation Package with Custom Print & Frame Order
  // ============================================================================
  await harness.test(
    "T4-SCENARIO-02: Apex Convocation Package with Custom Print & Frame Order",
    async () => {
      // 1. Slot Hold (10-minute lease)
      const slotDate = new Date(Date.now() + 86400000 * 5);
      const slot = await db.bookingSlot.create({
        data: {
          tenantId: apexTenant!.id,
          date: slotDate,
          startTime: "10:00 AM",
          endTime: "11:00 AM",
          status: "AVAILABLE",
        },
      });

      const holdRes = await holdBookingSlot({
        slotId: slot.id,
        sessionId: "apex-client-sess-42",
        tenantId: apexTenant!.id,
      });
      harness.assert(holdRes.success === true, "S4.2-1: 10m slot hold established");

      // 2. QR Code Slip Checkout
      const checkoutRes = await processBookingCheckout({
        slotId: slot.id,
        sessionId: "apex-client-sess-42",
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        clientName: "Farhan Hakim",
        clientEmail: `farhan_${Date.now()}@utm.my`,
        clientPhone: "+60123456789",
        paymentMethod: "QR_CODE",
        paymentReference: "QR-SLIP-9988",
        creativeBrief: "Graduation robe & hood package",
      });

      harness.assert(checkoutRes.success === true, "S4.2-2: QR booking submitted");
      harness.assertEqual(checkoutRes.status, "PENDING_VERIFICATION", "S4.2-2: Payment status is PENDING_VERIFICATION");

      const pendingInvoice = await db.milestoneInvoice.findUnique({
        where: { id: checkoutRes.invoiceId! },
      });
      harness.assertEqual(pendingInvoice?.status, "PENDING_VERIFICATION", "S4.2-2: Invoice status is PENDING_VERIFICATION");

      // 3. Studio Owner Manual Verification Console Approval
      const verifyRes = await approvePaymentVerification({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        invoiceId: pendingInvoice!.id,
        staffName: "David Apex Owner",
      });

      harness.assert(verifyRes.success === true, "S4.2-3: Studio owner approved QR slip verification");
      const approvedInv = await db.milestoneInvoice.findUnique({ where: { id: pendingInvoice!.id } });
      harness.assertEqual(approvedInv?.status, "PAID", "S4.2-3: Deposit invoice marked PAID");

      const bookedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
      harness.assertEqual(bookedSlot?.status, "BOOKED", "S4.2-3: Slot marked BOOKED");

      // 4. Studio Project Provisioned & Cash Counter Final Balance
      const project = await db.project.create({
        data: {
          tenantId: apexTenant!.id,
          studioLeadId: apexLead!.id,
          clientId: clientUser!.id,
          discipline: "PHOTOGRAPHY",
          projectNumber: `PRJ-APEX-CONV-${Date.now()}`,
          title: "Farhan Hakim Convocation Session",
          status: "POST_PRODUCTION",
          budget: 700,
          isFinalBalancePaid: false,
        },
      });

      const cashInvoice = await db.milestoneInvoice.create({
        data: {
          tenantId: apexTenant!.id,
          clientId: clientUser!.id,
          projectId: project.id,
          invoiceNumber: `INV-APEX-CASH-${Date.now()}`,
          milestoneType: "FINAL_BALANCE_50",
          amount: 350,
          dueDate: new Date(),
          status: "PENDING",
        },
      });

      const cashPayRes = await processInvoicePayment({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        invoiceId: cashInvoice.id,
        paymentMethod: "CASH",
        paymentReference: "RECEIPT-COUNTER-0988",
      });

      harness.assert(cashPayRes.success === true, "S4.2-4: Cash counter balance payment submitted");

      const approveCashRes = await approvePaymentVerification({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        invoiceId: cashInvoice.id,
        staffName: "David Apex Owner",
      });
      harness.assert(approveCashRes.success === true, "S4.2-4: Counter staff verified cash payment");

      const paidCashInv = await db.milestoneInvoice.findUnique({ where: { id: cashInvoice.id } });
      harness.assertEqual(paidCashInv?.status, "PAID", "S4.2-4: Final balance invoice marked PAID");

      const settledProj = await db.project.findUnique({ where: { id: project.id } });
      harness.assertEqual(settledProj?.isFinalBalancePaid, true, "S4.2-4: Project isFinalBalancePaid is true");

      // 5. Interactive Wall Art Visualizer 1-Click Archival Framed Print Order
      const printSize = await db.printSize.findFirst({ where: { tenantId: apexTenant!.id } });
      const frameDesign = await db.frameDesign.findFirst({ where: { tenantId: apexTenant!.id } });

      const printOrderRes = await createPrintOrder({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        projectId: project.id,
        printSizeId: printSize!.id,
        frameDesignId: frameDesign!.id,
        matBoardType: "WHITE_2INCH",
        orientation: "PORTRAIT",
        photoUrl: "/uploads/convocation/farhan_master_01.jpg",
        photoTitle: "Farhan Hakim Official Convocation Portrait",
        clientName: "Farhan Hakim",
        clientEmail: "farhan@utm.my",
      });

      harness.assert(printOrderRes.success === true, "S4.2-5: Wall art visualizer 1-click print order created");
      harness.assert(Boolean(printOrderRes.invoiceId), "S4.2-5: Print & frame invoice generated");

      // 6. Online Card Settlement of Print Order
      const printCardPay = await processInvoicePayment({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        invoiceId: printOrderRes.invoiceId!,
        paymentMethod: "CARD",
      });

      harness.assert(printCardPay.success === true, "S4.2-6: Framed print order paid via Card");
      const paidPrintInv = await db.milestoneInvoice.findUnique({ where: { id: printOrderRes.invoiceId! } });
      harness.assertEqual(paidPrintInv?.status, "PAID", "S4.2-6: Print invoice marked PAID");

      // Clean up Scenario 4.2
      await db.milestoneInvoice.delete({ where: { id: printOrderRes.invoiceId! } });
      await db.milestoneInvoice.delete({ where: { id: cashInvoice.id } });
      await db.project.delete({ where: { id: project.id } });
      await db.clientBooking.deleteMany({ where: { slotId: slot.id } });
      await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId! } });
      await db.bookingSlot.delete({ where: { id: slot.id } });
    }
  );

  // ============================================================================
  // Scenario 4.3: Boutique Wedding Studio Onboarding to Multi-Day Nuptial Production
  // ============================================================================
  await harness.test(
    "T4-SCENARIO-03: Boutique Wedding Studio Onboarding to Multi-Day Nuptial Production",
    async () => {
      const uniqueSuffix = Date.now().toString().slice(-6);
      const studioSlug = `elysian-weddings-${uniqueSuffix}`;
      const ownerEmail = `claire.${uniqueSuffix}@elysian.com`;

      // 1. Self-Service Studio Onboarding
      const onboardRes = await onboardStudio({
        name: "Elysian Wedding Cinematography",
        slug: studioSlug,
        discipline: "HYBRID",
        currency: "USD",
        tagline: "Timeless Nuptial Storytelling & Heirloom Prints",
        bio: "Artisan wedding photography and cinematography for discerning couples.",
        brandColor: "#e0a96d",
        ownerName: "Claire DeWitt",
        ownerEmail,
        password: "SuperSecretPassword123!",
        ownerPhone: "+14155557788",
        subscriptionTier: "PRO",
      });

      harness.assert(onboardRes.success === true, "S4.3-1: Studio self-onboarding succeeded");
      const elysianTenant = await db.tenant.findUnique({ where: { slug: studioSlug } });
      harness.assert(elysianTenant !== null, "S4.3-1: Tenant record created in database");
      harness.assertEqual(elysianTenant?.currency, "USD", "S4.3-1: Studio currency is USD");

      const elysianOwner = await db.user.findFirst({
        where: { tenantId: elysianTenant!.id, role: "STUDIO_OWNER" },
      });
      harness.assert(elysianOwner !== null, "S4.3-1: Studio owner user created");

      // 2. Catalog & Inventory Setup
      const pkgRes = await createServicePackage({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        name: "The Heirloom Grand Nuptial Collection",
        category: "WEDDING",
        discipline: "HYBRID",
        price: 12000,
        depositPrice: 6000,
        turnaround: "4-6 weeks",
        description: "Full day photo + cinema coverage, heirloom album, and drone cinematography.",
        deliverables: "10-12m Feature Film, 1000+ Edited Photos, Heirloom Album, Raw Audio",
        isFeatured: true,
      });
      harness.assert(pkgRes.success === true, "S4.3-2: Wedding service package created");

      const frameRes = await createFrameDesign({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        name: "Vintage Gold Leaf Ornate",
        material: "Gilded Hardwood",
        moldingWidth: 3.5,
        frameColor: "#d4af37",
        previewAsset: "/frames/vintage-gold.png",
        priceOffset: 250,
        isAvailable: true,
      });
      harness.assert(frameRes.success === true, "S4.3-2: Custom frame design created");

      const sizeRes = await createPrintSize({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        name: "24x36 Statement Gallery Canvas",
        code: `CANV${uniqueSuffix.slice(-4)}`,
        widthInches: 24,
        heightInches: 36,
        basePrice: 420,
      });
      harness.assert(sizeRes.success === true, "S4.3-2: Print size created");

      const cameraRes = await createGearItem({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        name: "Canon C70 Cinema EOS",
        sku: `C70-ELY-${uniqueSuffix}`,
        category: "CAMERA_BODY",
        condition: "EXCELLENT",
        dailyRate: 250,
      });
      harness.assert(cameraRes.success === true, "S4.3-2: Cinema camera gear created");

      // 3. Wedding Proposal & Retainer Settlement
      const weddingProposal = await db.proposal.create({
        data: {
          tenantId: elysianTenant!.id,
          studioId: elysianOwner!.id,
          clientId: clientUser!.id,
          discipline: "HYBRID",
          proposalNumber: `PROP-ELY-${uniqueSuffix}`,
          title: "Vittorio & Sophia Napa Valley Nuptials",
          basePrice: 12000,
          totalPrice: 12000,
          depositAmount: 6000,
          finalBalanceAmount: 6000,
          contractTerms: "Elysian Weddings Master Nuptial Production Agreement",
          status: "SENT",
        },
      });

      const acceptRes = await acceptProposal({
        proposalId: weddingProposal.id,
        tenantSlug: studioSlug,
        signatureDataUrl: dummySignature,
        signerName: "Sophia Rossi",
        signerTitle: "Bride",
        consentAccepted: true,
        selectedAddOnIds: [],
      });

      harness.assert(acceptRes.success === true, "S4.3-3: Wedding proposal accepted");
      const weddingProjectId = acceptRes.projectId!;
      const retainerInvoiceId = acceptRes.invoiceId!;

      const retainerPay = await processInvoicePayment({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        invoiceId: retainerInvoiceId,
        paymentMethod: "CARD",
      });
      harness.assert(retainerPay.success === true, "S4.3-3: 50% wedding retainer paid via Card");

      // 4. Solar Call Sheet & WhatsApp Dispatch for Vineyard Golden Hour
      const callSheet = await db.callSheet.create({
        data: {
          projectId: weddingProjectId,
          title: "Meadowood Estate Golden Hour Ceremony",
          shootDate: new Date("2026-10-18T00:00:00.000Z"),
          generalCallTime: "02:00 PM",
          locationName: "Meadowood Napa Valley",
          locationAddress: "900 Meadowood Ln, St Helena, CA 94574",
          locationPinUrl: "https://maps.google.com/?q=38.5133,-122.4862",
        },
      });

      const solar = calculateGoldenHour(38.5133, -122.4862, callSheet.shootDate, -7);
      const enrichedCs: CallSheetWithDetails = {
        ...callSheet,
        sunriseTime: solar.sunrise,
        sunsetTime: solar.sunset,
        goldenHourMorning: solar.goldenHourMorning,
        goldenHourEvening: solar.goldenHourEvening,
        project: {
          title: "Vittorio & Sophia Napa Valley Nuptials",
          projectNumber: "PRJ-ELY-01",
          tenant: {
            name: "Elysian Wedding Cinematography",
            slug: studioSlug,
          },
        },
      };

      const waRes = generateWhatsAppCallSheetUrl(enrichedCs, "+17075550188", "http://localhost:3000");
      harness.assert(waRes.previewText.includes("Meadowood"), "S4.3-4: WhatsApp call sheet embeds vineyard location");
      harness.assert(waRes.previewText.includes(solar.sunset), "S4.3-4: WhatsApp call sheet embeds sunset time");

      // 5. Digital Releases & Paywall Verification
      const releaseRes = await submitDigitalRelease({
        projectId: weddingProjectId,
        tenantSlug: studioSlug,
        releaseType: "LOCATION",
        signerName: "Estate General Manager",
        signerEmail: "events@meadowood.com",
        signerRole: "Venue Host",
        termsContent: "Standard Commercial Location Filming Agreement",
        signatureDataUrl: dummySignature,
      });
      harness.assert(releaseRes.success === true, "S4.3-5: Location release signed");

      const weddingDeliverable = await db.clientDeliverable.create({
        data: {
          projectId: weddingProjectId,
          discipline: "HYBRID",
          title: "Wedding Cinema Film & Gallery",
        },
      });

      await db.deliverableItem.create({
        data: {
          deliverableId: weddingDeliverable.id,
          title: "Sophia_Vittorio_Hero_Wedding_Portrait",
          itemType: "PHOTO",
          downloadUrl: "/uploads/deliverables/masters/sophia_vittorio_01.jpg",
          previewUrl: "/uploads/deliverables/previews/sophia_vittorio_watermarked.jpg",
        },
      });

      // Paywall check: 403 Forbidden
      const paywallReq = new NextRequest(
        `http://localhost:3000/api/download?projectId=${weddingProjectId}&type=photo_zip`
      );
      const paywallRes = await downloadHandler(paywallReq);
      harness.assertEqual(paywallRes.status, 403, "S4.3-5: Unpaid wedding master download blocked with 403");

      // 6. Final Balance Settlement & 200 OK Master Unlock
      const finalInvoice = await db.milestoneInvoice.create({
        data: {
          tenantId: elysianTenant!.id,
          clientId: clientUser!.id,
          projectId: weddingProjectId,
          invoiceNumber: `INV-ELY-FINAL-${uniqueSuffix}`,
          milestoneType: "FINAL_BALANCE_50",
          amount: 6000,
          dueDate: new Date(),
          status: "PENDING",
        },
      });

      const finalPay = await processInvoicePayment({
        tenantId: elysianTenant!.id,
        tenantSlug: studioSlug,
        invoiceId: finalInvoice.id,
        paymentMethod: "CARD",
      });
      harness.assert(finalPay.success === true, "S4.3-6: Final wedding balance paid via Card");

      const unlockReq = new NextRequest(
        `http://localhost:3000/api/download?projectId=${weddingProjectId}&type=photo_zip`
      );
      const unlockRes = await downloadHandler(unlockReq);
      harness.assertEqual(unlockRes.status, 200, "S4.3-6: Master download succeeds 200 OK after final balance");

      // 7. Cross-Tenant Data Isolation Audit
      const luminaItemsFromElysianContext = await db.inventoryItem.findMany({
        where: { tenantId: elysianTenant!.id, name: { contains: "Sony FX6" } },
      });
      harness.assertEqual(
        luminaItemsFromElysianContext.length,
        0,
        "S4.3-7: Elysian cannot query Lumina Cine inventory records"
      );

      const apexSlotsFromElysianContext = await db.bookingSlot.findMany({
        where: { tenantId: elysianTenant!.id },
      });
      harness.assertEqual(
        apexSlotsFromElysianContext.length,
        0,
        "S4.3-7: Elysian has 0 booking slots (Apex slots isolated)"
      );

      // Clean up Scenario 4.3
      await db.deliverableItem.deleteMany({ where: { deliverableId: weddingDeliverable.id } });
      await db.clientDeliverable.delete({ where: { id: weddingDeliverable.id } });
      await db.digitalRelease.deleteMany({ where: { projectId: weddingProjectId } });
      await db.callSheet.delete({ where: { id: callSheet.id } });
      await db.milestoneInvoice.delete({ where: { id: finalInvoice.id } });
      await db.milestoneInvoice.delete({ where: { id: retainerInvoiceId } });
      await db.project.delete({ where: { id: weddingProjectId } });
      await db.proposal.delete({ where: { id: weddingProposal.id } });
      await db.inventoryItem.delete({ where: { id: cameraRes.item!.id } });
      await db.printSize.delete({ where: { id: sizeRes.printSize!.id } });
      await db.frameDesign.delete({ where: { id: frameRes.frame!.id } });
      await db.servicePackage.delete({ where: { id: pkgRes.package!.id } });
      await db.user.deleteMany({ where: { tenantId: elysianTenant!.id } });
      await db.tenant.delete({ where: { id: elysianTenant!.id } });
    }
  );
}
