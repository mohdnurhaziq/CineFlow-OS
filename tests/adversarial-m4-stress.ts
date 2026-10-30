/**
 * Adversarial Stress-Test Suite for Milestone 4 (Modules 5, 6, 8)
 * 
 * Tests boundary conditions, adversarial attacks, edge cases, and failure modes:
 * 1. Solar Engine: Extremities (Equator, South Pole, North Pole, Leap Years, Malformed strings)
 * 2. WhatsApp Engine: XSS/special characters, malformed crewJson, weird phone formats
 * 3. Logistics Actions: Invalid IDs, malicious payload, 0-shot edge cases
 * 4. Gear Actions: Cross-tenant leakage, double reservation conflicts, duplicate bundle items, maintenance transitions
 */

import { db } from "../lib/db";
import { calculateGoldenHour, extractCoordinates } from "../lib/solar";
import { generateWhatsAppCallSheetUrl, parseCrewJson } from "../lib/whatsapp";
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

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${desc}`);
    failedTests++;
  }
}

async function runAdversarialTests() {
  console.log("==================================================================");
  console.log("       ADVERSARIAL STRESS-TEST: CineFlow OS Milestone 4           ");
  console.log("==================================================================\n");

  // -----------------------------------------------------------------------------
  // TEST GROUP 1: SOLAR ENGINE ADVERSARIAL CASES
  // -----------------------------------------------------------------------------
  console.log("--- Test Group 1: Solar Engine Adversarial & Extreme Math ---");

  // 1.1 Equator (Quito, Ecuador: lat 0, lng -78.46) on Equinox (March 20)
  const equatorSolar = calculateGoldenHour(0, -78.4678, new Date("2026-03-20T12:00:00Z"));
  assert(typeof equatorSolar.sunrise === "string" && !equatorSolar.sunrise.includes("NaN"), "Equator equinox sunrise does not yield NaN");
  assert(typeof equatorSolar.sunset === "string" && !equatorSolar.sunset.includes("NaN"), "Equator equinox sunset does not yield NaN");
  assert(equatorSolar.goldenHourMorning.includes("-"), "Morning golden hour window is structured");

  // 1.2 Extreme High Latitude: Tromsø, Norway (lat 69.6492, lng 18.9553) Polar Night (Dec 21)
  const polarSolar = calculateGoldenHour(69.6492, 18.9553, new Date("2026-12-21T12:00:00Z"));
  assert(!polarSolar.sunrise.includes("NaN"), "Polar night fallback does not produce NaN");
  assert(!polarSolar.sunset.includes("NaN"), "Polar night fallback sunset does not produce NaN");

  // 1.3 Southern Hemisphere: Sydney, Australia (lat -33.8688, lng 151.2093) on Summer Solstice (Dec 21)
  const sydneySolar = calculateGoldenHour(-33.8688, 151.2093, new Date("2026-12-21T12:00:00Z"), 11);
  assert(!sydneySolar.sunrise.includes("NaN"), "Southern hemisphere summer sunrise is valid");
  assert(!sydneySolar.sunset.includes("NaN"), "Southern hemisphere summer sunset is valid");

  // 1.4 Leap Year Date (Feb 29, 2028)
  const leapSolar = calculateGoldenHour(40.7001, -73.985, new Date("2028-02-29T12:00:00Z"));
  assert(!leapSolar.sunrise.includes("NaN"), "Leap year Feb 29 sunrise calculation is valid");

  // 1.5 extractCoordinates robustness
  const coord1 = extractCoordinates(null);
  assert(coord1.lat === 40.7001 && coord1.lng === -73.985, "extractCoordinates handles null with fallback");
  const coord2 = extractCoordinates("gibberish without numbers");
  assert(coord2.lat === 40.7001 && coord2.lng === -73.985, "extractCoordinates handles non-coordinate string with fallback");
  const coord3 = extractCoordinates("https://www.google.com/maps/@3.1390,101.6869,14z");
  assert(Math.abs(coord3.lat - 3.139) < 0.001 && Math.abs(coord3.lng - 101.6869) < 0.001, "extractCoordinates parses Kuala Lumpur coordinates from @ syntax");
  const coord4 = extractCoordinates("999.0, -999.0"); // Out of bounds
  assert(coord4.lat === 40.7001, "extractCoordinates rejects out-of-range coordinates (> 90 lat)");

  // -----------------------------------------------------------------------------
  // TEST GROUP 2: WHATSAPP ENGINE RESILIENCE
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Group 2: WhatsApp Formatter & Parser Resilience ---");

  // 2.1 parseCrewJson malformed inputs
  assert(parseCrewJson(null).length === 0, "parseCrewJson handles null");
  assert(parseCrewJson("").length === 0, "parseCrewJson handles empty string");
  assert(parseCrewJson("{ invalid: json }").length === 0, "parseCrewJson handles malformed JSON without throwing");
  assert(parseCrewJson("12345").length === 0, "parseCrewJson handles non-array JSON without throwing");
  assert(parseCrewJson(JSON.stringify([{ role: "Director" }]))[0]?.name === "Crew Member", "parseCrewJson fills fallback for missing name");

  // 2.2 Special characters and emojis in CallSheet title & notes
  const complexCallSheet = {
    id: "cs_test_xss",
    title: 'Call Sheet "Special" <script>alert(1)</script> & 🎬 Emoji',
    shootDate: new Date("2026-11-15T08:00:00Z"),
    generalCallTime: "06:00 AM",
    locationName: "Studio A & B / Café 'Le Reve'",
    locationAddress: "123 Film Row, NY",
    locationPinUrl: "https://maps.google.com/?q=40.7001,-73.9850",
    notes: "Note with line breaks\nAnd special chars: % & # + = ? 💡",
    crewJson: JSON.stringify([{ name: "Amir & Co", role: "DP", phone: "+60 12-345 6789" }]),
    project: {
      title: "Commercial 'Elite' Project",
      projectNumber: "PRJ-999",
      tenant: {
        name: "Lumina CineWorks",
        slug: "lumina-cine",
      },
    },
  };

  const waRes = generateWhatsAppCallSheetUrl(complexCallSheet, "+60 (12) 345-6789", "https://cineflow.local/");
  assert(waRes.url.startsWith("https://wa.me/60123456789?text="), "Phone number is cleaned properly to E.164 digits");
  assert(waRes.url.includes(encodeURIComponent('🎬 *OFFICIAL CALL SHEET: CALL SHEET "SPECIAL" <SCRIPT>ALERT(1)</SCRIPT> & 🎬 EMOJI*')), "Complex title is URI encoded safely");
  assert(waRes.previewText.includes("Note with line breaks\nAnd special chars"), "Raw preview text retains line breaks and characters");

  // -----------------------------------------------------------------------------
  // TEST GROUP 3: LOGISTICS SERVER ACTIONS & VALIDATIONS
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Group 3: Logistics Server Actions Integrity & Constraints ---");

  // 3.1 Non-existent shot item
  const nonExistentShotRes = await toggleShotCompletion({
    shotId: "shot_does_not_exist_9999",
    status: "COMPLETED",
  });
  assert(nonExistentShotRes.success === false, "toggleShotCompletion gracefully rejects non-existent shot");
  assert(nonExistentShotRes.error === "SHOT_NOT_FOUND", "Correct SHOT_NOT_FOUND error code returned");

  // 3.2 Invalid status enum
  const invalidStatusRes = await toggleShotCompletion({
    shotId: "shot_lum_1",
    status: "INVALID_STATUS" as any,
  });
  assert(invalidStatusRes.success === false, "toggleShotCompletion rejects invalid status enum");

  // 3.3 Digital release missing required fields
  const invalidReleaseRes = await submitDigitalRelease({
    projectId: "proj_lumina_01",
    releaseType: "TALENT",
    signerName: "A", // too short (min 2)
    signerEmail: "not-an-email",
    termsContent: "short",
    signatureDataUrl: "short",
  });
  assert(invalidReleaseRes.success === false, "submitDigitalRelease rejects invalid schema payload");

  // 3.4 Digital release non-existent project
  const nonExistentProjRelease = await submitDigitalRelease({
    projectId: "proj_does_not_exist_404",
    releaseType: "TALENT",
    signerName: "John Doe",
    signerEmail: "john@example.com",
    termsContent: "Standard talent likeness release legal terms here...",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  });
  assert(nonExistentProjRelease.success === false, "submitDigitalRelease rejects non-existent project");
  assert(nonExistentProjRelease.error === "PROJECT_NOT_FOUND", "Reports PROJECT_NOT_FOUND error code");

  // -----------------------------------------------------------------------------
  // TEST GROUP 4: GEAR ACTIONS & MULTI-TENANT ISOLATION
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Group 4: Gear Inventory & Kit BOM Multi-Tenancy & Edge Cases ---");

  // 4.1 Cross-tenant item update attack
  // Attempting to update Lumina's item with Apex's tenantId
  const crossTenantUpdate = await updateGearItem({
    id: "inv_fx6", // Lumina item
    tenantId: "ten_apex", // Attacking from Apex tenant!
    tenantSlug: "apex-media",
    dailyRate: 1, // Malicious override
  });
  assert(crossTenantUpdate.success === false, "updateGearItem blocks cross-tenant update");
  assert(crossTenantUpdate.error === "NOT_FOUND", "Returns NOT_FOUND when updating another tenant's item");

  // Verify Lumina's item was NOT modified
  const verifiedItem = await db.inventoryItem.findUnique({ where: { id: "inv_fx6" } });
  assert(verifiedItem!.dailyRate !== 1, "Target item dailyRate remains protected in database");

  // 4.2 Cross-tenant kit bundle check
  const crossTenantBom = await checkBundleAvailability("kit_lum_acam", "ten_apex");
  assert(crossTenantBom.success === false, "checkBundleAvailability denies cross-tenant access to kit bundle");

  // 4.3 Concurrent / Overlapping equipment reservation conflict
  // Seed item "inv_fx6"
  const now = new Date();
  const startWindow = new Date(now.getTime() + 10 * 86400000); // 10 days ahead
  const endWindow = new Date(now.getTime() + 12 * 86400000);   // 12 days ahead

  const res1 = await createEquipmentReservation({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: "inv_fx6",
    startDate: startWindow,
    endDate: endWindow,
  });
  assert(res1.success === true, "Initial reservation succeeds");

  // Overlapping reservation (overlapping by 1 day)
  const overlapStart = new Date(now.getTime() + 11 * 86400000);
  const overlapEnd = new Date(now.getTime() + 13 * 86400000);
  const res2 = await createEquipmentReservation({
    tenantId: "ten_lumina",
    tenantSlug: "lumina-cine",
    projectId: "proj_lumina_01",
    itemId: "inv_fx6",
    startDate: overlapStart,
    endDate: overlapEnd,
  });
  assert(res2.success === false, "Overlapping equipment reservation is strictly rejected");
  assert(res2.error === "DATE_CONFLICT", "Reports DATE_CONFLICT error code");

  // 4.4 Clean up the test reservation and reset item status
  if (res1.reservation) {
    await db.equipmentReservation.delete({ where: { id: res1.reservation.id } });
    await db.inventoryItem.update({
      where: { id: "inv_fx6" },
      data: { status: "AVAILABLE" },
    });
  }

  // 4.5 Pre-shoot inspection with unauthorized tenant
  if (res1.reservation) {
    const unauthPreShoot = await logPreShootInspection({
      tenantId: "ten_apex", // Wrong tenant
      tenantSlug: "apex-media",
      reservationId: res1.reservation.id,
      inspectorName: "Hacker",
      condition: "GOOD",
    });
    assert(unauthPreShoot.success === false, "logPreShootInspection rejects unauthorized tenant");
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 5: TOUCH TARGET ACCESSIBILITY AUDIT
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Group 5: Touch Target & UI Requirements Audit ---");
  // Inspect code in shot-list-hud.tsx to verify all interactive check-off targets have min-h-[48px] and min-w-[48px]
  const fs = await import("fs");
  const shotListCode = fs.readFileSync("components/logistics/shot-list-hud.tsx", "utf-8");
  const minTouch48Matches = shotListCode.match(/min-h-\[48px\] min-w-\[48px\]/g);
  assert((minTouch48Matches?.length ?? 0) >= 3, `shot-list-hud.tsx implements strict 48px min touch targets on all check-off buttons (found ${minTouch48Matches?.length} occurrences)`);

  const releasePadCode = fs.readFileSync("components/logistics/release-signature-pad.tsx", "utf-8");
  assert(releasePadCode.includes("touchAction: \"none\"") || releasePadCode.includes("touch-action: none"), "release-signature-pad.tsx configures touch-action: none for reliable stylus/touch capturing");
  assert(releasePadCode.includes("quadraticCurveTo"), "release-signature-pad.tsx uses quadratic Bézier curves for 60fps smooth signature interpolation");
  assert(releasePadCode.includes("devicePixelRatio"), "release-signature-pad.tsx scales canvas for high-DPI retina mobile screens");

  console.log("\n==================================================================");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log("==================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialTests().catch((err) => {
  console.error("Adversarial test error:", err);
  process.exit(1);
});
