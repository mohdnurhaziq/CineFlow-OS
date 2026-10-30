/**
 * CineFlow OS — Challenger Stress Test Suite (Milestone 4: Modules 5 & 6 + Visualizer)
 * 
 * Adversarially challenges and verifies:
 * 1. Solar Engine Stress Testing (lib/solar.ts)
 *    - Boundary coordinates: Equator (0, 0), North lat (+60), South lat (-45), Polar (+78.22, -78.0), Date Line (±179.9, ±180.0)
 *    - Calendar edges: Leap years (2024, 2028), Solstices, Equinoxes
 *    - Pin parsing: Google Maps ?q=, @lat,lng, raw strings, negative coordinates, malformed/null inputs
 * 2. WhatsApp Dispatch Stress Testing (lib/whatsapp.ts)
 *    - Call sheets with all optional fields null/empty
 *    - Emojis and special characters in project title, location address, and notes
 *    - Large crew roster (12+ members) and malformed/corrupted JSON handling
 *    - URL encoding verification and round-trip decoding
 *    - Various telephone formats
 * 3. Shot List Concurrency & Progress Calculation (lib/actions/logistics.ts)
 *    - Status cycle transitions: PENDING -> IN_PROGRESS -> COMPLETED -> PENDING
 *    - 0% and 100% boundary calculations
 *    - Concurrent status toggling via Promise.all
 *    - Invalid shotId and invalid status string handling
 * 4. Gear Inventory & Kit BOM Integrity (lib/actions/gear.ts)
 *    - Cross-tenant kit bundle assignment rejection (creation and update)
 *    - Duplicate SKU rejection (creation and update)
 *    - Overlapping reservation conflict rejection (DATE_CONFLICT)
 *    - Atomic pre-shoot check-out: RESERVED -> CHECKED_OUT / ON_SHOOT with InspectionLog
 *    - Atomic post-shoot return with damage flag: CHECKED_OUT -> RETURNED / MAINTENANCE / DAMAGED
 *    - Clean post-shoot return: CHECKED_OUT -> RETURNED / AVAILABLE
 *    - Cross-tenant reservation and inspection rejection
 * 5. Wall Visualizer Isolation & Invoicing (lib/actions/visualizer.ts)
 *    - Cross-tenant frame and print size isolation
 *    - Atomic MilestoneInvoice creation with PRINT_FRAME_ORDER
 */

import { db } from "../lib/db";
import { calculateGoldenHour, extractCoordinates } from "../lib/solar";
import { generateWhatsAppCallSheetUrl, parseCrewJson, type CallSheetWithDetails } from "../lib/whatsapp";
import { toggleShotCompletion } from "../lib/actions/logistics";
import {
  createGearItem,
  updateGearItem,
  createKitBundle,
  updateKitBundle,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "../lib/actions/gear";
import { createPrintOrder } from "../lib/actions/visualizer";

let assertionsPassed = 0;
let assertionsFailed = 0;

function assert(condition: boolean, description: string) {
  if (!condition) {
    console.error(`❌ CHALLENGE FAILED: ${description}`);
    assertionsFailed++;
    throw new Error(`Challenge failure: ${description}`);
  }
  console.log(`✓ PASS: ${description}`);
  assertionsPassed++;
}

async function runChallengerSuite() {
  console.log("==========================================================================");
  console.log("   CineFlow OS Adversarial Challenger Suite — Milestone 4 (Logistics & Gear)");
  console.log("==========================================================================\n");

  // Dynamically resolve tenant references
  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!luminaTenant || !apexTenant) {
    throw new Error("Lumina or Apex tenant record missing from database.");
  }
  const luminaId = luminaTenant.id;
  const apexId = apexTenant.id;

  // ===========================================================================
  // 1. SOLAR ENGINE STRESS & BOUNDARY TESTING (lib/solar.ts)
  // ===========================================================================
  console.log("--- 1. Solar Engine Stress & Boundary Testing ---");

  // 1.1 Equator (0, 0) on Vernal Equinox (2026-03-20)
  const eqTimes = calculateGoldenHour(0, 0, new Date("2026-03-20T12:00:00Z"));
  assert(typeof eqTimes.sunrise === "string" && eqTimes.sunrise.length > 0, "Equator equinox sunrise computed");
  assert(typeof eqTimes.sunset === "string" && eqTimes.sunset.length > 0, "Equator equinox sunset computed");
  assert(!eqTimes.sunrise.includes("NaN"), "Equator sunrise does not contain NaN");
  assert(!eqTimes.sunset.includes("NaN"), "Equator sunset does not contain NaN");
  assert(eqTimes.goldenHourMorning.startsWith(eqTimes.sunrise), "Equator morning golden hour begins at sunrise");
  assert(eqTimes.goldenHourEvening.endsWith(eqTimes.sunset), "Equator evening golden hour ends at sunset");

  // 1.2 Extreme North (+60° Oslo) — Summer & Winter Solstices
  const osloSummer = calculateGoldenHour(60.0, 10.75, new Date("2026-06-21T12:00:00Z"), 2);
  const osloWinter = calculateGoldenHour(60.0, 10.75, new Date("2026-12-21T12:00:00Z"), 1);
  assert(!osloSummer.sunrise.includes("NaN") && !osloSummer.sunset.includes("NaN"), "Oslo Summer Solstice non-crashing");
  assert(!osloWinter.sunrise.includes("NaN") && !osloWinter.sunset.includes("NaN"), "Oslo Winter Solstice non-crashing");
  assert(osloSummer.sunrise.includes("AM") && osloSummer.sunset.includes("PM"), "Oslo Summer diurnal cycle valid (AM sunrise, PM sunset)");

  // 1.3 Extreme South (-45° Queenstown, NZ) — Summer & Winter Solstices
  const nzSummer = calculateGoldenHour(-45.0, 168.66, new Date("2026-12-21T12:00:00Z"), 13);
  const nzWinter = calculateGoldenHour(-45.0, 168.66, new Date("2026-06-21T12:00:00Z"), 12);
  assert(!nzSummer.sunrise.includes("NaN") && !nzSummer.sunset.includes("NaN"), "Southern Hemisphere Dec summer non-crashing");
  assert(!nzWinter.sunrise.includes("NaN") && !nzWinter.sunset.includes("NaN"), "Southern Hemisphere Jun winter non-crashing");

  // 1.4 Arctic & Antarctic Extremes (Polar Day / Night - Longyearbyen +78.22° & Antarctica -78.0°)
  const polarDay = calculateGoldenHour(78.22, 15.65, new Date("2026-06-21T12:00:00Z"), 2);
  const polarNight = calculateGoldenHour(78.22, 15.65, new Date("2026-12-21T12:00:00Z"), 1);
  const antarcticPolar = calculateGoldenHour(-78.0, 0.0, new Date("2026-06-21T12:00:00Z"), 0);
  assert(typeof polarDay.sunrise === "string" && !polarDay.sunrise.includes("NaN"), "Polar midnight sun graceful fallback (no crash or NaN)");
  assert(typeof polarNight.sunset === "string" && !polarNight.sunset.includes("NaN"), "Polar night graceful fallback (no crash or NaN)");
  assert(typeof antarcticPolar.solarNoon === "string" && !antarcticPolar.solarNoon!.includes("NaN"), "Antarctic polar boundary handled safely");

  // 1.5 International Date Line (lng: +179.9, -179.9, +180.0, -180.0)
  const dateLineEast = calculateGoldenHour(-18.14, 179.9, new Date("2026-04-15T12:00:00Z"));
  const dateLineWest = calculateGoldenHour(-18.14, -179.9, new Date("2026-04-15T12:00:00Z"));
  const dateLineMaxE = calculateGoldenHour(0, 180.0, new Date("2026-04-15T12:00:00Z"));
  const dateLineMaxW = calculateGoldenHour(0, -180.0, new Date("2026-04-15T12:00:00Z"));
  assert(!dateLineEast.sunrise.includes("NaN") && !dateLineWest.sunrise.includes("NaN"), "International Date Line (±179.9°) non-crashing and non-NaN");
  assert(!dateLineMaxE.sunrise.includes("NaN") && !dateLineMaxW.sunrise.includes("NaN"), "International Date Line (±180.0°) boundary handled smoothly");

  // 1.6 Leap Years (2024-02-29 and 2028-02-29)
  const leap2024 = calculateGoldenHour(40.7128, -74.006, new Date("2024-02-29T12:00:00Z"), -5);
  const leap2028 = calculateGoldenHour(40.7128, -74.006, new Date("2028-02-29T12:00:00Z"), -5);
  assert(!leap2024.sunrise.includes("NaN") && leap2024.sunrise.includes("AM"), "Leap year Feb 29 2024 calculated correctly");
  assert(!leap2028.sunset.includes("NaN") && leap2028.sunset.includes("PM"), "Leap year Feb 29 2028 calculated correctly");

  // 1.7 Google Maps Pin Extraction Formats
  const gmapPin1 = extractCoordinates("https://maps.google.com/?q=40.7001,-73.9850");
  assert(Math.abs(gmapPin1.lat - 40.7001) < 0.0001 && Math.abs(gmapPin1.lng - -73.985) < 0.0001, "Parsed ?q=lat,lng format");

  const gmapPin2 = extractCoordinates("https://www.google.com/maps/@3.1390,101.6869,15z");
  assert(Math.abs(gmapPin2.lat - 3.1390) < 0.0001 && Math.abs(gmapPin2.lng - 101.6869) < 0.0001, "Parsed @lat,lng,zoom format");

  const gmapPin3 = extractCoordinates("  -33.8688, 151.2093  ");
  assert(Math.abs(gmapPin3.lat - -33.8688) < 0.0001 && Math.abs(gmapPin3.lng - 151.2093) < 0.0001, "Parsed whitespace padded raw coordinate string");

  const gmapPinSpaceBeforeComma = extractCoordinates("  -33.8688  ,  151.2093  ");
  assert(gmapPinSpaceBeforeComma.lat === 40.7001 && gmapPinSpaceBeforeComma.lng === -73.9850, "Non-standard whitespace-before-comma safely falls back to default");

  const gmapPinBoundary = extractCoordinates("90.0, 180.0");
  assert(gmapPinBoundary.lat === 90.0 && gmapPinBoundary.lng === 180.0, "Parsed maximum coordinate boundary 90.0, 180.0");

  const gmapPinInvalid1 = extractCoordinates("95.0, 200.0"); // Latitude > 90
  assert(gmapPinInvalid1.lat === 40.7001 && gmapPinInvalid1.lng === -73.9850, "Invalid out-of-bounds coordinates fall back to default");

  const gmapPinNull = extractCoordinates(null);
  const gmapPinUndef = extractCoordinates(undefined);
  const gmapPinEmpty = extractCoordinates("");
  const gmapPinGarbage = extractCoordinates("Random Location Name Without Lat Lng");
  assert(gmapPinNull.lat === 40.7001 && gmapPinUndef.lat === 40.7001, "Null and undefined safely return default Brooklyn coords");
  assert(gmapPinEmpty.lat === 40.7001 && gmapPinGarbage.lat === 40.7001, "Empty or non-coordinate strings safely return default Brooklyn coords");


  // ===========================================================================
  // 2. WHATSAPP DISPATCH STRESS TESTING (lib/whatsapp.ts)
  // ===========================================================================
  console.log("\n--- 2. WhatsApp Dispatch Stress Testing ---");

  // 2.1 Call sheet with minimal / null optional fields
  const minimalCallSheet: CallSheetWithDetails = {
    id: "cs_challenger_minimal",
    title: "Minimal Test Shoot",
    shootDate: new Date("2026-11-20T00:00:00Z"),
    generalCallTime: "08:00 AM",
    locationName: "Studio Stage A",
    locationAddress: "100 Warehouse Way",
    locationPinUrl: null,
    parkingNotes: null,
    hospitalName: null,
    hospitalAddress: null,
    weatherSummary: null,
    temperature: null,
    sunriseTime: null,
    sunsetTime: null,
    goldenHourMorning: null,
    goldenHourEvening: null,
    notes: null,
    crewJson: null,
    project: null,
  };

  const minResult = generateWhatsAppCallSheetUrl(minimalCallSheet, undefined, "https://cineflow.io");
  assert(minResult.url.startsWith("https://wa.me/?text="), "Minimal call sheet outputs valid wa.me URL without phone");
  assert(minResult.previewText.includes("OFFICIAL CALL SHEET: MINIMAL TEST SHOOT"), "Header rendered for minimal call sheet");
  assert(minResult.previewText.includes("Production Project"), "Fallback project title applied");
  assert(minResult.previewText.includes("• Sunrise: N/A | Sunset: N/A"), "Graceful fallback for omitted solar times");

  // 2.2 Special characters & Emojis in Project Title, Address, Notes
  const hostileCallSheet: CallSheetWithDetails = {
    id: "cs_challenger_hostile",
    title: "Cyber-Punk & 'Neon' <2026> 🎬 🔥",
    shootDate: "2026-12-25",
    generalCallTime: "06:30 AM",
    locationName: "St. Mary's / Studio #4 (Bldg C & D)",
    locationAddress: "777 O'Connor Blvd, Suite 200 & 300, San José, CA #95113",
    locationPinUrl: "https://maps.google.com/?q=37.3382,-121.8863",
    parkingNotes: "Park at Bay #2; fee = $20/hr & voucher needed!",
    hospitalName: "Regional Hospital & Trauma Ctr",
    hospitalAddress: "500 Hospital Pkwy #10",
    weatherSummary: "Cloudy & Rainy 🌧️",
    temperature: "18°C / 64°F",
    sunriseTime: "07:15 AM",
    sunsetTime: "05:00 PM",
    goldenHourMorning: "07:15 AM - 07:55 AM",
    goldenHourEvening: "04:20 PM - 05:00 PM",
    notes: "Security gate code: #9821*\nNo flash photography in hallway & quiet on set!",
    crewJson: JSON.stringify([
      { name: "John \"Ace\" Doe & Team", role: "DP / Cinematographer", callTime: "06:00 AM", phone: "+1 555-123-4567" },
    ]),
    project: {
      title: "✨ Mega 'Production' & Co. // <Active>",
      projectNumber: "PRJ-9999",
      tenant: {
        name: "Lumina CineWorks™",
        slug: "lumina-cine",
      },
    },
  };

  const hostileResult = generateWhatsAppCallSheetUrl(
    hostileCallSheet,
    "+1 (555) 987-6543",
    "https://cineflow.io"
  );

  assert(hostileResult.url.startsWith("https://wa.me/15559876543?text="), "Sanitized international telephone formatting (+1 555-987-6543 -> 15559876543)");
  const parsedUrl = new URL(hostileResult.url);
  assert(parsedUrl.hostname === "wa.me", "Valid URL host");
  const extractedText = parsedUrl.searchParams.get("text");
  assert(extractedText !== null, "Extracted search param text exists");
  assert(extractedText === hostileResult.previewText, "Round-trip URL encoding/decoding perfectly preserves emojis and special characters");

  // 2.3 Large Crew Roster & Corrupted crewJson stress
  const twelveCrewMembers = Array.from({ length: 12 }, (_, i) => ({
    name: `Crew Member ${i + 1}`,
    role: `Department ${i + 1} Lead`,
    callTime: `0${6 + (i % 3)}:00 AM`,
    phone: i % 2 === 0 ? `+1 555 000 ${i}000` : undefined,
  }));

  const callSheetLargeCrew: CallSheetWithDetails = {
    ...minimalCallSheet,
    crewJson: JSON.stringify(twelveCrewMembers),
  };

  const largeCrewResult = generateWhatsAppCallSheetUrl(callSheetLargeCrew);
  assert(largeCrewResult.previewText.includes("Crew Member 12"), "Large crew roster (12 members) fully rendered without truncation");

  // Malformed JSON string resilience
  const corruptedCrewList = parseCrewJson("{ bad unclosed json string [");
  assert(Array.isArray(corruptedCrewList) && corruptedCrewList.length === 0, "Corrupted crewJson handled gracefully with empty array fallback");


  // ===========================================================================
  // 3. SHOT LIST CONCURRENCY & PROGRESS CALCULATION (lib/actions/logistics.ts)
  // ===========================================================================
  console.log("\n--- 3. Shot List Concurrency & Progress Calculation ---");

  const r1 = await toggleShotCompletion({ shotId: "shot_lum_3", status: "PENDING", tenantSlug: "lumina-cine" });
  assert(r1.success && r1.shot?.status === "PENDING", "Shot transitioned to PENDING");
  const initialCompleted = r1.completedShots!;

  const r2 = await toggleShotCompletion({ shotId: "shot_lum_3", status: "IN_PROGRESS", tenantSlug: "lumina-cine" });
  assert(r2.success && r2.shot?.status === "IN_PROGRESS", "Shot transitioned to IN_PROGRESS");
  assert(r2.completedShots === initialCompleted, "Completed count unchanged when moving to IN_PROGRESS");

  const r3 = await toggleShotCompletion({ shotId: "shot_lum_3", status: "COMPLETED", tenantSlug: "lumina-cine" });
  assert(r3.success && r3.shot?.status === "COMPLETED", "Shot transitioned to COMPLETED");
  assert(r3.completedShots === initialCompleted + 1, "Completed count incremented on COMPLETED");

  const r4 = await toggleShotCompletion({ shotId: "shot_lum_3", status: "PENDING", tenantSlug: "lumina-cine" });
  assert(r4.success && r4.shot?.status === "PENDING", "Shot transitioned back to PENDING");
  assert(r4.completedShots === initialCompleted, "Completed count decremented back on PENDING");

  // Concurrent updates on multiple shots
  const [c1, c2] = await Promise.all([
    toggleShotCompletion({ shotId: "shot_lum_1", status: "COMPLETED", tenantSlug: "lumina-cine" }),
    toggleShotCompletion({ shotId: "shot_lum_2", status: "COMPLETED", tenantSlug: "lumina-cine" }),
  ]);
  assert(c1.success && c2.success, "Concurrent shot status updates both succeeded without lock contention");

  const [dbShot1, dbShot2] = await Promise.all([
    db.shotItem.findUnique({ where: { id: "shot_lum_1" } }),
    db.shotItem.findUnique({ where: { id: "shot_lum_2" } }),
  ]);
  assert(dbShot1?.status === "COMPLETED" && dbShot2?.status === "COMPLETED", "Both shots persisted as COMPLETED in SQLite");

  // Adversarial Inputs
  const invalidShot = await toggleShotCompletion({ shotId: "non_existent_shot_id_999", status: "COMPLETED" });
  assert(!invalidShot.success && invalidShot.error === "SHOT_NOT_FOUND", "Non-existent shotId rejected with SHOT_NOT_FOUND");

  const invalidStatus = await toggleShotCompletion({ shotId: "shot_lum_1", status: "INVALID_STATUS" as any });
  assert(!invalidStatus.success && invalidStatus.error === "UPDATE_FAILED", "Invalid status enum value rejected by validation");


  // ===========================================================================
  // 4. GEAR INVENTORY & KIT BOM INTEGRITY (lib/actions/gear.ts)
  // ===========================================================================
  console.log("\n--- 4. Gear Inventory & Kit BOM Integrity ---");

  // 4.1 Cross-Tenant Kit Bundle Assignment Rejection
  console.log("  Testing cross-tenant kit bundle creation...");
  const crossTenantCreate = await createKitBundle({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    name: "Malicious Cross-Tenant Bundle",
    description: "Attempting to bundle Apex's Hasselblad into Lumina's inventory",
    discipline: "PHOTOGRAPHY",
    items: [
      { itemId: "inv_hass", quantity: 1 }, // inv_hass belongs to apexId!
    ],
  });
  assert(!crossTenantCreate.success, "Cross-tenant kit bundle creation rejected");
  assert(crossTenantCreate.error === "CROSS_TENANT_VIOLATION", "Reported CROSS_TENANT_VIOLATION error code");

  // Cross-tenant update rejection
  console.log("  Testing cross-tenant kit bundle update...");
  const crossTenantUpdate = await updateKitBundle({
    id: "kit_lum_acam",
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    items: [
      { itemId: "inv_fx6", quantity: 1 },
      { itemId: "inv_xcd55", quantity: 1 }, // inv_xcd55 belongs to apexId!
    ],
  });
  assert(!crossTenantUpdate.success, "Cross-tenant kit bundle update rejected");
  assert(crossTenantUpdate.error === "CROSS_TENANT_VIOLATION", "Reported CROSS_TENANT_VIOLATION on bundle update");

  // 4.2 Duplicate SKU Rejection
  console.log("  Testing duplicate SKU rejection...");
  const testSku = "TEST-SKU-" + Math.floor(Math.random() * 900000);
  const item1 = await createGearItem({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    name: "Challenger Test Camera A",
    sku: testSku,
    category: "Cameras",
    discipline: "VIDEOGRAPHY",
    dailyRate: 100,
  });
  assert(item1.success && item1.item !== undefined, `Created baseline gear item with SKU ${testSku}`);

  const duplicateCreate = await createGearItem({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    name: "Challenger Duplicate Camera B",
    sku: testSku, // Exact same SKU
    category: "Cameras",
    discipline: "VIDEOGRAPHY",
  });
  assert(!duplicateCreate.success, "Duplicate SKU creation rejected");
  assert(duplicateCreate.error === "SKU_EXISTS", "Reported SKU_EXISTS error code");

  const item2 = await createGearItem({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    name: "Challenger Camera C",
    sku: testSku + "-ALT",
    category: "Cameras",
    discipline: "VIDEOGRAPHY",
  });
  assert(item2.success, "Created second gear item with alternate SKU");

  const duplicateUpdate = await updateGearItem({
    id: item2.item!.id,
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    sku: testSku, // Attempting to hijack SKU of item 1
  });
  assert(!duplicateUpdate.success, "Duplicate SKU update rejected");
  assert(duplicateUpdate.error === "SKU_EXISTS", "Reported SKU_EXISTS on item update");

  // 4.3 Atomic Pre-Shoot Check-Out State Transitions
  console.log("  Testing atomic pre-shoot check-out state machine...");
  const testGearItem = await db.inventoryItem.create({
    data: {
      tenantId: luminaId,
      name: "Challenger Test Cinema Lens 85mm",
      sku: "LNS-85MM-" + Math.floor(Math.random() * 900000),
      category: "Lenses",
      discipline: "VIDEOGRAPHY",
      condition: "EXCELLENT",
      status: "AVAILABLE",
      dailyRate: 75.0,
    },
  });

  const res1 = await createEquipmentReservation({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: testGearItem.id,
    startDate: "2026-11-25T00:00:00Z",
    endDate: "2026-11-27T00:00:00Z",
  });
  assert(res1.success && res1.reservation !== undefined, "Created shoot reservation for available item");

  const dbItemAfterRes = await db.inventoryItem.findUnique({ where: { id: testGearItem.id } });
  assert(dbItemAfterRes?.status === "RESERVED", "InventoryItem status transitioned to RESERVED");

  // 4.4 Overlapping reservation conflict rejection
  console.log("  Testing overlapping date reservation conflict...");
  const overlapRes = await createEquipmentReservation({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: testGearItem.id,
    startDate: "2026-11-26T00:00:00Z", // Overlaps with 25-27 window!
    endDate: "2026-11-28T00:00:00Z",
  });
  assert(!overlapRes.success, "Overlapping reservation rejected");
  assert(overlapRes.error === "DATE_CONFLICT", "Reported DATE_CONFLICT error code");

  // 4.5 Execute Pre-Shoot Check-Out
  console.log("  Executing pre-shoot check-out inspection...");
  const preInspection = await logPreShootInspection({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    reservationId: res1.reservation!.id,
    inspectorName: "Marcus Vance (Lead Tech)",
    condition: "EXCELLENT",
    sensorVerified: true,
    mediaFormatted: true,
    batteriesCharged: true,
    notes: "Front and rear optics clean, tested aperture ring.",
  });
  assert(preInspection.success, "logPreShootInspection returned success");

  const [dbResCheckedOut, dbItemOnShoot, dbInspPre] = await Promise.all([
    db.equipmentReservation.findUnique({ where: { id: res1.reservation!.id } }),
    db.inventoryItem.findUnique({ where: { id: testGearItem.id } }),
    db.inspectionLog.findUnique({ where: { reservationId: res1.reservation!.id } }),
  ]);
  assert(dbResCheckedOut?.status === "CHECKED_OUT", "EquipmentReservation status atomically transitioned to CHECKED_OUT");
  assert(dbItemOnShoot?.status === "ON_SHOOT", "InventoryItem status atomically transitioned to ON_SHOOT");
  assert(dbInspPre !== null && dbInspPre.checkoutCondition.includes("Batteries 100% Charged"), "InspectionLog record created with checklist verification");

  // 4.6 Execute Post-Shoot Return WITH DAMAGE FLAG
  console.log("  Executing post-shoot return WITH DAMAGE FLAG...");
  const postInspectionDamage = await logPostShootInspection({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    reservationId: res1.reservation!.id,
    inspectorName: "Elena Rostova",
    condition: "DAMAGED",
    damageFlag: true,
    notes: "Dropped during handheld shot; cracked front filter thread.",
  });
  assert(postInspectionDamage.success, "logPostShootInspection with damage returned success");
  assert(postInspectionDamage.nextItemStatus === "MAINTENANCE", "Reported nextItemStatus as MAINTENANCE due to damage flag");

  const [dbResReturned, dbItemMaint, dbInspPost] = await Promise.all([
    db.equipmentReservation.findUnique({ where: { id: res1.reservation!.id } }),
    db.inventoryItem.findUnique({ where: { id: testGearItem.id } }),
    db.inspectionLog.findUnique({ where: { reservationId: res1.reservation!.id } }),
  ]);
  assert(dbResReturned?.status === "RETURNED", "EquipmentReservation status transitioned to RETURNED");
  assert(dbItemMaint?.status === "MAINTENANCE", "InventoryItem status atomically transitioned to MAINTENANCE");
  assert(dbItemMaint?.condition === "DAMAGED", "InventoryItem condition set to DAMAGED");
  assert(Boolean(dbInspPost?.checkinCondition?.includes("YES (ATTENTION NEEDED)")), "InspectionLog checkinCondition notes damage attention needed");
  assert(Boolean(dbInspPost?.notes?.includes("cracked front filter thread")), "InspectionLog preserves damage notes");

  // 4.7 Clean Post-Shoot Return (Return to AVAILABLE)
  console.log("  Testing clean return back to AVAILABLE...");
  await db.inventoryItem.update({
    where: { id: testGearItem.id },
    data: { status: "AVAILABLE", condition: "EXCELLENT" },
  });

  const res2 = await createEquipmentReservation({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: testGearItem.id,
    startDate: "2026-12-01T00:00:00Z",
    endDate: "2026-12-02T00:00:00Z",
  });
  await logPreShootInspection({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    reservationId: res2.reservation!.id,
    inspectorName: "Marcus Vance",
    condition: "EXCELLENT",
  });
  const postClean = await logPostShootInspection({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    reservationId: res2.reservation!.id,
    inspectorName: "Marcus Vance",
    condition: "EXCELLENT",
    damageFlag: false,
    notes: "Clean return, optics spotless.",
  });
  assert(postClean.success && postClean.nextItemStatus === "AVAILABLE", "Clean return reports nextItemStatus as AVAILABLE");
  const dbItemClean = await db.inventoryItem.findUnique({ where: { id: testGearItem.id } });
  assert(dbItemClean?.status === "AVAILABLE", "InventoryItem atomically transitioned back to AVAILABLE");

  // 4.8 Cross-Tenant Reservation Rejection
  console.log("  Testing cross-tenant reservation rejection...");
  const crossTenantRes = await createEquipmentReservation({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: "inv_hass", // Apex item!
    startDate: "2026-12-10T00:00:00Z",
    endDate: "2026-12-11T00:00:00Z",
  });
  assert(!crossTenantRes.success, "Cross-tenant gear reservation rejected");
  assert(crossTenantRes.error === "ITEM_NOT_FOUND", "Reported ITEM_NOT_FOUND for item belonging to another tenant");


  // ===========================================================================
  // 5. WALL VISUALIZER INVOICING & ISOLATION (lib/actions/visualizer.ts)
  // ===========================================================================
  console.log("\n--- 5. Wall Visualizer Invoicing & Multi-Tenant Isolation ---");

  const apexFrame = await db.frameDesign.findFirst({ where: { tenantId: apexId } });
  const luminaPrint = await db.printSize.findFirst({ where: { tenantId: luminaId } });

  assert(apexFrame !== null && luminaPrint !== null, "Apex frame and Lumina print size identified");

  const crossTenantPrintOrder = await createPrintOrder({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    printSizeId: luminaPrint!.id,
    frameDesignId: apexFrame!.id, // Apex frame design!
    matBoardType: "NONE",
    orientation: "LANDSCAPE",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    clientName: "Cross Tenant Test",
    clientEmail: "challenger@example.com",
  });
  assert(!crossTenantPrintOrder.success, "Cross-tenant frame design order rejected");
  assert(crossTenantPrintOrder.error === "FRAME_DESIGN_NOT_FOUND", "Reported FRAME_DESIGN_NOT_FOUND for cross-tenant frame");

  // 5.2 Valid Print Order Invoicing & Math Invariant
  const luminaFrame = await db.frameDesign.findFirst({ where: { tenantId: luminaId } });
  const validOrder = await createPrintOrder({
    tenantId: luminaId,
    tenantSlug: "lumina-cine",
    printSizeId: luminaPrint!.id,
    frameDesignId: luminaFrame!.id,
    matBoardType: "OFFWHITE_2INCH", // +$25
    orientation: "PORTRAIT",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    photoTitle: "Aurora Architectural Study",
    clientName: "Challenger Verification Client",
    clientEmail: "challenger.client@example.com",
    clientPhone: "+1 (555) 999-8877",
    notes: "Gallery UV anti-reflective glass requested.",
  });
  assert(validOrder.success, "Valid print order created");
  const expectedTotal = luminaPrint!.basePrice + luminaFrame!.priceOffset + 25.0;
  assert(validOrder.totalAmount === expectedTotal, `Total amount mathematically exact ($${expectedTotal})`);

  const createdInv = await db.milestoneInvoice.findUnique({
    where: { id: validOrder.invoiceId },
  });
  assert(createdInv !== null, "MilestoneInvoice record found in database");
  assert(createdInv?.milestoneType === "PRINT_FRAME_ORDER", "Invoice milestoneType is PRINT_FRAME_ORDER");
  assert(createdInv?.status === "PENDING", "Invoice initial status is PENDING");
  assert(validOrder.checkoutUrl === `/lumina-cine/checkout?invoiceId=${createdInv?.id}`, "Checkout URL properly routed with invoiceId");


  // ===========================================================================
  // CLEAN UP TEST RECORDS (Idempotency)
  // ===========================================================================
  console.log("\n--- Cleanup Temporary Test Records ---");
  await db.inspectionLog.deleteMany({
    where: { reservationId: { in: [res1.reservation!.id, res2.reservation!.id] } },
  });
  await db.equipmentReservation.deleteMany({
    where: { id: { in: [res1.reservation!.id, res2.reservation!.id] } },
  });
  await db.inventoryItem.deleteMany({
    where: { id: { in: [testGearItem.id, item1.item!.id, item2.item!.id] } },
  });
  await db.milestoneInvoice.delete({
    where: { id: validOrder.invoiceId },
  });
  console.log("✓ Temporary test entities cleanly purged from database.");

  console.log("\n==========================================================================");
  console.log(`🎉 ALL ${assertionsPassed} ADVERSARIAL CHALLENGES PASSED WITH ZERO FAILURES!`);
  console.log("==========================================================================");
}

runChallengerSuite()
  .catch((err) => {
    console.error("Fatal challenge error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
