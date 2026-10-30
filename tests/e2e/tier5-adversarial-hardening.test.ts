/**
 * Tier 5: Adversarial Coverage Hardening
 *
 * White-Box Stress & Security Suites:
 *   5.1: High-Concurrency Slot Holding Stampedes (50-way hold race, 20-way checkout race, expired lease reclamation)
 *   5.2: Paywall Circumvention Attacks (tampering, injection, path traversal, unpaid master gating 403, atomic unlock 200)
 *   5.3: Cross-Tenant Data Leakage & Entity Modification Attacks (slot hold isolation, bundle BOM cross-tenant guard, reservation isolation, reserved slug collision)
 *   5.4: Equipment Double-Booking & Maintenance Quarantine (overlapping reservation rejection, post-shoot damage quarantine, blocked reservation on maintenance gear, BOM availability sync)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { holdBookingSlot } from "@/lib/actions/booking";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import {
  createGearItem,
  createKitBundle,
  checkBundleAvailability,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "@/lib/actions/gear";
import { onboardStudio, checkSlugAvailability } from "@/lib/actions/onboarding";
import { GET as downloadHandler } from "@/app/api/download/route";

export async function runTier5AdversarialHardeningTests(harness: TestHarness) {
  harness.setSuite("Tier 5", "Adversarial Coverage Hardening (4 Stress Suites)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const luminaLead = await db.user.findFirst({
    where: { tenantId: luminaTenant?.id, role: "STUDIO_OWNER" },
  });
  const clientUser = await db.user.findFirst({
    where: { role: "CLIENT", tenantId: luminaTenant?.id },
  });

  harness.assert(Boolean(luminaTenant), "Lumina tenant resolved");
  harness.assert(Boolean(apexTenant), "Apex tenant resolved");
  harness.assert(Boolean(luminaLead), "Lumina lead resolved");
  harness.assert(Boolean(clientUser), "Client user resolved");

  // ============================================================================
  // Suite 5.1: High-Concurrency Slot Holding Stampedes
  // ============================================================================
  await harness.test(
    "T5-STRESS-01: High-Concurrency Slot Holding Stampedes & Atomic Lease Claims",
    async () => {
      // 1. 50-way concurrent hold race on a single slot
      const targetSlot = await db.bookingSlot.create({
        data: {
          tenantId: luminaTenant!.id,
          date: new Date(Date.now() + 86400000 * 10),
          startTime: "02:00 PM",
          endTime: "03:00 PM",
          status: "AVAILABLE",
          price: 500,
          depositRequired: 150,
        },
      });

      const concurrentHolds = 50;
      const holdPromises = Array.from({ length: concurrentHolds }, (_, idx) =>
        holdBookingSlot({
          slotId: targetSlot.id,
          sessionId: `sess_stampede_${idx}_${Date.now()}`,
          tenantId: luminaTenant!.id,
        })
      );

      const holdResults = await Promise.all(holdPromises);
      const winners = holdResults.filter((r) => r.success === true);
      const losers = holdResults.filter((r) => r.success === false);

      harness.assertEqual(winners.length, 1, "50-way stampede: exactly 1 winner acquires hold");
      harness.assertEqual(losers.length, 49, "50-way stampede: exactly 49 callers rejected");

      for (const loser of losers) {
        harness.assertEqual(loser.error, "SLOT_ALREADY_HELD", "Rejection error code is SLOT_ALREADY_HELD");
      }

      const heldSlotInDb = await db.bookingSlot.findUnique({ where: { id: targetSlot.id } });
      harness.assertEqual(heldSlotInDb?.status, "HELD", "Slot status in DB is HELD");
      harness.assert(Boolean(heldSlotInDb?.heldBySessionId), "Slot holds winner sessionId");
      const winningSessionId = heldSlotInDb!.heldBySessionId!;

      // 2. 20-way concurrent booking checkout race on the held slot
      const checkoutPromises = Array.from({ length: 20 }, (_, idx) => {
        // Winner gets the winningSessionId; other 19 use random session IDs
        const sessId = idx === 0 ? winningSessionId : `sess_checkout_loser_${idx}_${Date.now()}`;
        return processBookingCheckout({
          slotId: targetSlot.id,
          sessionId: sessId,
          tenantId: luminaTenant!.id,
          tenantSlug: "lumina-cine",
          clientName: `Applicant ${idx}`,
          clientEmail: `applicant_${idx}_${Date.now()}@stampede.test`,
          clientPhone: "+15550001111",
          paymentMethod: "CARD",
          creativeBrief: "Adversarial Stampede Booking",
        });
      });

      const checkoutResults = await Promise.all(checkoutPromises);
      const checkoutWinners = checkoutResults.filter((r) => r.success === true);
      const checkoutLosers = checkoutResults.filter((r) => r.success === false);

      harness.assertEqual(checkoutWinners.length, 1, "20-way checkout: exactly 1 booking succeeds");
      harness.assertEqual(checkoutLosers.length, 19, "20-way checkout: 19 unauthorized checkouts rejected");

      for (const cl of checkoutLosers) {
        harness.assertEqual(cl.error, "SLOT_EXPIRED_OR_UNAVAILABLE", "Error code is SLOT_EXPIRED_OR_UNAVAILABLE");
      }

      const bookedSlot = await db.bookingSlot.findUnique({ where: { id: targetSlot.id } });
      harness.assertEqual(bookedSlot?.status, "BOOKED", "Slot status permanently transitioned to BOOKED");

      // 3. Expired Lease Reclamation Race
      const expiredSlot = await db.bookingSlot.create({
        data: {
          tenantId: luminaTenant!.id,
          date: new Date(Date.now() + 86400000 * 12),
          startTime: "04:00 PM",
          endTime: "05:00 PM",
          status: "HELD",
          heldUntil: new Date(Date.now() - 60000), // Expired 1 minute ago
          heldBySessionId: "sess_expired_abandoned",
        },
      });

      const reclamationPromises = Array.from({ length: 10 }, (_, idx) =>
        holdBookingSlot({
          slotId: expiredSlot.id,
          sessionId: `sess_reclaimer_${idx}_${Date.now()}`,
          tenantId: luminaTenant!.id,
        })
      );

      const reclaims = await Promise.all(reclamationPromises);
      const reclaimWinners = reclaims.filter((r) => r.success === true);
      const reclaimLosers = reclaims.filter((r) => r.success === false);

      harness.assertEqual(reclaimWinners.length, 1, "Expired reclamation race: exactly 1 new winner claims expired lease");
      harness.assertEqual(reclaimLosers.length, 9, "Expired reclamation race: 9 other contenders receive SLOT_ALREADY_HELD");

      // Clean up Suite 5.1
      await db.clientBooking.deleteMany({ where: { slotId: targetSlot.id } });
      if (checkoutWinners[0]?.invoiceId) {
        await db.milestoneInvoice.delete({ where: { id: checkoutWinners[0].invoiceId } });
      }
      await db.bookingSlot.delete({ where: { id: targetSlot.id } });
      await db.bookingSlot.delete({ where: { id: expiredSlot.id } });
    }
  );

  // ============================================================================
  // Suite 5.2: Paywall Circumvention Attacks
  // ============================================================================
  await harness.test(
    "T5-STRESS-02: Paywall Circumvention Attacks & Multi-Vector Penetration Hardening",
    async () => {
      const project = await db.project.create({
        data: {
          tenantId: luminaTenant!.id,
          studioLeadId: luminaLead!.id,
          clientId: clientUser!.id,
          discipline: "HYBRID",
          projectNumber: `PRJ-T5-SEC-${Date.now()}`,
          title: "Confidential Brand Launch Master Assets",
          status: "POST_PRODUCTION",
          budget: 15000,
          isFinalBalancePaid: false, // Paywalled
        },
      });

      const deliverable = await db.clientDeliverable.create({
        data: {
          projectId: project.id,
          discipline: "HYBRID",
          title: "Confidential Master Vault",
        },
      });

      const photoItem = await db.deliverableItem.create({
        data: {
          deliverableId: deliverable.id,
          title: "Confidential_Hero_Lookbook_01",
          itemType: "PHOTO",
          downloadUrl: "/uploads/deliverables/masters/confidential_01.jpg",
          previewUrl: "/uploads/deliverables/previews/confidential_watermarked.jpg",
        },
      });

      const videoItem = await db.deliverableItem.create({
        data: {
          deliverableId: deliverable.id,
          title: "Confidential_Brand_Anthem_4K",
          itemType: "VIDEO",
          downloadUrl: "/uploads/deliverables/masters/confidential_anthem.mov",
          previewUrl: "/uploads/deliverables/previews/confidential_anthem_preview.mp4",
        },
      });

      // Vector 1: Direct photo ZIP download penetration
      const req1 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`
      );
      const res1 = await downloadHandler(req1);
      harness.assertEqual(res1.status, 403, "Vector 1: Direct photo_zip download blocked with 403 Forbidden");

      // Vector 2: Direct video master download penetration
      const req2 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=video_master`
      );
      const res2 = await downloadHandler(req2);
      harness.assertEqual(res2.status, 403, "Vector 2: Direct video_master download blocked with 403 Forbidden");

      // Vector 3: Direct single photo master download penetration
      const req3 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=photo_master&assetId=${photoItem.id}`
      );
      const res3 = await downloadHandler(req3);
      harness.assertEqual(res3.status, 403, "Vector 3: Direct single photo_master download blocked with 403 Forbidden");

      // Vector 4: Query parameter tampering (isFinalBalancePaid=true injection)
      const req4 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip&isFinalBalancePaid=true&bypass=1`
      );
      const res4 = await downloadHandler(req4);
      harness.assertEqual(res4.status, 403, "Vector 4: Injected query parameter isFinalBalancePaid=true ignored, returns 403");

      // Vector 5: Header spoofing (X-Admin-Bypass, X-User-Role)
      const req5 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`,
        {
          headers: {
            "x-admin-bypass": "true",
            "x-user-role": "SUPER_ADMIN",
            cookie: "admin_override=1; authenticated=true",
          },
        }
      );
      const res5 = await downloadHandler(req5);
      harness.assertEqual(res5.status, 403, "Vector 5: Header spoofing bypassed checks ignored, returns 403");

      // Vector 6: Missing query parameters
      const req6 = new NextRequest(`http://localhost:3000/api/download`);
      const res6 = await downloadHandler(req6);
      harness.assertEqual(res6.status, 400, "Vector 6: Missing projectId and type parameters returns 400 Bad Request");

      // Vector 7: Non-existent projectId
      const req7 = new NextRequest(
        `http://localhost:3000/api/download?projectId=non_existent_project_99999&type=photo_zip`
      );
      const res7 = await downloadHandler(req7);
      harness.assertEqual(res7.status, 404, "Vector 7: Non-existent projectId returns 404 Not Found");

      // Vector 8: Settlement & Atomic Paywall Unlock Verification
      const finalInvoice = await db.milestoneInvoice.create({
        data: {
          tenantId: luminaTenant!.id,
          clientId: clientUser!.id,
          projectId: project.id,
          invoiceNumber: `INV-T5-SETTLE-${Date.now()}`,
          milestoneType: "FINAL_BALANCE_50",
          amount: 7500,
          dueDate: new Date(),
          status: "PENDING",
        },
      });

      const payRes = await processInvoicePayment({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        invoiceId: finalInvoice.id,
        paymentMethod: "CARD",
      });
      harness.assert(payRes.success === true, "Vector 8: Final balance paid via Card");
      harness.assertEqual(payRes.unlockedDownloads, true, "Vector 8: unlockedDownloads returned true");

      const req8 = new NextRequest(
        `http://localhost:3000/api/download?projectId=${project.id}&type=photo_zip`
      );
      const res8 = await downloadHandler(req8);
      harness.assertEqual(res8.status, 200, "Vector 8: Master download returns 200 OK after settlement");
      harness.assertEqual(
        res8.headers.get("content-type"),
        "application/zip",
        "Vector 8: Content-Type is application/zip"
      );

      const zipBuf = await res8.arrayBuffer();
      const zipBytes = new Uint8Array(zipBuf);
      harness.assert(
        zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04,
        "Vector 8: Valid PKZIP magic header (0x50, 0x4B, 0x03, 0x04)"
      );

      // Clean up Suite 5.2
      await db.deliverableItem.deleteMany({ where: { deliverableId: deliverable.id } });
      await db.clientDeliverable.delete({ where: { id: deliverable.id } });
      await db.milestoneInvoice.delete({ where: { id: finalInvoice.id } });
      await db.project.delete({ where: { id: project.id } });
    }
  );

  // ============================================================================
  // Suite 5.3: Cross-Tenant Data Leakage & Entity Modification Attacks
  // ============================================================================
  await harness.test(
    "T5-STRESS-03: Cross-Tenant Data Leakage & Entity Modification Attacks",
    async () => {
      // 1. Cross-tenant slot holding attack
      // Create slot in Apex, attempt to hold it specifying Lumina tenantId
      const apexSlot = await db.bookingSlot.create({
        data: {
          tenantId: apexTenant!.id,
          date: new Date(Date.now() + 86400000 * 7),
          startTime: "11:00 AM",
          endTime: "12:00 PM",
          status: "AVAILABLE",
        },
      });

      const crossTenantHold = await holdBookingSlot({
        slotId: apexSlot.id,
        sessionId: "lumina_attacker_session",
        tenantId: luminaTenant!.id, // Spoofed tenant
      });

      harness.assert(crossTenantHold.success === false, "Cross-tenant slot hold rejected");
      harness.assertEqual(crossTenantHold.error, "SLOT_NOT_FOUND", "Error code is SLOT_NOT_FOUND (Apex slot invisible to Lumina)");

      // 2. Cross-tenant kit bundle assignment attack
      // Create gear item in Apex, attempt to bundle it inside a Lumina kit bundle
      const apexItem = await createGearItem({
        tenantId: apexTenant!.id,
        tenantSlug: "apex-media",
        name: "Apex Secret Lens",
        sku: `APX-CROSS-${Date.now()}`,
        category: "LENS",
        condition: "EXCELLENT",
        dailyRate: 120,
      });

      const crossBundleRes = await createKitBundle({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        name: "Malicious Lumina Kit Bundle",
        description: "Attempted cross-tenant kit bundle injection",
        discipline: "HYBRID",
        items: [{ itemId: apexItem.item!.id, quantity: 1 }],
      });

      harness.assert(crossBundleRes.success === false, "Cross-tenant kit bundle rejected");
      harness.assertEqual(crossBundleRes.error, "CROSS_TENANT_VIOLATION", "Error code is CROSS_TENANT_VIOLATION");

      // 3. Cross-tenant equipment reservation attack
      // Attempt to reserve Apex gear item under a Lumina project
      const luminaProject = await db.project.create({
        data: {
          tenantId: luminaTenant!.id,
          studioLeadId: luminaLead!.id,
          clientId: clientUser!.id,
          discipline: "VIDEOGRAPHY",
          projectNumber: `PRJ-CROSS-${Date.now()}`,
          title: "Lumina Production Project",
          status: "PRE_PRODUCTION",
          budget: 5000,
        },
      });

      const crossReservation = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId: luminaProject.id,
        itemId: apexItem.item!.id, // Apex gear item
        startDate: new Date("2026-11-25T08:00:00Z").toISOString(),
        endDate: new Date("2026-11-26T18:00:00Z").toISOString(),
      });

      harness.assert(crossReservation.success === false, "Cross-tenant equipment reservation rejected");
      harness.assertEqual(crossReservation.error, "ITEM_NOT_FOUND", "Error code is ITEM_NOT_FOUND");

      // 4. Platform Reserved & Existing Slug Squatting Attacks
      const slugCheckTaken = await checkSlugAvailability("lumina-cine");
      harness.assertEqual(slugCheckTaken.available, false, "checkSlugAvailability('lumina-cine') returns false (existing tenant)");

      const slugCheckReserved = await checkSlugAvailability("super-admin");
      harness.assertEqual(slugCheckReserved.available, false, "checkSlugAvailability('super-admin') returns false (platform reserved)");

      const duplicateOnboard = await onboardStudio({
        name: "Lumina Cine Impersonator",
        slug: "lumina-cine",
        discipline: "HYBRID",
        currency: "USD",
        ownerName: "Attacker",
        ownerEmail: "attacker@impersonator.com",
        password: "AttackerPassword123!",
      });

      harness.assert(duplicateOnboard.success === false, "Duplicate studio slug onboarding rejected");
      harness.assert(
        duplicateOnboard.error?.includes("already taken") || duplicateOnboard.error === "SLUG_ALREADY_TAKEN",
        "Error message confirms slug collision"
      );

      // Clean up Suite 5.3
      await db.project.delete({ where: { id: luminaProject.id } });
      await db.inventoryItem.delete({ where: { id: apexItem.item!.id } });
      await db.bookingSlot.delete({ where: { id: apexSlot.id } });
    }
  );

  // ============================================================================
  // Suite 5.4: Equipment Double-Booking & Maintenance Quarantine
  // ============================================================================
  await harness.test(
    "T5-STRESS-04: Equipment Double-Booking & Maintenance Quarantine Enforcement",
    async () => {
      const camera = await createGearItem({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        name: "Sony FX3 B-Cam Cine Kit",
        sku: `FX3-T5-${Date.now()}`,
        category: "CAMERA_BODY",
        condition: "EXCELLENT",
        dailyRate: 200,
      });

      const project = await db.project.create({
        data: {
          tenantId: luminaTenant!.id,
          studioLeadId: luminaLead!.id,
          clientId: clientUser!.id,
          discipline: "HYBRID",
          projectNumber: `PRJ-T5-GEAR-${Date.now()}`,
          title: "Lumina Multi-Day Commercial",
          status: "PRE_PRODUCTION",
          budget: 6000,
        },
      });

      // 1. Initial Confirmed Reservation: Dec 1 to Dec 5
      const res1 = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId: project.id,
        itemId: camera.item!.id,
        startDate: "2026-12-01T08:00:00.000Z",
        endDate: "2026-12-05T18:00:00.000Z",
      });

      harness.assert(res1.success === true, "Initial gear reservation Dec 1-5 confirmed");
      const activeResId = res1.reservation!.id;

      // 2. Overlapping Double-Booking Attack: Dec 3 to Dec 7 (partial overlap)
      const conflictRes1 = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId: project.id,
        itemId: camera.item!.id,
        startDate: "2026-12-03T08:00:00.000Z",
        endDate: "2026-12-07T18:00:00.000Z",
      });

      harness.assert(conflictRes1.success === false, "Overlapping reservation Dec 3-7 rejected");
      harness.assertEqual(conflictRes1.error, "DATE_CONFLICT", "Error code is DATE_CONFLICT");

      // 3. Contained Double-Booking Attack: Dec 2 to Dec 4 (strict subset)
      const conflictRes2 = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId: project.id,
        itemId: camera.item!.id,
        startDate: "2026-12-02T08:00:00.000Z",
        endDate: "2026-12-04T18:00:00.000Z",
      });

      harness.assert(conflictRes2.success === false, "Contained reservation Dec 2-4 rejected");
      harness.assertEqual(conflictRes2.error, "DATE_CONFLICT", "Error code is DATE_CONFLICT");

      // 4. Pre-Shoot Checkout Inspection
      const preInspection = await logPreShootInspection({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        reservationId: activeResId,
        inspectorName: "Marcus Vance",
        condition: "EXCELLENT",
        sensorVerified: true,
        mediaFormatted: true,
        batteriesCharged: true,
      });

      harness.assert(preInspection.success === true, "Pre-shoot inspection logged");
      const checkedOutItem = await db.inventoryItem.findUnique({ where: { id: camera.item!.id } });
      harness.assertEqual(checkedOutItem?.status, "ON_SHOOT", "Item status is ON_SHOOT");

      // 5. Post-Shoot Damaged Return: Automatic Maintenance Quarantine
      const postInspection = await logPostShootInspection({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        reservationId: activeResId,
        inspectorName: "Marcus Vance",
        condition: "DAMAGED",
        damageFlag: true,
        notes: "Sensor glass hairline crack and HDMI port loose after drone impact.",
      });

      harness.assert(postInspection.success === true, "Post-shoot damaged inspection logged");

      const quarantinedItem = await db.inventoryItem.findUnique({ where: { id: camera.item!.id } });
      harness.assertEqual(quarantinedItem?.status, "MAINTENANCE", "Damaged item atomically quarantined to MAINTENANCE");
      harness.assertEqual(quarantinedItem?.condition, "DAMAGED", "Item condition updated to DAMAGED");

      // 6. Blocked Reservation on Quarantined Gear
      const blockedRes = await createEquipmentReservation({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        projectId: project.id,
        itemId: camera.item!.id,
        startDate: "2026-12-10T08:00:00.000Z",
        endDate: "2026-12-12T18:00:00.000Z",
      });

      harness.assert(blockedRes.success === false, "New reservation on MAINTENANCE gear strictly blocked");
      harness.assertEqual(blockedRes.error, "ITEM_UNDER_MAINTENANCE", "Error code is ITEM_UNDER_MAINTENANCE");

      // 7. Kit Bundle BOM Availability Sync with Quarantined Item
      const bundle = await createKitBundle({
        tenantId: luminaTenant!.id,
        tenantSlug: "lumina-cine",
        name: "FX3 Commercial B-Cam Package",
        description: "Commercial B-Cam package with accessories",
        discipline: "HYBRID",
        items: [{ itemId: camera.item!.id, quantity: 1 }],
      });

      harness.assert(bundle.success === true, "Kit bundle with quarantined item created for audit");
      const bundleCheck = await checkBundleAvailability(bundle.bundle!.id, luminaTenant!.id);

      harness.assertEqual(bundleCheck.isFullyAvailable, false, "Kit bundle is marked unavailable due to damaged item");
      harness.assertEqual(bundleCheck.conflictingItems.length, 1, "conflictingItems contains exactly 1 damaged item");
      harness.assertEqual(bundleCheck.conflictingItems[0]?.id, camera.item!.id, "Conflicting item ID matches quarantined camera");

      // Clean up Suite 5.4
      await db.kitBundleItem.deleteMany({ where: { bundleId: bundle.bundle!.id } });
      await db.kitBundle.delete({ where: { id: bundle.bundle!.id } });
      await db.inspectionLog.deleteMany({ where: { reservationId: activeResId } });
      await db.equipmentReservation.deleteMany({ where: { id: activeResId } });
      await db.inventoryItem.delete({ where: { id: camera.item!.id } });
      await db.project.delete({ where: { id: project.id } });
    }
  );
}
