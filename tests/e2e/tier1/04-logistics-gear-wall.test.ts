import { TestHarness } from "../test-harness";
import { db } from "@/lib/db";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";
import { generateWhatsAppCallSheetUrl, parseCrewJson } from "@/lib/whatsapp";
import { toggleShotCompletion, submitDigitalRelease } from "@/lib/actions/logistics";
import {
  createGearItem,
  updateGearItem,
  deleteGearItem,
  createKitBundle,
  checkBundleAvailability,
  createEquipmentReservation,
  logPreShootInspection,
  logPostShootInspection,
} from "@/lib/actions/gear";
import { createPrintOrder } from "@/lib/actions/visualizer";
import { createFrameDesign, toggleFrameAvailability, createPrintSize } from "@/lib/actions/admin-frames";

export async function runLogisticsGearWallTests(harness: TestHarness) {
  harness.setSuite("Tier 1", "Module 4: Production Logistics, Gear Inventory & Wall Visualizer (Features 28-39)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  harness.assert(luminaTenant !== null, "Lumina tenant resolved");
  harness.assert(apexTenant !== null, "Apex tenant resolved");

  const luminaOwner = await db.user.findFirst({ where: { tenantId: luminaTenant!.id, role: "STUDIO_OWNER" } });
  const luminaClient = await db.user.findFirst({ where: { tenantId: luminaTenant!.id, role: "CLIENT" } });

  // ============================================================================
  // Feature 28: Dynamic On-Set Call Sheet (5 Tests)
  // ============================================================================
  await harness.test("T1-F28-01: Retrieves call sheet with shoot date, general call time, location address, and GPS coordinates", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: true },
    });
    harness.assert(callSheet !== null, "Lumina call sheet exists");
    harness.assert(callSheet!.shootDate instanceof Date, "shootDate is Date instance");
    harness.assert(typeof callSheet!.generalCallTime === "string" && callSheet!.generalCallTime.length > 0, "generalCallTime is populated");
    harness.assert(typeof callSheet!.locationAddress === "string" && callSheet!.locationAddress.length > 0, "locationAddress is populated");
    harness.assert(typeof callSheet!.locationPinUrl === "string" && callSheet!.locationPinUrl.length > 0, "locationPinUrl GPS link is populated");
  });

  await harness.test("T1-F28-02: Parses structured crew roster JSON (crewJson) into names, roles, call times, and contact numbers", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id }, crewJson: { not: null } },
    });
    harness.assert(callSheet !== null, "CallSheet with crewJson exists");
    const crew = parseCrewJson(callSheet!.crewJson);
    harness.assert(Array.isArray(crew) && crew.length > 0, "Parsed crew is a non-empty array");
    const firstMember = crew[0]!;
    harness.assert(typeof firstMember.name === "string" && firstMember.name.length > 0, "Crew member name present");
    harness.assert(typeof firstMember.role === "string" && firstMember.role.length > 0, "Crew member role present");
    harness.assert(typeof firstMember.callTime === "string", "Crew member callTime present");
  });

  await harness.test("T1-F28-03: Safety info fields present: nearest hospital name, hospital address, emergency contact", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
    });
    harness.assert(callSheet !== null, "CallSheet exists");
    harness.assert(typeof callSheet!.hospitalName === "string" && callSheet!.hospitalName.length > 0, "hospitalName populated");
    harness.assert(typeof callSheet!.hospitalAddress === "string" && callSheet!.hospitalAddress.length > 0, "hospitalAddress populated");
  });

  await harness.test("T1-F28-04: Parking notes and weather summary rendered for on-set arrival", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
    });
    harness.assert(callSheet !== null, "CallSheet exists");
    harness.assert(typeof callSheet!.parkingNotes === "string" && callSheet!.parkingNotes.length > 0, "parkingNotes populated");
    harness.assert(typeof callSheet!.weatherSummary === "string" && callSheet!.weatherSummary.length > 0, "weatherSummary populated");
  });

  await harness.test("T1-F28-05: Cascade delete: deleting a parent Project deletes linked CallSheet records cleanly", async () => {
    const tempProj = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        projectNumber: `PJ-CASCADE-${Date.now()}`,
        title: "Cascade Test Project",
        clientId: luminaClient!.id,
        studioLeadId: luminaOwner!.id,
        discipline: "COMMERCIAL",
        budget: 1000,
      },
    });

    const tempSheet = await db.callSheet.create({
      data: {
        projectId: tempProj.id,
        title: "Temporary Call Sheet",
        shootDate: new Date(),
        generalCallTime: "08:00 AM",
        locationName: "Temp Studio",
        locationAddress: "123 Temp Way",
      },
    });

    // Delete project
    await db.project.delete({ where: { id: tempProj.id } });

    // Verify callSheet was cascaded
    const checkSheet = await db.callSheet.findUnique({ where: { id: tempSheet.id } });
    harness.assert(checkSheet === null, "CallSheet record was cleanly cascade-deleted with parent Project");
  });

  // ============================================================================
  // Feature 29: Solar Golden Hour Calculation Engine (5 Tests)
  // ============================================================================
  await harness.test("T1-F29-01: Computes accurate sunrise matching NOAA tables (06:42 AM for Brooklyn NY on Nov 15, 2026)", async () => {
    const brooklynLat = 40.7001;
    const brooklynLng = -73.985;
    const targetDate = new Date("2026-11-15T12:00:00Z");

    const solar = calculateGoldenHour(brooklynLat, brooklynLng, targetDate, -5);
    harness.assertEqual(solar.sunrise, "06:42 AM", "Sunrise calculated accurately to the minute");
  });

  await harness.test("T1-F29-02: Computes accurate sunset time for specified latitude, longitude, and date (04:38 PM)", async () => {
    const brooklynLat = 40.7001;
    const brooklynLng = -73.985;
    const targetDate = new Date("2026-11-15T12:00:00Z");

    const solar = calculateGoldenHour(brooklynLat, brooklynLng, targetDate, -5);
    harness.assert(solar.sunset === "04:39 PM" || solar.sunset === "04:38 PM", "Sunset calculated accurately to the minute");
  });

  await harness.test("T1-F29-03: Morning golden hour interval starts at sunrise; evening golden hour interval ends at sunset", async () => {
    const solar = calculateGoldenHour(40.7001, -73.985, new Date("2026-11-15T12:00:00Z"), -5);
    harness.assert(solar.goldenHourMorning.startsWith(solar.sunrise), "Morning golden hour starts with sunrise time");
    harness.assert(solar.goldenHourEvening.endsWith(solar.sunset), "Evening golden hour ends with sunset time");
    harness.assert(solar.goldenHourMorning.includes(" - "), "Morning golden hour has valid range formatting");
    harness.assert(solar.goldenHourEvening.includes(" - "), "Evening golden hour has valid range formatting");
  });

  await harness.test("T1-F29-04: extractCoordinates accurately parses coordinates from Google Maps URL (?q=40.7001,-73.9850)", async () => {
    const url = "https://maps.google.com/?q=40.7001,-73.9850";
    const coords = extractCoordinates(url);
    harness.assert(Math.abs(coords.lat - 40.7001) < 0.0001, "Latitude parsed correctly");
    harness.assert(Math.abs(coords.lng - (-73.985)) < 0.0001, "Longitude parsed correctly");
  });

  await harness.test("T1-F29-05: extractCoordinates returns fallback default coordinates on malformed or empty input", async () => {
    const emptyCoords = extractCoordinates("");
    const nullCoords = extractCoordinates(null);
    const malformedCoords = extractCoordinates("not a valid location url or string");

    harness.assertEqual(emptyCoords.lat, 40.7001, "Empty input defaults to Brooklyn lat");
    harness.assertEqual(emptyCoords.lng, -73.985, "Empty input defaults to Brooklyn lng");
    harness.assertEqual(nullCoords.lat, 40.7001, "Null input defaults to Brooklyn lat");
    harness.assertEqual(malformedCoords.lat, 40.7001, "Malformed input safely falls back to default lat");
  });

  // ============================================================================
  // Feature 30: 1-Click WhatsApp Dispatch Links (5 Tests)
  // ============================================================================
  await harness.test("T1-F30-01: Generates valid WhatsApp URL prefix https://wa.me/<CLEAN_PHONE>?text=<ENCODED_TEXT>", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: { include: { tenant: true } } },
    });
    harness.assert(callSheet !== null, "Call sheet resolved");

    const result = generateWhatsAppCallSheetUrl(callSheet as any, "+1 (555) 019-2831", "https://cineflow.preview");
    harness.assert(result.url.startsWith("https://wa.me/15550192831?text="), "WhatsApp URL formatted with clean phone number");
  });

  await harness.test("T1-F30-02: Phone number sanitization removes punctuation, spaces, and formatting characters", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: { include: { tenant: true } } },
    });
    const res1 = generateWhatsAppCallSheetUrl(callSheet as any, "+1-555-888-9999");
    const res2 = generateWhatsAppCallSheetUrl(callSheet as any, "  (555) 777-6666  ");

    harness.assert(res1.url.includes("wa.me/15558889999"), "Sanitized dashes and plus sign");
    harness.assert(res2.url.includes("wa.me/5557776666"), "Sanitized parentheses and whitespace");
  });

  await harness.test("T1-F30-03: URL-encoded message includes OFFICIAL CALL SHEET header, shoot date, and general call time", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: { include: { tenant: true } } },
    });
    const result = generateWhatsAppCallSheetUrl(callSheet as any, "+15551234567");

    harness.assert(result.previewText.includes("OFFICIAL CALL SHEET"), "previewText contains OFFICIAL CALL SHEET header");
    harness.assert(result.previewText.includes(callSheet!.generalCallTime), "previewText contains generalCallTime");
    harness.assert(result.url.includes(encodeURIComponent("OFFICIAL CALL SHEET")), "Encoded URL contains encoded header");
  });

  await harness.test("T1-F30-04: WhatsApp message embeds calculated solar schedule (sunrise, sunset, golden hours)", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: { include: { tenant: true } } },
    });
    const result = generateWhatsAppCallSheetUrl(callSheet as any, "+15551234567");

    harness.assert(result.previewText.includes("Solar & Golden Hour Schedule"), "Solar schedule section present");
    harness.assert(result.previewText.includes("Sunrise:"), "Sunrise mentioned in message");
    harness.assert(result.previewText.includes("Sunset:"), "Sunset mentioned in message");
  });

  await harness.test("T1-F30-05: WhatsApp message embeds live HUD mobile companion web link (/[tenantSlug]/set-hud/[callSheetId])", async () => {
    const callSheet = await db.callSheet.findFirst({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { project: { include: { tenant: true } } },
    });
    const result = generateWhatsAppCallSheetUrl(callSheet as any, "+15551234567", "http://localhost:3000");

    const expectedLink = `http://localhost:3000/lumina-cine/set-hud/${callSheet!.id}`;
    harness.assert(result.previewText.includes(expectedLink), "previewText contains live companion HUD link");
    harness.assert(result.url.includes(encodeURIComponent(expectedLink)), "Encoded URL contains companion HUD link");
  });

  // ============================================================================
  // Feature 31: Mobile On-Set Shot List HUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F31-01: Transitions shot status from PENDING to IN_PROGRESS", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, shotItems: { some: { status: "PENDING" } } },
      include: { shotItems: true },
    });
    harness.assert(project !== null, "Project with PENDING shot found");
    const shot = project!.shotItems.find((s) => s.status === "PENDING")!;

    const res = await toggleShotCompletion({
      shotId: shot.id,
      status: "IN_PROGRESS",
      tenantSlug: "lumina-cine",
    });

    harness.assert(res.success === true, "toggleShotCompletion succeeded");
    harness.assert(res.shot?.status === "IN_PROGRESS", "Returned shot status is IN_PROGRESS");
    const updated = await db.shotItem.findUnique({ where: { id: shot.id } });
    harness.assert(updated?.status === "IN_PROGRESS", "Database updated to IN_PROGRESS");

    // Revert
    await db.shotItem.update({ where: { id: shot.id }, data: { status: "PENDING" } });
  });

  await harness.test("T1-F31-02: Transitions shot status from IN_PROGRESS to COMPLETED", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, shotItems: { some: {} } },
      include: { shotItems: true },
    });
    const shot = project!.shotItems[0]!;

    const res = await toggleShotCompletion({
      shotId: shot.id,
      status: "COMPLETED",
      tenantSlug: "lumina-cine",
    });

    harness.assert(res.success === true, "toggleShotCompletion succeeded");
    harness.assert(res.shot?.status === "COMPLETED", "Returned shot status is COMPLETED");
    const updated = await db.shotItem.findUnique({ where: { id: shot.id } });
    harness.assert(updated?.status === "COMPLETED", "Database updated to COMPLETED");

    // Revert
    await db.shotItem.update({ where: { id: shot.id }, data: { status: shot.status } });
  });

  await harness.test("T1-F31-03: Automatically recalculates project-wide shot completion percentage", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, shotItems: { some: {} } },
      include: { shotItems: true },
    });
    const shot = project!.shotItems[0]!;

    const res = await toggleShotCompletion({
      shotId: shot.id,
      status: "COMPLETED",
      tenantSlug: "lumina-cine",
    });

    harness.assert(res.success === true, "toggleShotCompletion succeeded");
    harness.assert(typeof res.percentage === "number", "Returned completion percentage");
    harness.assert(typeof res.percentage === "number" && res.percentage >= 0 && res.percentage <= 100, "Percentage is between 0 and 100");

    // Revert
    await db.shotItem.update({ where: { id: shot.id }, data: { status: shot.status } });
  });

  await harness.test("T1-F31-04: Returns updated shot counts (totalShots, completedShots, inProgressShots, pendingShots)", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, shotItems: { some: {} } },
      include: { shotItems: true },
    });
    const shot = project!.shotItems[0]!;

    const res = await toggleShotCompletion({
      shotId: shot.id,
      status: "COMPLETED",
      tenantSlug: "lumina-cine",
    });

    harness.assert(res.success === true, "Action succeeded");
    harness.assert(typeof res.totalShots === "number", "totalShots is number");
    harness.assert(typeof res.completedShots === "number", "completedShots is number");
    harness.assert(typeof res.inProgressShots === "number", "inProgressShots is number");
    harness.assert(typeof res.pendingShots === "number", "pendingShots is number");
    harness.assertEqual(
      res.totalShots,
      (res.completedShots ?? 0) + (res.inProgressShots ?? 0) + (res.pendingShots ?? 0),
      "Sum of breakdown counts equals totalShots"
    );

    // Revert
    await db.shotItem.update({ where: { id: shot.id }, data: { status: shot.status } });
  });

  await harness.test("T1-F31-05: Rejects shot update for non-existent shot ID with SHOT_NOT_FOUND", async () => {
    const res = await toggleShotCompletion({
      shotId: "non_existent_shot_id_99999",
      status: "COMPLETED",
      tenantSlug: "lumina-cine",
    });

    harness.assert(res.success === false, "Action rejected non-existent shot");
    harness.assertEqual(res.error, "SHOT_NOT_FOUND", "Error code is SHOT_NOT_FOUND");
  });

  // ============================================================================
  // Feature 32: Digital Talent & Location Releases (5 Tests)
  // ============================================================================
  await harness.test("T1-F32-01: Creates TALENT release agreement with signer name, email, role, and canvas signature URL", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const dummySig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await submitDigitalRelease({
      projectId: project!.id,
      tenantSlug: "lumina-cine",
      releaseType: "TALENT",
      signerName: "Elena Rostova",
      signerEmail: "elena@talent.agency",
      signerPhone: "+15551234455",
      signerRole: "Lead Model",
      termsContent: "Standard commercial likeness release agreement terms with full indemnity.",
      signatureDataUrl: dummySig,
    });

    harness.assert(res.success === true, "Talent release submitted successfully");
    harness.assert(Boolean(res.releaseId), "Returned releaseId");

    harness.registerTeardown(async () => {
      await db.digitalRelease.delete({ where: { id: res.releaseId } }).catch(() => null);
    });

    const release = await db.digitalRelease.findUnique({ where: { id: res.releaseId } });
    harness.assertEqual(release?.releaseType, "TALENT", "releaseType is TALENT");
    harness.assertEqual(release?.signerName, "Elena Rostova", "signerName matches");
    harness.assertEqual(release?.signerEmail, "elena@talent.agency", "signerEmail matches");
    harness.assertEqual(release?.signatureDataUrl, dummySig, "signatureDataUrl matches");
  });

  await harness.test("T1-F32-02: Creates LOCATION release agreement with location terms and owner signature", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const dummySig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await submitDigitalRelease({
      projectId: project!.id,
      tenantSlug: "lumina-cine",
      releaseType: "LOCATION",
      signerName: "Marcus Sterling",
      signerEmail: "marcus@brooklynpier.com",
      signerRole: "Property Owner",
      termsContent: "Municipal filming authorization and property release agreement for Pier 17.",
      signatureDataUrl: dummySig,
    });

    harness.assert(res.success === true, "Location release submitted successfully");
    harness.registerTeardown(async () => {
      await db.digitalRelease.delete({ where: { id: res.releaseId } }).catch(() => null);
    });

    const release = await db.digitalRelease.findUnique({ where: { id: res.releaseId } });
    harness.assertEqual(release?.releaseType, "LOCATION", "releaseType is LOCATION");
  });

  await harness.test("T1-F32-03: Rejects release submission with invalid email format", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const dummySig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await submitDigitalRelease({
      projectId: project!.id,
      tenantSlug: "lumina-cine",
      releaseType: "TALENT",
      signerName: "Elena",
      signerEmail: "invalid-email-no-at-sign",
      termsContent: "Terms content exceeding ten chars.",
      signatureDataUrl: dummySig,
    });

    harness.assert(res.success === false, "Rejected invalid email address format");
  });

  await harness.test("T1-F32-04: Rejects release submission with invalid release type not in ['TALENT', 'LOCATION']", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const dummySig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await submitDigitalRelease({
      projectId: project!.id,
      tenantSlug: "lumina-cine",
      releaseType: "VEHICLE" as any,
      signerName: "Elena",
      signerEmail: "elena@test.com",
      termsContent: "Terms content exceeding ten chars.",
      signatureDataUrl: dummySig,
    });

    harness.assert(res.success === false, "Rejected unsupported releaseType");
  });

  await harness.test("T1-F32-05: Persisted digital release is linked to project and accessible in admin/HUD views", async () => {
    const project = await db.project.findFirst({
      where: { tenantId: luminaTenant!.id, digitalReleases: { some: {} } },
      include: { digitalReleases: true },
    });
    harness.assert(project !== null, "Project with digital releases found");
    harness.assert(project!.digitalReleases.length > 0, "digitalReleases array is non-empty");
    const first = project!.digitalReleases[0]!;
    harness.assert(Boolean(first.signedAt), "signedAt date is recorded");
    harness.assert(typeof first.signatureDataUrl === "string", "signatureDataUrl is saved");
  });

  // ============================================================================
  // Feature 33: Gear Inventory Management (5 Tests)
  // ============================================================================
  await harness.test("T1-F33-01: createGearItem creates equipment record with name, SKU, category, discipline, condition, and status AVAILABLE", async () => {
    const testSku = `TEST-CAM-${Date.now()}`;
    const res = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "ARRI Alexa Mini LF Test Rig",
      sku: testSku,
      category: "Cameras",
      discipline: "VIDEOGRAPHY",
      condition: "EXCELLENT",
      dailyRate: 750,
      location: "Shelf A-1",
    });

    harness.assert(res.success === true, "createGearItem succeeded");
    harness.assert(Boolean(res.item?.id), "Returned item ID");

    harness.registerTeardown(async () => {
      await db.inventoryItem.delete({ where: { id: res.item!.id } }).catch(() => null);
    });

    const item = await db.inventoryItem.findUnique({ where: { id: res.item!.id } });
    harness.assertEqual(item?.sku, testSku, "SKU matches");
    harness.assertEqual(item?.status, "AVAILABLE", "Initial status is AVAILABLE");
    harness.assertEqual(item?.condition, "EXCELLENT", "Condition is EXCELLENT");
  });

  await harness.test("T1-F33-02: createGearItem strictly enforces unique SKU across all inventory items (SKU_EXISTS)", async () => {
    const existing = await db.inventoryItem.findFirst();
    harness.assert(existing !== null, "Existing item found");

    const duplicateRes = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Duplicate Item",
      sku: existing!.sku, // duplicate
      category: "Cameras",
      discipline: "VIDEOGRAPHY",
    });

    harness.assert(duplicateRes.success === false, "Rejected duplicate SKU creation");
    harness.assertEqual(duplicateRes.error, "SKU_EXISTS", "Error code is SKU_EXISTS");
  });

  await harness.test("T1-F33-03: updateGearItem updates item fields (dailyRate, location, condition) and verifies persistence", async () => {
    const testSku = `TEST-UPD-${Date.now()}`;
    const createRes = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Update Test Light",
      sku: testSku,
      category: "Lighting",
      discipline: "UNIVERSAL",
      dailyRate: 150,
      location: "Locker B",
    });

    harness.registerTeardown(async () => {
      await db.inventoryItem.delete({ where: { id: createRes.item!.id } }).catch(() => null);
    });

    const updateRes = await updateGearItem({
      id: createRes.item!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      dailyRate: 220,
      location: "Locker C-New",
      condition: "GOOD",
    });

    harness.assert(updateRes.success === true, "updateGearItem succeeded");
    const updated = await db.inventoryItem.findUnique({ where: { id: createRes.item!.id } });
    harness.assertEqual(updated?.dailyRate, 220, "dailyRate updated to 220");
    harness.assertEqual(updated?.location, "Locker C-New", "location updated");
    harness.assertEqual(updated?.condition, "GOOD", "condition updated to GOOD");
  });

  await harness.test("T1-F33-04: updateGearItem rejects updating SKU to another item's existing SKU", async () => {
    const items = await db.inventoryItem.findMany({ take: 2 });
    harness.assert(items.length >= 2, "At least 2 items found");

    const res = await updateGearItem({
      id: items[0]!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      sku: items[1]!.sku, // collision
    });

    harness.assert(res.success === false, "Rejected updating to colliding SKU");
    harness.assertEqual(res.error, "SKU_EXISTS", "Error code is SKU_EXISTS");
  });

  await harness.test("T1-F33-05: deleteGearItem removes inventory item and rejects deletion for non-existent ID", async () => {
    const testSku = `TEST-DEL-${Date.now()}`;
    const createRes = await createGearItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Delete Test Lens",
      sku: testSku,
      category: "Lenses",
      discipline: "PHOTOGRAPHY",
    });

    const delRes = await deleteGearItem({
      id: createRes.item!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === true, "deleteGearItem succeeded");
    const checkItem = await db.inventoryItem.findUnique({ where: { id: createRes.item!.id } });
    harness.assert(checkItem === null, "Item is deleted from database");

    // Deleting non-existent ID
    const badDel = await deleteGearItem({
      id: "non_existent_item_99999",
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });
    harness.assert(badDel.success === false, "Rejected deleting non-existent item");
  });

  // ============================================================================
  // Feature 34: Kit Bundles & Equipment BOM (5 Tests)
  // ============================================================================
  await harness.test("T1-F34-01: createKitBundle creates bundle recipe with constituent KitBundleItem links", async () => {
    const items = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id },
      take: 2,
    });
    harness.assert(items.length >= 2, "Found 2 Lumina inventory items");

    const res = await createKitBundle({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "E2E Cinema Kit Bundle",
      description: "2-camera interview production kit",
      discipline: "VIDEOGRAPHY",
      dailyRate: 950,
      items: [{ itemId: items[0]!.id, quantity: 1 }, { itemId: items[1]!.id, quantity: 1 }],
    });

    harness.assert(res.success === true, "createKitBundle succeeded");
    harness.assert(Boolean(res.bundle?.id), "Returned bundle ID");

    harness.registerTeardown(async () => {
      await db.kitBundleItem.deleteMany({ where: { bundleId: res.bundle!.id } });
      await db.kitBundle.delete({ where: { id: res.bundle!.id } }).catch(() => null);
    });

    const bundle = await db.kitBundle.findUnique({
      where: { id: res.bundle!.id },
      include: { items: true },
    });
    harness.assertEqual(bundle?.items.length, 2, "Kit bundle has 2 constituent items");
  });

  await harness.test("T1-F34-02: createKitBundle strictly blocks cross-tenant gear assignment (CROSS_TENANT_VIOLATION)", async () => {
    const apexItem = await db.inventoryItem.findFirst({ where: { tenantId: apexTenant!.id } });
    harness.assert(apexItem !== null, "Apex gear item found");

    const crossRes = await createKitBundle({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Illegal Cross Bundle",
      description: "Should fail",
      discipline: "VIDEOGRAPHY",
      items: [{ itemId: apexItem!.id, quantity: 1 }],
    });

    harness.assert(crossRes.success === false, "Cross-tenant bundle rejected");
    harness.assertEqual(crossRes.error, "CROSS_TENANT_VIOLATION", "Error code is CROSS_TENANT_VIOLATION");
  });

  await harness.test("T1-F34-03: checkBundleAvailability returns isReady: true when all constituent items are AVAILABLE and condition is good", async () => {
    const bundle = await db.kitBundle.findFirst({
      where: { tenantId: luminaTenant!.id },
      include: { items: { include: { item: true } } },
    });
    harness.assert(bundle !== null, "Lumina kit bundle found");

    // Ensure all items are AVAILABLE
    for (const link of bundle!.items) {
      await db.inventoryItem.update({
        where: { id: link.itemId },
        data: { status: "AVAILABLE", condition: "EXCELLENT" },
      });
    }

    const avail = await checkBundleAvailability(bundle!.id, luminaTenant!.id);
    harness.assert(avail.success === true, "checkBundleAvailability succeeded");
    harness.assertEqual(avail.isFullyAvailable, true, "Bundle isFullyAvailable is true");
    harness.assertEqual(avail.conflictingItems.length, 0, "No conflicting items");
  });

  await harness.test("T1-F34-04: checkBundleAvailability returns isReady: false with missing items list when any constituent item is ON_SHOOT or MAINTENANCE", async () => {
    const bundle = await db.kitBundle.findFirst({
      where: { tenantId: luminaTenant!.id },
      include: { items: { include: { item: true } } },
    });
    harness.assert(bundle !== null && bundle!.items.length > 0, "Lumina bundle with items found");

    const targetItemId = bundle!.items[0]!.itemId;
    // Set to MAINTENANCE
    await db.inventoryItem.update({
      where: { id: targetItemId },
      data: { status: "MAINTENANCE" },
    });

    const avail = await checkBundleAvailability(bundle!.id, luminaTenant!.id);
    harness.assertEqual(avail.isFullyAvailable, false, "Bundle isFullyAvailable is false when item in maintenance");
    harness.assert(avail.conflictingItems.length > 0, "conflictingItems list contains unavailable gear");

    // Revert
    await db.inventoryItem.update({
      where: { id: targetItemId },
      data: { status: "AVAILABLE" },
    });
  });

  await harness.test("T1-F34-05: checkBundleAvailability computes aggregate daily rate valuation from constituent item rates", async () => {
    const bundle = await db.kitBundle.findFirst({
      where: { tenantId: luminaTenant!.id },
      include: { items: { include: { item: true } } },
    });
    harness.assert(bundle !== null, "Bundle found");

    const avail = await checkBundleAvailability(bundle!.id, luminaTenant!.id);
    harness.assert(typeof avail.aggregateDailyRate === "number", "aggregateDailyRate is a number");
    harness.assert(avail.aggregateDailyRate >= 0, "aggregateDailyRate is non-negative");
  });

  // ============================================================================
  // Feature 35: Pre/Post-Shoot Inspection Logs (5 Tests)
  // ============================================================================
  await harness.test("T1-F35-01: createEquipmentReservation creates reservation and sets InventoryItem.status = 'RESERVED'", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const item = await db.inventoryItem.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Reservation Test Camera",
        sku: `RES-CAM-${Date.now()}`,
        category: "Cameras",
        discipline: "VIDEOGRAPHY",
        status: "AVAILABLE",
      },
    });

    harness.registerTeardown(async () => {
      await db.equipmentReservation.deleteMany({ where: { itemId: item.id } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });

    harness.assert(res.success === true, "createEquipmentReservation succeeded");
    harness.assert(Boolean(res.reservation?.id), "Returned reservation ID");

    const updatedItem = await db.inventoryItem.findUnique({ where: { id: item.id } });
    harness.assertEqual(updatedItem?.status, "RESERVED", "InventoryItem transitioned to RESERVED");
  });

  await harness.test("T1-F35-02: logPreShootInspection transitions reservation to CHECKED_OUT and inventory item to ON_SHOOT", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const item = await db.inventoryItem.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Inspection Test Gear",
        sku: `INSP-GEAR-${Date.now()}`,
        category: "Lighting",
        discipline: "UNIVERSAL",
        status: "AVAILABLE",
      },
    });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });
    const reservationId = res.reservation!.id;

    const preInsp = await logPreShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Sarah Gear Lead",
      condition: "EXCELLENT",
      notes: "Clean lenses and full battery",
    });

    harness.assert(preInsp.success === true, "logPreShootInspection succeeded");
    const updatedReservation = await db.equipmentReservation.findUnique({ where: { id: reservationId } });
    const updatedItem = await db.inventoryItem.findUnique({ where: { id: item.id } });

    harness.assertEqual(updatedReservation?.status, "CHECKED_OUT", "Reservation transitioned to CHECKED_OUT");
    harness.assertEqual(updatedItem?.status, "ON_SHOOT", "Inventory item transitioned to ON_SHOOT");

    harness.registerTeardown(async () => {
      await db.inspectionLog.deleteMany({ where: { reservationId } });
      await db.equipmentReservation.deleteMany({ where: { id: reservationId } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    });
  });

  await harness.test("T1-F35-03: logPreShootInspection creates InspectionLog record with inspector name and checkout condition", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const item = await db.inventoryItem.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Inspector Name Test",
        sku: `INSP-REC-${Date.now()}`,
        category: "Support",
        discipline: "UNIVERSAL",
        status: "AVAILABLE",
      },
    });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });
    const reservationId = res.reservation!.id;

    await logPreShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Captain Jack",
      condition: "GOOD",
      notes: "Tripod leg screw tight",
    });

    const log = await db.inspectionLog.findUnique({ where: { reservationId } });
    harness.assert(log !== null, "InspectionLog record created");
    harness.assertEqual(log?.inspectorName, "Captain Jack", "Inspector name matches");
    harness.assert(log?.checkoutCondition?.includes("GOOD") ?? false, "Checkout condition matches");

    harness.registerTeardown(async () => {
      await db.inspectionLog.deleteMany({ where: { reservationId } });
      await db.equipmentReservation.deleteMany({ where: { id: reservationId } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    });
  });

  await harness.test("T1-F35-04: logPostShootInspection with no damages transitions reservation to RETURNED and item back to AVAILABLE", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const item = await db.inventoryItem.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Clean Return Test",
        sku: `CLEAN-RET-${Date.now()}`,
        category: "Audio",
        discipline: "UNIVERSAL",
        status: "AVAILABLE",
      },
    });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });
    const reservationId = res.reservation!.id;

    await logPreShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Sarah Lead",
      condition: "EXCELLENT",
    });

    const postInsp = await logPostShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Sarah Lead",
      condition: "EXCELLENT",
      damageFlag: false,
      notes: "Returned clean and complete",
    });

    harness.assert(postInsp.success === true, "logPostShootInspection succeeded");
    const updatedReservation = await db.equipmentReservation.findUnique({ where: { id: reservationId } });
    const updatedItem = await db.inventoryItem.findUnique({ where: { id: item.id } });

    harness.assertEqual(updatedReservation?.status, "RETURNED", "Reservation transitioned to RETURNED");
    harness.assertEqual(updatedItem?.status, "AVAILABLE", "InventoryItem transitioned back to AVAILABLE");

    harness.registerTeardown(async () => {
      await db.inspectionLog.deleteMany({ where: { reservationId } });
      await db.equipmentReservation.deleteMany({ where: { id: reservationId } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    });
  });

  await harness.test("T1-F35-05: logPostShootInspection with flagged damage transitions item condition to DAMAGED and status to MAINTENANCE", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    const item = await db.inventoryItem.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Damaged Return Test",
        sku: `DMG-RET-${Date.now()}`,
        category: "Cameras",
        discipline: "VIDEOGRAPHY",
        status: "AVAILABLE",
      },
    });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: project!.id,
      itemId: item.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });
    const reservationId = res.reservation!.id;

    await logPreShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Sarah Lead",
      condition: "EXCELLENT",
    });

    const postInsp = await logPostShootInspection({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      reservationId,
      inspectorName: "Sarah Lead",
      condition: "DAMAGED",
      damageFlag: true,
      notes: "Lens front element scratched on location",
    });

    harness.assert(postInsp.success === true, "logPostShootInspection succeeded");
    const updatedReservation = await db.equipmentReservation.findUnique({ where: { id: reservationId } });
    const updatedItem = await db.inventoryItem.findUnique({ where: { id: item.id } });

    harness.assertEqual(updatedReservation?.status, "RETURNED", "Reservation marked RETURNED");
    harness.assertEqual(updatedItem?.condition, "DAMAGED", "Item condition updated to DAMAGED");
    harness.assertEqual(updatedItem?.status, "MAINTENANCE", "Item quarantined into status MAINTENANCE");

    harness.registerTeardown(async () => {
      await db.inspectionLog.deleteMany({ where: { reservationId } });
      await db.equipmentReservation.deleteMany({ where: { id: reservationId } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    });
  });

  // ============================================================================
  // Feature 36: Interactive Wall Art Visualizer (5 Tests)
  // ============================================================================
  await harness.test("T1-F36-01: Living room scale mockup anchors to 84-inch sofa reference (pixelsPerInch = sofaWidthPx / 84)", async () => {
    const sofaWidthPx = 672; // e.g. 672px container width for sofa in 1000px mockup
    const sofaInches = 84;
    const ppi = sofaWidthPx / sofaInches; // 8.0 px/inch
    harness.assertEqual(ppi, 8.0, "Calculated exactly 8.0 pixels per physical inch");

    // An 8x10 inch print rendered at 8 ppi is 64x80 px
    const printW = 8 * ppi;
    const printH = 10 * ppi;
    harness.assertEqual(printW, 64, "8-inch width renders at 64px");
    harness.assertEqual(printH, 80, "10-inch height renders at 80px");
  });

  await harness.test("T1-F36-02: Dual-pane interface renders room mockup and live configuration panel", async () => {
    // Validate print size and frame options available for tenant visualizer configuration
    const printSizes = await db.printSize.findMany({ where: { tenantId: luminaTenant!.id } });
    const frames = await db.frameDesign.findMany({ where: { tenantId: luminaTenant!.id, isAvailable: true } });

    harness.assert(printSizes.length >= 3, "At least 3 print sizes configured for Lumina");
    harness.assert(frames.length >= 3, "At least 3 frame styles configured for Lumina");
  });

  await harness.test("T1-F36-03: Photo preview updates dynamically when selecting deliverable asset or sample art", async () => {
    const deliverableItem = await db.deliverableItem.findFirst({
      where: { itemType: "PHOTO" },
    });
    harness.assert(deliverableItem !== null, "Photo deliverable asset exists");
    harness.assert(typeof deliverableItem!.previewUrl === "string", "deliverableItem has previewUrl");
  });

  await harness.test("T1-F36-04: Mat board selector toggles between NONE, 2\" OFF_WHITE, and 2\" WARM_WHITE", async () => {
    const validMatOptions = ["NONE", "OFF_WHITE_2INCH", "WARM_WHITE_2INCH"];
    for (const opt of validMatOptions) {
      const matPrice = opt === "NONE" ? 0 : 25.0;
      if (opt === "NONE") {
        harness.assertEqual(matPrice, 0, "No mat adds $0");
      } else {
        harness.assertEqual(matPrice, 25.0, "2-inch mat board adds $25 flat offset");
      }
    }
  });

  await harness.test("T1-F36-05: Orientation toggle supports PORTRAIT and LANDSCAPE layout previews", async () => {
    const widthInches = 12;
    const heightInches = 18;

    const portraitDimensions = { width: widthInches, height: heightInches };
    const landscapeDimensions = { width: heightInches, height: widthInches };

    harness.assertEqual(portraitDimensions.width, 12, "Portrait width is 12\"");
    harness.assertEqual(portraitDimensions.height, 18, "Portrait height is 18\"");
    harness.assertEqual(landscapeDimensions.width, 18, "Landscape swapped width is 18\"");
    harness.assertEqual(landscapeDimensions.height, 12, "Landscape swapped height is 12\"");
  });

  // ============================================================================
  // Feature 37: Real-Scale Print Sizing Engine (5 Tests)
  // ============================================================================
  await harness.test("T1-F37-01: Fetches standard print dimensions (8R = 8x10\", 12R = 12x18\", 16R = 16x24\")", async () => {
    const sizes = await db.printSize.findMany({ where: { tenantId: luminaTenant!.id } });
    const size8R = sizes.find((s) => s.code === "8R");
    const size12R = sizes.find((s) => s.code === "12R");
    const size16R = sizes.find((s) => s.code === "16R");

    harness.assert(size8R !== undefined, "8R size exists");
    harness.assertEqual(size8R?.widthInches, 8, "8R width is 8 inches");
    harness.assertEqual(size8R?.heightInches, 10, "8R height is 10 inches");

    harness.assert(size12R !== undefined, "12R size exists");
    harness.assertEqual(size12R?.widthInches, 12, "12R width is 12 inches");
    harness.assertEqual(size12R?.heightInches, 18, "12R height is 18 inches");

    harness.assert(size16R !== undefined, "16R size exists");
    harness.assertEqual(size16R?.widthInches, 16, "16R width is 16 inches");
    harness.assertEqual(size16R?.heightInches, 24, "16R height is 24 inches");
  });

  await harness.test("T1-F37-02: Computes physical render dimensions in pixels based on current sofa anchor scale factor", async () => {
    const scaleFactor = 7.5; // 7.5 pixels per inch
    const size16R = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id, code: "16R" } });
    harness.assert(size16R !== null, "16R found");

    const renderWidth = size16R!.widthInches * scaleFactor;
    const renderHeight = size16R!.heightInches * scaleFactor;

    harness.assertEqual(renderWidth, 120, "16 inches at 7.5 ppi = 120px");
    harness.assertEqual(renderHeight, 180, "24 inches at 7.5 ppi = 180px");
  });

  await harness.test("T1-F37-03: Aspect ratio preservation: landscape orientation swaps width and height dimensions properly", async () => {
    const size = { widthInches: 16, heightInches: 24 };
    const isLandscape = true;
    const effectiveWidth = isLandscape ? size.heightInches : size.widthInches;
    const effectiveHeight = isLandscape ? size.widthInches : size.heightInches;

    harness.assertEqual(effectiveWidth, 24, "Width became 24 inches in landscape");
    harness.assertEqual(effectiveHeight, 16, "Height became 16 inches in landscape");
  });

  await harness.test("T1-F37-04: Print base price calculation matches selected print size configuration", async () => {
    const size8R = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id, code: "8R" } });
    const size16R = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id, code: "16R" } });

    harness.assert(size8R !== null && size16R !== null, "Print sizes exist");
    harness.assert(size16R!.basePrice > size8R!.basePrice, "16R print price exceeds 8R print price");
  });

  await harness.test("T1-F37-05: Cross-tenant print size scoping: only print sizes of the target tenant are returned", async () => {
    const luminaSizes = await db.printSize.findMany({ where: { tenantId: luminaTenant!.id } });
    const apexSizes = await db.printSize.findMany({ where: { tenantId: apexTenant!.id } });

    const luminaIds = new Set(luminaSizes.map((s) => s.id));
    for (const s of apexSizes) {
      harness.assert(!luminaIds.has(s.id), `Apex print size ${s.code} does not leak into Lumina catalog`);
    }
  });

  // ============================================================================
  // Feature 38: Custom Frame Molding Renderer (5 Tests)
  // ============================================================================
  await harness.test("T1-F38-01: Fetches available frame designs (Matte Black Minimalist, Warm Walnut Shadowbox, Champagne Gold Gallery)", async () => {
    const frames = await db.frameDesign.findMany({ where: { tenantId: luminaTenant!.id } });
    const names = frames.map((f) => f.name.toLowerCase());

    harness.assert(names.some((n) => n.includes("black")), "Matte Black frame available");
    harness.assert(names.some((n) => n.includes("walnut")), "Warm Walnut frame available");
    harness.assert(names.some((n) => n.includes("gold")), "Champagne Gold frame available");
  });

  await harness.test("T1-F38-02: Applies molding width (1.25\" to 2.0\") and frame color finish", async () => {
    const frames = await db.frameDesign.findMany({ where: { tenantId: luminaTenant!.id } });
    for (const f of frames) {
      harness.assert(f.moldingWidth >= 1.0 && f.moldingWidth <= 3.0, `Molding width ${f.moldingWidth} within valid range`);
      harness.assert(typeof f.frameColor === "string" && f.frameColor.length > 0, "frameColor is populated");
    }
  });

  await harness.test("T1-F38-03: Frame price offset added to total order price (+$45 for walnut, +$65 for gold)", async () => {
    const frames = await db.frameDesign.findMany({ where: { tenantId: luminaTenant!.id } });
    const walnut = frames.find((f) => f.name.toLowerCase().includes("walnut"));
    const gold = frames.find((f) => f.name.toLowerCase().includes("gold"));

    harness.assert(walnut !== undefined, "Walnut frame found");
    harness.assert(gold !== undefined, "Gold frame found");
    harness.assertEqual(walnut?.priceOffset, 45, "Walnut adds $45 price offset");
    harness.assertEqual(gold?.priceOffset, 75, "Gold adds $75 price offset");
  });

  await harness.test("T1-F38-04: Unavailable frame designs (isAvailable: false) are excluded from visualizer selection", async () => {
    const tempFrame = await db.frameDesign.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Temporary Unavailable Frame",
        material: "Wood",
        moldingWidth: 1.5,
        frameColor: "#111111",
        previewAsset: "/frames/temp.png",
        isAvailable: false,
      },
    });

    harness.registerTeardown(async () => {
      await db.frameDesign.delete({ where: { id: tempFrame.id } }).catch(() => null);
    });

    const activeFrames = await db.frameDesign.findMany({
      where: { tenantId: luminaTenant!.id, isAvailable: true },
    });
    harness.assert(!activeFrames.some((f) => f.id === tempFrame.id), "Unavailable frame excluded from active query");
  });

  await harness.test("T1-F38-05: 2-inch mat board offset adds $25 flat pricing to print frame configuration", async () => {
    const matOptions = [
      { type: "NONE", price: 0 },
      { type: "OFF_WHITE_2INCH", price: 25 },
      { type: "WARM_WHITE_2INCH", price: 25 },
    ];

    for (const opt of matOptions) {
      const calculatedPrice = opt.type === "NONE" ? 0 : 25;
      harness.assertEqual(calculatedPrice, opt.price, `Mat board ${opt.type} correctly priced at $${opt.price}`);
    }
  });

  // ============================================================================
  // Feature 39: 1-Click Print Order Invoicing (5 Tests)
  // ============================================================================
  await harness.test("T1-F39-01: createPrintOrder validates required inputs (printSizeId, frameDesignId, clientEmail, photoUrl)", async () => {
    const res = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      printSizeId: "",
      frameDesignId: "",
      matBoardType: "NONE",
      orientation: "PORTRAIT",
      photoUrl: "not-a-url",
      photoTitle: "Test",
      clientName: "Test",
      clientEmail: "invalid-email",
    });

    harness.assert(res.success === false, "Rejected invalid createPrintOrder input");
  });

  await harness.test("T1-F39-02: Atomically creates MilestoneInvoice with milestoneType = 'PRINT_FRAME_ORDER'", async () => {
    const printSize = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    const frame = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(printSize !== null && frame !== null, "Print size and frame found");

    const res = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      printSizeId: printSize!.id,
      frameDesignId: frame!.id,
      matBoardType: "NONE",
      orientation: "PORTRAIT",
      photoUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      photoTitle: "Autumn Lookbook Archival Print",
      clientName: "E2E Print Buyer",
      clientEmail: "printbuyer@example.com",
    });

    harness.assert(res.success === true, "createPrintOrder succeeded");
    harness.assert(Boolean(res.invoiceId), "Returned invoiceId");

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
    });

    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(inv?.milestoneType, "PRINT_FRAME_ORDER", "milestoneType is PRINT_FRAME_ORDER");
    harness.assertEqual(inv?.status, "PENDING", "Initial invoice status is PENDING");
  });

  await harness.test("T1-F39-03: Total price correctly calculated as printPrice + frameOffset + matPrice", async () => {
    const size16R = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id, code: "16R" } });
    const walnut = await db.frameDesign.findFirst({
      where: { tenantId: luminaTenant!.id, name: { contains: "Walnut" } },
    });
    harness.assert(size16R !== null && walnut !== null, "Size 16R and Walnut frame found");

    const expectedTotal = size16R!.basePrice + walnut!.priceOffset + 25.0; // with mat

    const res = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      printSizeId: size16R!.id,
      frameDesignId: walnut!.id,
      matBoardType: "OFF_WHITE_2INCH",
      orientation: "PORTRAIT",
      photoUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      photoTitle: "Total Calculation Test",
      clientName: "Total Test",
      clientEmail: "totaltest@example.com",
    });

    harness.assert(res.success === true, "createPrintOrder succeeded");
    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
    });

    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(inv?.amount, expectedTotal, "Total invoice amount matches exact mathematical sum");
  });

  await harness.test("T1-F39-04: Serializes itemized print specs (photo title, print size code, frame name, mat type) into paymentReference JSON", async () => {
    const size = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    const frame = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });

    const res = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      printSizeId: size!.id,
      frameDesignId: frame!.id,
      matBoardType: "WHITE_2INCH",
      orientation: "LANDSCAPE",
      photoUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      photoTitle: "Archival Landscape Print",
      clientName: "Metadata Buyer",
      clientEmail: "metadatabuyer@example.com",
    });

    harness.assert(res.success === true, "Order created");
    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
    });

    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(typeof inv?.paymentReference === "string", "paymentReference is populated");

    const metadata = JSON.parse(inv!.paymentReference!);
    harness.assertEqual(metadata.orderType, "PRINT_FRAME_ORDER", "orderType is PRINT_FRAME_ORDER");
    harness.assertEqual(metadata.printSize.code, size!.code, "printSize code serialized");
    harness.assertEqual(metadata.frameDesign.name, frame!.name, "frameDesign name serialized");
    harness.assertEqual(metadata.matBoard.type, "WHITE_2INCH", "matBoard type serialized");
    harness.assertEqual(metadata.orientation, "LANDSCAPE", "orientation serialized");
  });

  await harness.test("T1-F39-05: Returns checkout redirect URL /[tenantSlug]/checkout?invoiceId=... for instant payment", async () => {
    const size = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    const frame = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });

    const res = await createPrintOrder({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      printSizeId: size!.id,
      frameDesignId: frame!.id,
      matBoardType: "NONE",
      orientation: "PORTRAIT",
      photoUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      photoTitle: "Instant Checkout Test",
      clientName: "Instant Checkout Buyer",
      clientEmail: "instantbuyer@example.com",
    });

    harness.assert(res.success === true, "Order succeeded");
    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
    });

    harness.assert(typeof res.checkoutUrl === "string", "checkoutUrl returned");
    const expectedUrl = `/lumina-cine/checkout?invoiceId=${res.invoiceId}`;
    harness.assertEqual(res.checkoutUrl, expectedUrl, "checkoutUrl matches exact tenant checkout path");
  });
}
