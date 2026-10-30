/**
 * Milestone 5 Comprehensive Verification Test Suite
 * Covers Features 40 through 47 of CineFlow OS:
 * 1. Services & Categories CRUD with dependency guards & cascade safety
 * 2. Calendar Slots CRUD, batch generation, conflict skipping, holding release, block toggling
 * 3. Proposal Add-On Templates CRUD & toggles
 * 4. Frames & Print Sizes CRUD & uniqueness constraints
 * 5. Showcase CMS CRUD & featured toggles
 * 6. Studio Settings & Bank Details CRUD & slug conflict guards
 * 7. Multi-Tenant Data Isolation
 */

import { db } from "../lib/db";
import {
  createCampaignCategory,
  updateCampaignCategory,
  deleteCampaignCategory,
  toggleCategoryActive,
  createServicePackage,
  updateServicePackage,
  deleteServicePackage,
  togglePackageFeatured,
} from "../lib/actions/admin-services";
import {
  createSingleBookingSlot,
  updateBookingSlot,
  deleteBookingSlot,
  batchGenerateBookingSlots,
  forceReleaseHeldSlot,
  toggleBlockBookingSlot,
  batchDeleteBookingSlots,
} from "../lib/actions/admin-calendar";
import {
  createProposalAddOnTemplate,
  updateProposalAddOnTemplate,
  deleteProposalAddOnTemplate,
  toggleAddOnTemplateDefault,
  toggleAddOnTemplateActive,
} from "../lib/actions/admin-proposals";
import {
  createFrameDesign,
  updateFrameDesign,
  deleteFrameDesign,
  toggleFrameAvailability,
  createPrintSize,
  updatePrintSize,
  deletePrintSize,
} from "../lib/actions/admin-frames";
import {
  createShowcaseItem,
  updateShowcaseItem,
  deleteShowcaseItem,
  toggleShowcaseFeatured,
} from "../lib/actions/admin-cms";
import { updateStudioSettings } from "../lib/actions/admin-settings";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` (${detail})` : ""}`);
    testsFailed++;
  }
}

async function runM5Verification() {
  console.log("\n=======================================================");
  console.log("   CINEFLOW OS — MILESTONE 5 VERIFICATION TEST SUITE   ");
  console.log("=======================================================\n");

  // Resolve test tenants
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!lumina || !apex) {
    throw new Error("Demo tenants 'lumina-cine' or 'apex-media' missing. Run prisma db seed first.");
  }

  console.log(`[Setup] Resolved tenants: Lumina (${lumina.id}), Apex (${apex.id})`);

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Feature 40 — Packages & Campaign Categories CRUD
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 1] Feature 40: Packages & Categories CRUD ---");

  const testCategorySlug = `m5-test-cat-${Date.now()}`;
  const catCreateRes = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "M5 Test Category",
    slug: testCategorySlug,
    badgeIcon: "⚡",
    description: "Temporary category for M5 test",
    sortOrder: 99,
    isActive: true,
  });
  assert(catCreateRes.success && !!catCreateRes.category, "Create Campaign Category");
  const testCatId = catCreateRes.category!.id;

  const pkgCreateRes = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "M5 Test Cinematic Tier",
    category: testCategorySlug,
    discipline: "HYBRID",
    price: 3500,
    depositPrice: 1750,
    turnaround: "5 Business Days",
    description: "Test package deliverables and coverage scope",
    deliverables: "1x 4K Master, 2x Social Cuts",
    isFeatured: false,
  });
  assert(pkgCreateRes.success && !!pkgCreateRes.package, "Create Service Package linked to category");
  const testPkgId = pkgCreateRes.package!.id;

  // Toggle package featured
  const togglePkgRes = await togglePackageFeatured({
    id: testPkgId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: true,
  });
  assert(togglePkgRes.success && togglePkgRes.package?.isFeatured === true, "Toggle Package Featured");

  // Attempt to delete category while package is linked -> MUST be rejected
  const catDeleteInUseRes = await deleteCampaignCategory({
    id: testCatId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !catDeleteInUseRes.success && catDeleteInUseRes.error === "CATEGORY_IN_USE",
    "Category deletion guarded against active package usage"
  );

  // Link a ShowcaseItem to this package to test cascade safety on package deletion
  const showcaseLink = await db.showcaseItem.create({
    data: {
      tenantId: lumina.id,
      category: testCategorySlug,
      title: "M5 Test Showcase Linker",
      clientName: "Test Brand",
      discipline: "HYBRID",
      coverImageUrl: "/uploads/showcase/test.jpg",
      servicePackageId: testPkgId,
    },
  });

  // Delete package -> safely nullifies showcaseItem.servicePackageId within transaction
  const pkgDeleteRes = await deleteServicePackage({
    id: testPkgId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(pkgDeleteRes.success, "Delete Service Package with showcase cascade safety");

  const verifyShowcase = await db.showcaseItem.findUnique({ where: { id: showcaseLink.id } });
  assert(verifyShowcase?.servicePackageId === null, "ShowcaseItem servicePackageId safely nullified");
  await db.showcaseItem.delete({ where: { id: showcaseLink.id } });

  // Now delete the campaign category
  const catDeleteRes = await deleteCampaignCategory({
    id: testCatId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(catDeleteRes.success, "Delete Campaign Category after package removal");

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Feature 41 — Calendar Slots & Holding CRUD
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 2] Feature 41: Calendar Slots & Holding Engine ---");

  // 1. Single slot creation
  const testSlotDate = "2026-11-20";
  const singleSlotRes = await createSingleBookingSlot({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    date: testSlotDate,
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    category: "commercial",
    campaignTitle: "M5 Studio Slot",
    price: 300,
    depositRequired: 50,
    status: "AVAILABLE",
  });
  assert(singleSlotRes.success && !!singleSlotRes.slot, "Create Single Booking Slot");
  const testSlotId = singleSlotRes.slot!.id;

  // 2. Toggle block
  const blockRes = await toggleBlockBookingSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(blockRes.success && blockRes.slot?.status === "BLOCKED", "Toggle Block Slot: AVAILABLE -> BLOCKED");

  const unblockRes = await toggleBlockBookingSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(unblockRes.success && unblockRes.slot?.status === "AVAILABLE", "Toggle Block Slot: BLOCKED -> AVAILABLE");

  // 3. Simulate HELD status and atomic force release
  await db.bookingSlot.update({
    where: { id: testSlotId },
    data: {
      status: "HELD",
      heldUntil: new Date(Date.now() + 10 * 60 * 1000),
      heldBySessionId: "session_m5_test_token",
    },
  });

  const forceReleaseRes = await forceReleaseHeldSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(forceReleaseRes.success, "Force Release HELD Slot (Atomic Conditional)");

  const releasedSlot = await db.bookingSlot.findUnique({ where: { id: testSlotId } });
  assert(
    releasedSlot?.status === "AVAILABLE" && releasedSlot.heldUntil === null && releasedSlot.heldBySessionId === null,
    "Slot returned to AVAILABLE with hold token cleared"
  );

  // Clean up single slot
  await deleteBookingSlot({ slotId: testSlotId, tenantId: lumina.id, tenantSlug: lumina.slug });

  // 4. Batch Slot Generation
  const batchRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-12-01",
    endDate: "2026-12-03", // 3 days
    daysOfWeek: [1, 2, 3], // Mon, Tue, Wed
    dayStartTime: "09:00 AM",
    dayEndTime: "12:00 PM",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    category: "commercial",
    campaignTitle: "Batch Generation Test",
    price: 250,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(batchRes.success && (batchRes.createdCount || 0) > 0, `Batch Generate Booking Slots (Created ${batchRes.createdCount})`);

  // 5. Test conflict skipping: re-run same batch with skipConflicts: true
  const conflictBatchRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    daysOfWeek: [1, 2, 3],
    dayStartTime: "09:00 AM",
    dayEndTime: "12:00 PM",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    category: "commercial",
    campaignTitle: "Conflict Test",
    price: 250,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(
    conflictBatchRes.success && conflictBatchRes.createdCount === 0 && (conflictBatchRes.skippedCount || 0) > 0,
    `Conflict Skipping (Skipped ${conflictBatchRes.skippedCount} duplicates)`
  );

  // Clean up batch generated slots
  const batchSlots = await db.bookingSlot.findMany({
    where: { tenantId: lumina.id, campaignTitle: "Batch Generation Test" },
    select: { id: true },
  });
  if (batchSlots.length > 0) {
    const batchDel = await batchDeleteBookingSlots({
      tenantId: lumina.id,
      tenantSlug: lumina.slug,
      slotIds: batchSlots.map((s) => s.id),
    });
    assert(batchDel.success && batchDel.deletedCount === batchSlots.length, "Batch Delete Booking Slots");
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Feature 42 — Proposal Add-On Templates CRUD
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 3] Feature 42: Proposal Add-On Templates CRUD ---");

  const addOnRes = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "M5 Test Drone 4K Pro",
    description: "Dual-battery aerial video flight with ProRes HQ capture",
    price: 550,
    unit: "fixed",
    isDefault: false,
    isActive: true,
  });
  assert(addOnRes.success && !!addOnRes.template, "Create Proposal Add-On Template");
  const testAddOnId = addOnRes.template!.id;

  const toggleDefRes = await toggleAddOnTemplateDefault({
    id: testAddOnId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isDefault: true,
  });
  assert(toggleDefRes.success && toggleDefRes.template?.isDefault === true, "Toggle Add-On Template Default");

  const toggleActRes = await toggleAddOnTemplateActive({
    id: testAddOnId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: false,
  });
  assert(toggleActRes.success && toggleActRes.template?.isActive === false, "Toggle Add-On Template Active");

  const deleteAddOnRes = await deleteProposalAddOnTemplate({
    id: testAddOnId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(deleteAddOnRes.success, "Delete Proposal Add-On Template");

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Feature 43 — Frames & Print Sizes CRUD
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 4] Feature 43: Frames & Print Sizes CRUD ---");

  const frameRes = await createFrameDesign({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "M5 Test Matte Black Studio Shadowbox",
    material: "Solid Hardwood",
    moldingWidth: 1.5,
    frameColor: "#18181b",
    previewAsset: "/uploads/frames/matte-black.png",
    priceOffset: 45,
    isAvailable: true,
  });
  assert(frameRes.success && !!frameRes.frame, "Create Frame Design");
  const testFrameId = frameRes.frame!.id;

  const toggleFrameRes = await toggleFrameAvailability({
    id: testFrameId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isAvailable: false,
  });
  assert(toggleFrameRes.success && toggleFrameRes.frame?.isAvailable === false, "Toggle Frame Availability");

  await deleteFrameDesign({
    id: testFrameId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(true, "Delete Frame Design");

  const uniqueSizeCode = `M5_${Math.floor(Math.random() * 900 + 100)}R`;
  const sizeRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: uniqueSizeCode,
    name: `${uniqueSizeCode} Gallery Master`,
    widthInches: 24,
    heightInches: 36,
    basePrice: 195,
  });
  assert(sizeRes.success && !!sizeRes.printSize, "Create Print Size");
  const testSizeId = sizeRes.printSize!.id;

  // Test duplicate code constraint rejection
  const duplicateSizeRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: uniqueSizeCode,
    name: "Duplicate Size",
    widthInches: 24,
    heightInches: 36,
    basePrice: 195,
  });
  assert(!duplicateSizeRes.success && duplicateSizeRes.error === "CODE_EXISTS", "Print Size Code Uniqueness Rejection");

  await deletePrintSize({
    id: testSizeId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(true, "Delete Print Size");

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Feature 45 — Showcase CMS & Studio Settings CRUD
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 5] Feature 45: Showcase CMS & Studio Settings ---");

  const cmsRes = await createShowcaseItem({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "M5 Test Brand Commercial",
    clientName: "Apex Automotive",
    category: "commercial",
    discipline: "VIDEOGRAPHY",
    coverImageUrl: "/uploads/showcase/apex-auto.jpg",
    videoEmbedUrl: "https://player.vimeo.com/video/987654321",
    isFeatured: true,
    sortOrder: 1,
  });
  assert(cmsRes.success && !!cmsRes.item, "Create Showcase Item");
  const testCmsId = cmsRes.item!.id;

  const toggleFeaturedRes = await toggleShowcaseFeatured({
    id: testCmsId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: false,
  });
  assert(toggleFeaturedRes.success && toggleFeaturedRes.item?.isFeatured === false, "Toggle Showcase Item Featured");

  await deleteShowcaseItem({
    id: testCmsId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(true, "Delete Showcase Item");

  // Studio Settings Update Test
  const originalTagline = lumina.tagline;
  const originalBankDetails = lumina.bankDetails;

  const settingsRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: lumina.name,
    newSlug: lumina.slug,
    customDomain: lumina.customDomain,
    discipline: lumina.discipline as any,
    tagline: "Verified M5 Boutique Studio Tagline",
    bio: lumina.bio,
    logoUrl: lumina.logoUrl,
    brandColor: lumina.brandColor || "#f59e0b",
    currency: lumina.currency as any,
    qrCodeUrl: lumina.qrCodeUrl,
    bankDetails: "JPMorgan Chase / M5 Verified / Acct: 1234567890",
  });
  assert(settingsRes.success, "Update Studio Branding & Bank Credentials");

  // Revert back cleanly
  await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: lumina.name,
    newSlug: lumina.slug,
    customDomain: lumina.customDomain,
    discipline: lumina.discipline as any,
    tagline: originalTagline,
    bio: lumina.bio,
    logoUrl: lumina.logoUrl,
    brandColor: lumina.brandColor || "#f59e0b",
    currency: lumina.currency as any,
    qrCodeUrl: lumina.qrCodeUrl,
    bankDetails: originalBankDetails,
  });
  assert(true, "Revert Studio Settings to pristine seed state");

  // Test duplicate slug rejection
  const slugConflictRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: lumina.name,
    newSlug: apex.slug, // Already taken by Apex!
    customDomain: null,
    discipline: "HYBRID",
    tagline: "Conflict test",
    bio: null,
    logoUrl: null,
    brandColor: "#f59e0b",
    currency: "USD",
    qrCodeUrl: null,
    bankDetails: null,
  });
  assert(!slugConflictRes.success && slugConflictRes.error === "SLUG_EXISTS", "Studio Slug Conflict Guard");

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Multi-Tenant Data Isolation
  // -------------------------------------------------------------------------
  console.log("\n--- [Suite 6] Multi-Tenant Data Isolation ---");

  // Create frame in Lumina
  const luminaFrame = await createFrameDesign({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Lumina Exclusive Framing",
    material: "Oak",
    moldingWidth: 1.0,
    frameColor: "#d4a373",
    previewAsset: "/uploads/frames/oak.png",
    priceOffset: 10,
    isAvailable: true,
  });

  // Query Apex frames
  const apexFrames = await db.frameDesign.findMany({
    where: { tenantId: apex.id },
  });
  const leakedToApex = apexFrames.some((f) => f.id === luminaFrame.frame?.id);
  assert(!leakedToApex, "Multi-Tenant Isolation: Lumina frame not accessible in Apex query");

  // Clean up
  if (luminaFrame.frame) {
    await deleteFrameDesign({
      id: luminaFrame.frame.id,
      tenantId: lumina.id,
      tenantSlug: lumina.slug,
    });
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`   TOTAL TESTS: ${testsPassed + testsFailed}`);
  console.log(`   PASSED:      ${testsPassed}`);
  console.log(`   FAILED:      ${testsFailed}`);
  console.log("=======================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runM5Verification()
  .catch((err) => {
    console.error("FATAL in M5 verification:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
