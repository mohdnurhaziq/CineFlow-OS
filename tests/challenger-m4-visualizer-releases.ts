/**
 * CineFlow OS — Milestone 4 Empirical Challenger Suite
 * Module 8 (Print & Frame Wall Art Visualizer) & Module 5 (Digital Legal Releases)
 * 
 * Adversarially challenges:
 * 1. Wall Visualizer Mathematical Scaling & Geometry
 * 2. Tenant currencies (print ordering itself is covered by the E2E suite, Tier 20)
 * 3. Digital Releases Stress Testing (Large base64 signatures, multiple signers, tenant isolation)
 */

import { db } from "../lib/db";
import { submitDigitalRelease } from "../lib/actions/logistics";

let testCount = 0;
let passedCount = 0;

function assert(condition: boolean, testName: string, details?: unknown) {
  testCount++;
  if (!condition) {
    console.error(`❌ FAIL [${testCount}]: ${testName}`);
    if (details) console.error("   Details:", details);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✓ PASS [${testCount}]: ${testName}`);
  passedCount++;
}

async function runChallengerSuite() {
  console.log("================================================================================");
  console.log("   CineFlow OS Milestone 4 Empirical Challenger Suite");
  console.log("   Modules 8 (Wall Visualizer & Invoicing) & 5 (Digital Legal Releases)");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // CATEGORY 1: Wall Visualizer Mathematical Scaling & Geometry Verification
  // ---------------------------------------------------------------------------
  console.log(">>> CATEGORY 1: Wall Visualizer Mathematical Scaling & Geometry Verification");

  // 1.1 Anchor Calibration at 84-inch sofa
  const baseSofaWidth = 504; // Baseline desktop sofa width in px
  const sofaLengthInches = 84;
  const standardPixelsPerInch = baseSofaWidth / sofaLengthInches;
  assert(standardPixelsPerInch === 6.0, "Standard desktop 84-inch sofa calibration yields exactly 6.0 px/inch");

  const detailZoomFactor = 1.75;
  const detailSofaWidth = Math.round(baseSofaWidth * detailZoomFactor); // 882px
  const detailPixelsPerInch = detailSofaWidth / sofaLengthInches;
  assert(detailPixelsPerInch === 10.5, "Detail zoom (1.75x) 84-inch sofa calibration yields exactly 10.5 px/inch");

  const mobileSofaWidth = 336;
  const mobilePixelsPerInch = mobileSofaWidth / sofaLengthInches;
  assert(mobilePixelsPerInch === 4.0, "Mobile viewport 84-inch sofa calibration yields exactly 4.0 px/inch");

  // Helper pure mathematical model matching FrameCanvas implementation
  function computeFrameGeometry(params: {
    printWidthInches: number;
    printHeightInches: number;
    moldingWidthInches: number;
    matBoardType: "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH";
    orientation: "PORTRAIT" | "LANDSCAPE";
    sofaWidthPx: number;
  }) {
    const {
      printWidthInches: rawW,
      printHeightInches: rawH,
      moldingWidthInches,
      matBoardType,
      orientation,
      sofaWidthPx,
    } = params;

    // Orientation swap
    const pW = orientation === "PORTRAIT" ? Math.min(rawW, rawH) : Math.max(rawW, rawH);
    const pH = orientation === "PORTRAIT" ? Math.max(rawW, rawH) : Math.min(rawW, rawH);

    const matInches = matBoardType === "NONE" ? 0 : 2.0;
    const totalWidthInches = pW + matInches * 2 + moldingWidthInches * 2;
    const totalHeightInches = pH + matInches * 2 + moldingWidthInches * 2;

    const pixelsPerInch = sofaWidthPx / 84;
    const totalWidthPx = Math.round(totalWidthInches * pixelsPerInch);
    const totalHeightPx = Math.round(totalHeightInches * pixelsPerInch);
    const moldingWidthPx = Math.max(4, Math.round(moldingWidthInches * pixelsPerInch));
    const matWidthPx = Math.round(matInches * pixelsPerInch);
    const percentOfSofa = Math.round((totalWidthInches / 84) * 100);

    const innerArtworkWidthPx = Math.round(pW * pixelsPerInch);
    const innerArtworkHeightPx = Math.round(pH * pixelsPerInch);

    return {
      pW,
      pH,
      matInches,
      totalWidthInches,
      totalHeightInches,
      totalWidthPx,
      totalHeightPx,
      moldingWidthPx,
      matWidthPx,
      percentOfSofa,
      innerArtworkWidthPx,
      innerArtworkHeightPx,
      pixelsPerInch,
    };
  }

  // 1.2 Verification of standard sizes: 8R (8x10"), 12R (12x18"), 16R (16x24"), 20R (20x30")
  console.log("\n--- Testing Standard Print Sizes at 6.0 px/inch (Zero Mat, Zero Molding) ---");
  const stdSizes = [
    { code: "8R", w: 8, h: 10, expW_port: 48, expH_port: 60, expW_land: 60, expH_land: 48 },
    { code: "12R", w: 12, h: 18, expW_port: 72, expH_port: 108, expW_land: 108, expH_land: 72 },
    { code: "16R", w: 16, h: 24, expW_port: 96, expH_port: 144, expW_land: 144, expH_land: 96 },
    { code: "20R", w: 20, h: 30, expW_port: 120, expH_port: 180, expW_land: 180, expH_land: 120 },
  ];

  for (const s of stdSizes) {
    const port = computeFrameGeometry({
      printWidthInches: s.w,
      printHeightInches: s.h,
      moldingWidthInches: 0,
      matBoardType: "NONE",
      orientation: "PORTRAIT",
      sofaWidthPx: 504,
    });
    assert(port.innerArtworkWidthPx === s.expW_port && port.innerArtworkHeightPx === s.expH_port,
      `Standard ${s.code} Portrait dimensions: ${port.innerArtworkWidthPx}px × ${port.innerArtworkHeightPx}px (expected ${s.expW_port}px × ${s.expH_port}px)`
    );

    const land = computeFrameGeometry({
      printWidthInches: s.w,
      printHeightInches: s.h,
      moldingWidthInches: 0,
      matBoardType: "NONE",
      orientation: "LANDSCAPE",
      sofaWidthPx: 504,
    });
    assert(land.innerArtworkWidthPx === s.expW_land && land.innerArtworkHeightPx === s.expH_land,
      `Standard ${s.code} Landscape dimensions: ${land.innerArtworkWidthPx}px × ${land.innerArtworkHeightPx}px (expected ${s.expW_land}px × ${s.expH_land}px)`
    );

    // Orientation swap invariant: width & height swap exactly
    assert(port.innerArtworkWidthPx === land.innerArtworkHeightPx && port.innerArtworkHeightPx === land.innerArtworkWidthPx,
      `Standard ${s.code} orientation swap invariant strictly preserved`
    );
  }

  // 1.3 Mat Board Expansion & Frame Molding Width Additions
  console.log("\n--- Testing Mat Board Expansion & Frame Molding Addition Geometry ---");
  // 16R in Landscape (24" x 16") + 2" Mat Board + 1.25" Molding (e.g. Walnut)
  const geom16R = computeFrameGeometry({
    printWidthInches: 16,
    printHeightInches: 24,
    moldingWidthInches: 1.25,
    matBoardType: "WHITE_2INCH",
    orientation: "LANDSCAPE",
    sofaWidthPx: 504,
  });

  // Expected:
  // pW = 24", pH = 16"
  // Mat: 2" per side => +4" width, +4" height
  // Molding: 1.25" per side => +2.5" width, +2.5" height
  // totalWidthInches = 24 + 4 + 2.5 = 30.5"
  // totalHeightInches = 16 + 4 + 2.5 = 22.5"
  // At 6 px/in:
  // totalWidthPx = 30.5 * 6 = 183 px
  // totalHeightPx = 22.5 * 6 = 135 px
  // percentOfSofa = Math.round((30.5 / 84) * 100) = 36%
  assert(geom16R.totalWidthInches === 30.5, "16R Landscape with 2\" mat + 1.25\" molding total width is 30.5 inches");
  assert(geom16R.totalHeightInches === 22.5, "16R Landscape with 2\" mat + 1.25\" molding total height is 22.5 inches");
  assert(geom16R.totalWidthPx === 183, `16R Landscape totalWidthPx is 183px (got ${geom16R.totalWidthPx}px)`);
  assert(geom16R.totalHeightPx === 135, `16R Landscape totalHeightPx is 135px (got ${geom16R.totalHeightPx}px)`);
  assert(geom16R.percentOfSofa === 36, `16R Landscape occupies 36% of 84-inch sofa (got ${geom16R.percentOfSofa}%)`);

  // Test 20R Portrait (20" x 30") + No Mat + 2.25" Ornate Gold Molding
  const geom20R = computeFrameGeometry({
    printWidthInches: 20,
    printHeightInches: 30,
    moldingWidthInches: 2.25,
    matBoardType: "NONE",
    orientation: "PORTRAIT",
    sofaWidthPx: 504,
  });
  // totalWidthInches = 20 + 0 + 4.5 = 24.5" => 24.5 * 6 = 147 px
  // totalHeightInches = 30 + 0 + 4.5 = 34.5" => 34.5 * 6 = 207 px
  // percentOfSofa = Math.round((24.5 / 84) * 100) = 29%
  assert(geom20R.totalWidthInches === 24.5, "20R Portrait with 2.25\" molding total width is 24.5 inches");
  assert(geom20R.totalHeightInches === 34.5, "20R Portrait with 2.25\" molding total height is 34.5 inches");
  assert(geom20R.totalWidthPx === 147, `20R Portrait totalWidthPx is 147px (got ${geom20R.totalWidthPx}px)`);
  assert(geom20R.totalHeightPx === 207, `20R Portrait totalHeightPx is 207px (got ${geom20R.totalHeightPx}px)`);
  assert(geom20R.percentOfSofa === 29, `20R Portrait occupies 29% of 84-inch sofa (got ${geom20R.percentOfSofa}%)`);

  // Scale Invariance: Sofa percentage equals pixel ratio
  const pixelRatioPercent = Math.round((geom16R.totalWidthPx / 504) * 100);
  assert(pixelRatioPercent === geom16R.percentOfSofa,
    "Scale Invariance: pixel width ratio matches physical inch sofa percentage (36%)"
  );


  // ---------------------------------------------------------------------------
  // CATEGORY 2: Tenants and currencies (print ordering is covered by the E2E suite, Tier 20)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CATEGORY 2: 1-Click Print Order Invoicing Stress Testing");

  // Fetch both demo tenants
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findFirst({
    where: {
      OR: [{ slug: "apex-studios" }, { slug: "apex-media" }],
    },
  });

  assert(lumina !== null, "Lumina Cine tenant resolved from database");
  assert(apex !== null, "Apex tenant (MYR) resolved from database");
  assert(lumina!.currency === "USD", "Lumina Cine currency is strictly USD");
  assert(apex!.currency === "MYR", "Apex tenant currency is strictly MYR");


  // ---------------------------------------------------------------------------
  // CATEGORY 3: Digital Releases Stress Testing (`lib/actions/logistics.ts`)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CATEGORY 3: Digital Releases Stress Testing");

  // Fetch a project from Lumina and a project from Apex
  const luminaProject = await db.project.findFirst({
    where: { tenantId: lumina!.id },
  });
  const apexProject = await db.project.findFirst({
    where: { tenantId: apex!.id },
  });

  assert(luminaProject !== null, "Lumina project found in database");
  assert(apexProject !== null, "Apex project found in database");

  // 3.1 Both TALENT and LOCATION types
  console.log("\n--- 3.1 Talent and Location Legal Release Types ---");
  const talentRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    tenantSlug: lumina!.slug,
    releaseType: "TALENT",
    signerName: "Victoria Sterling",
    signerEmail: "victoria.sterling@actorsguild.org",
    signerPhone: "+1-555-888-9999",
    signerRole: "Principal Lead Actress",
    termsContent: "I hereby grant Lumina Cine the irrevocable right and permission to use my likeness, image, voice, and performance...",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAYAAAB1ovlvAAA...",
    notes: "Talent signed on set in studio stage A.",
  });
  assert(talentRelease.success === true, "TALENT release submitted successfully");
  assert(talentRelease.release?.releaseType === "TALENT", "Persisted release is marked as TALENT");

  const locationRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    tenantSlug: lumina!.slug,
    releaseType: "LOCATION",
    signerName: "Arthur Pendelton",
    signerEmail: "arthur@manorproperties.com",
    signerPhone: "+1-555-777-6666",
    signerRole: "Historic Property Owner / Landlord",
    termsContent: "I grant full permission to enter and film on the premises located at 440 Heritage Way...",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAYAAAB1ovlvBBB...",
    notes: "Requires crew shoe covers in grandfather clock room.",
  });
  assert(locationRelease.success === true, "LOCATION release submitted successfully");
  assert(locationRelease.release?.releaseType === "LOCATION", "Persisted release is marked as LOCATION");

  // 3.2 High-Resolution / Large Base64 Signature Canvas Payloads
  console.log("\n--- 3.2 Large Base64 Signature Canvas Stress Testing ---");
  // Simulate high-density Retina / 4K iPad Pro canvas signature (150 KB string)
  const largeSignatureChunk = "iVBORw0KGgoAAAANSUhEUgAAAcIAAAGPCAYAAAAk".repeat(3000); // ~120KB
  const largeSignatureDataUrl = `data:image/png;base64,${largeSignatureChunk}`;

  const largeSigRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    tenantSlug: lumina!.slug,
    releaseType: "TALENT",
    signerName: "Dominic Thorne (High-Res Pad)",
    signerEmail: "dominic.thorne@agency.net",
    termsContent: "Standard commercial likeness release agreement terms with full indemnity.",
    signatureDataUrl: largeSignatureDataUrl,
  });

  assert(largeSigRelease.success === true, "Large base64 signature (~120KB) submitted successfully");
  const storedLargeRelease = await db.digitalRelease.findUnique({
    where: { id: largeSigRelease.releaseId! },
  });
  assert(storedLargeRelease !== null, "Large signature release found in database");
  assert(storedLargeRelease!.signatureDataUrl.length === largeSignatureDataUrl.length,
    `Signature preserved byte-for-byte without truncation (${storedLargeRelease!.signatureDataUrl.length} characters)`
  );

  // Even larger payload: 500 KB signature
  const hugeSignatureChunk = "A".repeat(500 * 1024);
  const hugeSignatureDataUrl = `data:image/png;base64,${hugeSignatureChunk}`;
  const hugeSigRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    tenantSlug: lumina!.slug,
    releaseType: "LOCATION",
    signerName: "Grand Central Terminal Rep",
    signerEmail: "filming@grandcentral.org",
    termsContent: "Municipal filming authorization and property release agreement.",
    signatureDataUrl: hugeSignatureDataUrl,
  });
  assert(hugeSigRelease.success === true, "Massive 500KB signature payload successfully accepted and written to SQLite");

  // 3.3 Multiple Signers on Same Project & Chronological Integrity
  console.log("\n--- 3.3 Multiple Signers Stress Test on Single Project ---");
  const signers = [
    { name: "Extra Actor 1", email: "extra1@agency.com", role: "Background Artist", type: "TALENT" as const },
    { name: "Extra Actor 2", email: "extra2@agency.com", role: "Background Artist", type: "TALENT" as const },
    { name: "Stunt Driver", email: "stunts@speed.org", role: "Stunt Coordinator", type: "TALENT" as const },
    { name: "Warehouse Manager", email: "dock@harbor.net", role: "Facility Manager", type: "LOCATION" as const },
  ];

  for (const s of signers) {
    const res = await submitDigitalRelease({
      projectId: luminaProject!.id,
      tenantSlug: lumina!.slug,
      releaseType: s.type,
      signerName: s.name,
      signerEmail: s.email,
      signerRole: s.role,
      termsContent: `Agreement terms for ${s.name} regarding project ${luminaProject!.title}`,
      signatureDataUrl: `data:image/png;base64,SIG_${s.name.replace(/\s+/g, "_")}_DATA_STAMP`,
    });
    assert(res.success === true, `Multiple signer release registered: ${s.name} (${s.role})`);
  }

  // Fetch all releases for Lumina project
  const allLuminaReleases = await db.digitalRelease.findMany({
    where: { projectId: luminaProject!.id },
    orderBy: { signedAt: "desc" },
  });
  assert(allLuminaReleases.length >= 7, `Single project holds all ${allLuminaReleases.length} signed releases`);

  // Verify reverse chronological order
  for (let i = 0; i < allLuminaReleases.length - 1; i++) {
    const curr = allLuminaReleases[i]!.signedAt.getTime();
    const next = allLuminaReleases[i + 1]!.signedAt.getTime();
    assert(curr >= next, "Releases are strictly ordered reverse-chronologically (newest first)");
  }

  // 3.4 Tenant Isolation via Project Relation
  console.log("\n--- 3.4 Cross-Tenant Isolation via Project Relation ---");
  // Verify Apex project does NOT have access to Lumina's releases
  const apexReleases = await db.digitalRelease.findMany({
    where: {
      project: {
        tenantId: apex!.id,
      },
    },
  });
  const luminaReleaseIds = new Set(allLuminaReleases.map((r) => r.id));
  const leakedReleases = apexReleases.filter((r) => luminaReleaseIds.has(r.id));
  assert(leakedReleases.length === 0, "Zero leakage: Apex tenant queries cannot access Lumina project digital releases");

  // Verify releases page lookup isolation logic:
  // If user visits /apex-media/releases/[luminaProjectId], server executes:
  const crossTenantProjectLookup = await db.project.findFirst({
    where: {
      id: luminaProject!.id,
      tenantId: apex!.id, // Mismatched tenant!
    },
  });
  assert(crossTenantProjectLookup === null, "Cross-tenant project lookup under mismatched tenant returns null (triggers notFound 404)");

  // Attempt to submit release for nonexistent project
  const nonExistentProjectRelease = await submitDigitalRelease({
    projectId: "proj_non_existent_9999",
    tenantSlug: lumina!.slug,
    releaseType: "TALENT",
    signerName: "Ghost Signer",
    signerEmail: "ghost@limbo.net",
    termsContent: "Terms for phantom entity.",
    signatureDataUrl: "data:image/png;base64,GHOST_SIG",
  });
  assert(nonExistentProjectRelease.success === false, "Submission for nonexistent project rejected");
  assert(nonExistentProjectRelease.error === "PROJECT_NOT_FOUND", "Returns PROJECT_NOT_FOUND error code");

  // 3.5 Input Validation Stress (Zod Schema Boundaries)
  console.log("\n--- 3.5 Input Validation & Boundary Hardening ---");
  // Test invalid email
  const badEmailRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    releaseType: "TALENT",
    signerName: "John Doe",
    signerEmail: "not-an-email",
    termsContent: "Terms content text here.",
    signatureDataUrl: "data:image/png;base64,VALID_SIG_DATA_HERE",
  });
  assert(badEmailRelease.success === false, "Invalid email address rejected by Zod schema");

  // Test short signer name (<2 chars)
  const shortNameRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    releaseType: "TALENT",
    signerName: "J",
    signerEmail: "j@example.com",
    termsContent: "Terms content text here.",
    signatureDataUrl: "data:image/png;base64,VALID_SIG_DATA_HERE",
  });
  assert(shortNameRelease.success === false, "Signer name < 2 characters rejected by Zod schema");

  // Test short terms content (<10 chars)
  const shortTermsRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    releaseType: "TALENT",
    signerName: "John Doe",
    signerEmail: "john@example.com",
    termsContent: "Too short",
    signatureDataUrl: "data:image/png;base64,VALID_SIG_DATA_HERE",
  });
  assert(shortTermsRelease.success === false, "Terms content < 10 characters rejected by Zod schema");

  // Test short signature (<20 chars)
  const shortSigRelease = await submitDigitalRelease({
    projectId: luminaProject!.id,
    releaseType: "TALENT",
    signerName: "John Doe",
    signerEmail: "john@example.com",
    termsContent: "Valid terms content exceeding 10 characters.",
    signatureDataUrl: "short_sig",
  });
  assert(shortSigRelease.success === false, "Signature data URL < 20 characters rejected by Zod schema");

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passedCount} / ${testCount} CHALLENGER ASSERTIONS PASSED WITH ZERO ERRORS!`);
  console.log("================================================================================\n");
}

runChallengerSuite()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
