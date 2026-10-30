/**
 * CineFlow OS — Milestone 4 Verification Suite
 * 
 * Verifies Modules 5, 6, and 8 (Features 28 through 39):
 * - Module 5: Logistics & Set Mobile HUD (Solar calculations, WhatsApp URLs, Shot HUD check-offs, Digital releases)
 * - Module 6: Gear Inventory & Kit BOM (Inventory CRUD, KitBundle BOM availability, Pre/Post-Shoot inspections)
 * - Module 8: Print & Frame Wall Visualizer (Print order invoicing, MilestoneInvoice, checkout URL integration)
 * - Regression & Invariant Checks
 */

import { db } from "../lib/db";
import { calculateGoldenHour, extractCoordinates } from "../lib/solar";
import { generateWhatsAppCallSheetUrl } from "../lib/whatsapp";
import { toggleShotCompletion, submitDigitalRelease } from "../lib/actions/logistics";
import {
  createGearItem,
  updateGearItem,
  deleteGearItem,
  createKitBundle,
  checkBundleAvailability,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "../lib/actions/gear";
import { createPrintOrder } from "../lib/actions/visualizer";

let assertionsPassed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
  assertionsPassed++;
}

async function runM4Verification() {
  console.log("===============================================================");
  console.log("   CineFlow OS Milestone 4 Verification Suite (Modules 5, 6, 8)");
  console.log("===============================================================\n");

  // ---------------------------------------------------------------------------
  // 1. Solar Golden Hour Engine (Feature 29)
  // ---------------------------------------------------------------------------
  console.log("--- 1. Solar Golden Hour Calculation Engine (Pure NOAA TS/JS) ---");
  // Test Brooklyn NY coordinates from seed (40.7001, -73.9850) on Nov 15, 2026
  const brooklynCoords = { lat: 40.7001, lng: -73.985 };
  const targetDate = new Date("2026-11-15T12:00:00Z");

  const solar = calculateGoldenHour(brooklynCoords.lat, brooklynCoords.lng, targetDate);

  // Compare against seed data precalculated value (seed.ts line 962: sunriseTime: "06:42 AM")
  assert(solar.sunrise === "06:42 AM", `Brooklyn Nov 15 sunrise matches seed data: expected '06:42 AM', got '${solar.sunrise}'`);
  assert(typeof solar.sunset === "string" && solar.sunset.length > 0, `Sunset computed: ${solar.sunset}`);
  assert(solar.goldenHourMorning.startsWith(solar.sunrise), `Morning golden hour begins at sunrise (${solar.goldenHourMorning})`);
  assert(solar.goldenHourEvening.endsWith(solar.sunset), `Evening golden hour ends at sunset (${solar.goldenHourEvening})`);

  // Test Coordinate extraction helper
  const extracted = extractCoordinates("https://maps.google.com/?q=40.7001,-73.9850");
  assert(Math.abs(extracted.lat - 40.7001) < 0.001 && Math.abs(extracted.lng - -73.985) < 0.001, "extractCoordinates accurately parses latitude and longitude from Google Maps URL");

  // ---------------------------------------------------------------------------
  // 2. 1-Click WhatsApp Dispatch Links (Feature 30)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. 1-Click WhatsApp Dispatch URL Generation ---");
  const callSheet = await db.callSheet.findFirst({
    where: { id: "cs_lumina_01" },
    include: {
      project: {
        include: {
          tenant: true,
        },
      },
    },
  });

  assert(callSheet !== null, "Seed call sheet cs_lumina_01 exists in database");

  const { url: waUrl, previewText } = generateWhatsAppCallSheetUrl(
    callSheet!,
    "+1 (555) 019-2831",
    "http://localhost:3000"
  );

  assert(waUrl.startsWith("https://wa.me/15550192831?text="), `WhatsApp URL targets phone and has text param (${waUrl.slice(0, 40)}...)`);
  assert(previewText.includes("OFFICIAL CALL SHEET"), "WhatsApp message contains OFFICIAL CALL SHEET header");
  assert(previewText.includes(callSheet!.generalCallTime), "WhatsApp message contains general call time");
  assert(previewText.includes(callSheet!.locationName), "WhatsApp message contains location name");
  assert(previewText.includes("Solar & Golden Hour Schedule"), "WhatsApp message includes solar schedule");
  assert(previewText.includes("Alex Vance"), "WhatsApp message includes crew roster member");
  assert(previewText.includes("/lumina-cine/set-hud/cs_lumina_01"), "WhatsApp message includes live HUD companion link");

  // ---------------------------------------------------------------------------
  // 3. Mobile On-Set Shot List HUD (Feature 31)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Mobile On-Set Shot List HUD Check-Off Action ---");
  // Seed shot_lum_3 is initially PENDING
  const initialShot = await db.shotItem.findUnique({ where: { id: "shot_lum_3" } });
  assert(initialShot !== null, "Shot shot_lum_3 exists");

  // Toggle to IN_PROGRESS
  const resProgress = await toggleShotCompletion({
    shotId: "shot_lum_3",
    status: "IN_PROGRESS",
    tenantSlug: "lumina-cine",
  });
  assert(resProgress.success === true, "toggleShotCompletion to IN_PROGRESS succeeded");
  assert(resProgress.shot?.status === "IN_PROGRESS", "Shot status in response is IN_PROGRESS");

  const dbShotProg = await db.shotItem.findUnique({ where: { id: "shot_lum_3" } });
  assert(dbShotProg?.status === "IN_PROGRESS", "Shot status persisted to SQLite as IN_PROGRESS");

  // Toggle to COMPLETED
  const resComplete = await toggleShotCompletion({
    shotId: "shot_lum_3",
    status: "COMPLETED",
    tenantSlug: "lumina-cine",
  });
  assert(resComplete.success === true, "toggleShotCompletion to COMPLETED succeeded");
  assert((resComplete.completedShots ?? 0) >= 2, `Completed shots count updated: ${resComplete.completedShots}`);
  assert((resComplete.percentage ?? 0) > 0, `Shot completion percentage computed: ${resComplete.percentage}%`);

  // ---------------------------------------------------------------------------
  // 4. Digital Talent & Location Releases (Feature 32)
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Digital Talent & Location Releases Signing ---");
  const sampleSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const releaseRes = await submitDigitalRelease({
    projectId: "proj_lumina_01",
    tenantSlug: "lumina-cine",
    releaseType: "TALENT",
    signerName: "Elena Rostova (Lead Stunt Double)",
    signerEmail: "elena.rostova@actiontalents.com",
    signerPhone: "+1 (555) 771-9920",
    signerRole: "Principal Stunt Performer",
    termsContent: "COMMERCIAL TALENT & LIKENESS APPEARANCE RELEASE ...",
    signatureDataUrl: sampleSignature,
    notes: "Verified on set by Alex Vance",
  });

  assert(releaseRes.success === true, "submitDigitalRelease action executed successfully");
  assert(typeof releaseRes.releaseId === "string", `Release created with ID: ${releaseRes.releaseId}`);

  const savedRelease = await db.digitalRelease.findUnique({
    where: { id: releaseRes.releaseId },
  });
  assert(savedRelease !== null, "Digital release persisted in SQLite");
  assert(savedRelease!.signerName === "Elena Rostova (Lead Stunt Double)", "Signer name recorded accurately");
  assert(savedRelease!.signatureDataUrl === sampleSignature, "Canvas signature data URL preserved");
  assert(savedRelease!.projectId === "proj_lumina_01", "Digital release linked to Lumina project");

  // ---------------------------------------------------------------------------
  // 5. Gear Inventory Fleet Management (Feature 33)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Gear Inventory Fleet Management (CRUD) ---");
  const testSku = `TST-CAM-${Date.now().toString().slice(-5)}`;

  const createItemRes = await createGearItem({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    name: "RED V-Raptor 8K VV Cinema Camera",
    sku: testSku,
    serialNumber: "VR8-99120",
    category: "Cameras",
    discipline: "VIDEOGRAPHY",
    condition: "EXCELLENT",
    status: "AVAILABLE",
    dailyRate: 650,
    location: "Vault Shelf B-1",
  });

  assert(createItemRes.success === true, "createGearItem successfully created new inventory item");
  const createdItemId = createItemRes.item!.id;

  // Duplicate SKU test (integrity constraint)
  const dupSkuRes = await createGearItem({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    name: "Duplicate RED Camera",
    sku: testSku,
    category: "Cameras",
  });
  assert(dupSkuRes.success === false, "createGearItem rejects duplicate SKU");

  // Update item
  const updateItemRes = await updateGearItem({
    id: createdItemId,
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    dailyRate: 700,
    location: "Vault Shelf B-2",
  });
  assert(updateItemRes.success === true, "updateGearItem updated dailyRate and location");
  assert(updateItemRes.item!.dailyRate === 700, "Updated dailyRate verified in database");

  // ---------------------------------------------------------------------------
  // 6. Kit Bundles & Equipment BOM (Feature 34)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Kit Bundles & Real-Time BOM Availability ---");
  // Check availability on existing seed kit bundle "kit_lum_acam"
  const bomCheck = await checkBundleAvailability("kit_lum_acam", "ten_lumina");
  assert(bomCheck.success === true, "checkBundleAvailability evaluated kit_lum_acam");
  assert(bomCheck.totalItems >= 3, `Constituent BOM items count verified: ${bomCheck.totalItems}`);
  assert(typeof bomCheck.isFullyAvailable === "boolean", `Readiness status evaluated: ${bomCheck.isFullyAvailable}`);
  assert(bomCheck.aggregateDailyRate > 0, `Aggregate daily rate valuation computed: $${bomCheck.aggregateDailyRate}`);

  // Cross-tenant integrity check: Attempt to create kit bundle with gear from another tenant
  const crossTenantBundle = await createKitBundle({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    name: "Malicious Cross-Tenant Bundle",
    description: "Attempting to assemble Lumina bundle using Apex Hasselblad",
    discipline: "HYBRID",
    items: [
      { itemId: createdItemId, quantity: 1 },
      { itemId: "inv_hass", quantity: 1 }, // Belongs to Apex!
    ],
  });
  assert(crossTenantBundle.success === false, "createKitBundle strictly blocks cross-tenant gear assignment");
  assert(crossTenantBundle.error === "CROSS_TENANT_VIOLATION", "Reported CROSS_TENANT_VIOLATION error code");

  // Create valid kit bundle
  const validBundleRes = await createKitBundle({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    name: "High-Speed Commercial B-Cam Rig",
    description: "RED V-Raptor package with prime zoom",
    discipline: "VIDEOGRAPHY",
    dailyRate: 850,
    items: [
      { itemId: createdItemId, quantity: 1 },
      { itemId: "inv_gm2470", quantity: 1 },
    ],
  });
  assert(validBundleRes.success === true, "createKitBundle assembled valid BOM recipe within tenant scope");

  // ---------------------------------------------------------------------------
  // 7. Atomic Pre/Post-Shoot Inspection State Engine (Feature 35)
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Atomic Pre/Post-Shoot Inspection State Transitions ---");
  // 1. Create reservation
  const reservationRes = await createEquipmentReservation({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: createdItemId,
    startDate: new Date("2026-11-20"),
    endDate: new Date("2026-11-22"),
  });
  assert(reservationRes.success === true, "createEquipmentReservation created reservation");
  const testReservationId = reservationRes.reservation!.id;

  // Verify item transitioned to RESERVED
  const reservedItem = await db.inventoryItem.findUnique({ where: { id: createdItemId } });
  assert(reservedItem!.status === "RESERVED", "InventoryItem status updated to RESERVED");

  // 2. Pre-Shoot Check-Out Inspection
  const preShootRes = await logPreShootInspection({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    reservationId: testReservationId,
    inspectorName: "Sarah Tan (Equipment Manager)",
    condition: "EXCELLENT",
    notes: "Sensor clean, exFAT formatted CFexpress Type B inserted.",
    sensorVerified: true,
    mediaFormatted: true,
    batteriesCharged: true,
  });
  assert(preShootRes.success === true, "logPreShootInspection executed atomically");

  const dispatchedReservation = await db.equipmentReservation.findUnique({
    where: { id: testReservationId },
    include: { item: true, inspection: true },
  });
  assert(dispatchedReservation!.status === "CHECKED_OUT", "EquipmentReservation status transitioned to CHECKED_OUT");
  assert(dispatchedReservation!.item.status === "ON_SHOOT", "InventoryItem status atomically transitioned to ON_SHOOT");
  assert(dispatchedReservation!.inspection !== null, "InspectionLog record created");
  assert(dispatchedReservation!.inspection!.checkoutCondition.includes("Sensor Verified Clean"), "Checklist details persisted in checkoutCondition");

  // 3. Post-Shoot Return Inspection with Damage Flag
  const postShootRes = await logPostShootInspection({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    reservationId: testReservationId,
    inspectorName: "David Chong (Studio Tech)",
    condition: "DAMAGED",
    damageFlag: true,
    notes: "Front sensor glass has fine hairline scratch; sending to RED repair center.",
  });
  assert(postShootRes.success === true, "logPostShootInspection executed atomically");
  assert(postShootRes.nextItemStatus === "MAINTENANCE", "Reported nextItemStatus as MAINTENANCE due to damage flag");

  const returnedReservation = await db.equipmentReservation.findUnique({
    where: { id: testReservationId },
    include: { item: true, inspection: true },
  });
  assert(returnedReservation!.status === "RETURNED", "EquipmentReservation status transitioned to RETURNED");
  assert(returnedReservation!.item.status === "MAINTENANCE", "InventoryItem status atomically transitioned to MAINTENANCE");
  assert(returnedReservation!.item.condition === "DAMAGED", "InventoryItem condition updated to DAMAGED");
  assert(returnedReservation!.inspection!.checkinCondition !== null, "Post-shoot checkinCondition recorded in InspectionLog");

  // ---------------------------------------------------------------------------
  // 8. Print & Frame Wall Visualizer & Invoicing (Features 36–39)
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Print & Frame Wall Visualizer Order Invoicing (Feature 39) ---");
  const orderRes = await createPrintOrder({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    printSizeId: "psz_lum_16r", // 16R: $140
    frameDesignId: "frm_lum_walnut", // Warm Walnut: +$45
    matBoardType: "WHITE_2INCH", // 2" Mat: +$25
    orientation: "LANDSCAPE",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    photoTitle: "Aurora Luxury Fall Campaign Hero Print",
    clientName: "Jessica Montgomery",
    clientEmail: "jessica.m@aurorafashion.com",
    clientPhone: "+1 (555) 304-9912",
    notes: "Ship with white cotton gallery gloves.",
  });

  assert(orderRes.success === true, "createPrintOrder executed successfully");
  assert(typeof orderRes.invoiceId === "string", `Milestone invoice generated: ${orderRes.invoiceId}`);
  assert(orderRes.totalAmount === 140 + 45 + 25, `Total order amount calculated accurately: expected 210, got ${orderRes.totalAmount}`);
  assert(orderRes.checkoutUrl === `/lumina-cine/checkout?invoiceId=${orderRes.invoiceId}`, `Checkout redirect URL constructed: ${orderRes.checkoutUrl}`);

  // Verify database MilestoneInvoice record
  const invoiceInDb = await db.milestoneInvoice.findUnique({
    where: { id: orderRes.invoiceId },
    include: { client: true, tenant: true },
  });

  assert(invoiceInDb !== null, "MilestoneInvoice record found in database");
  assert(invoiceInDb!.milestoneType === "PRINT_FRAME_ORDER", "milestoneType is strictly 'PRINT_FRAME_ORDER'");
  assert(invoiceInDb!.amount === 210, "Invoice amount in database is 210.0");
  assert(invoiceInDb!.status === "PENDING", "Invoice initial status is PENDING");
  assert(invoiceInDb!.paymentReference !== null, "paymentReference contains itemized order specification");

  const metadata = JSON.parse(invoiceInDb!.paymentReference!);
  assert(metadata.orderType === "PRINT_FRAME_ORDER", "paymentReference metadata has orderType 'PRINT_FRAME_ORDER'");
  assert(metadata.printSize.code === "16R", "paymentReference records 16R print size");
  assert(metadata.frameDesign.name === "Warm Walnut Shadowbox", "paymentReference records frame design");
  assert(metadata.matBoard.type === "WHITE_2INCH", "paymentReference records 2-inch mat board");

  // Clean up temporary test item and bundle
  await db.kitBundleItem.deleteMany({ where: { bundleId: validBundleRes.bundle!.id } });
  await db.kitBundle.delete({ where: { id: validBundleRes.bundle!.id } });
  await db.inspectionLog.deleteMany({ where: { reservationId: testReservationId } });
  await db.equipmentReservation.delete({ where: { id: testReservationId } });
  await db.inventoryItem.delete({ where: { id: createdItemId } });

  console.log("\n===============================================================");
  console.log(`🎉 ALL ${assertionsPassed} MILESTONE 4 ASSERTIONS PASSED WITH ZERO ERRORS!`);
  console.log("===============================================================");
}

runM4Verification()
  .catch((err) => {
    console.error("M4 Verification Suite encountered an error:", err);
    process.exit(1);
  });
