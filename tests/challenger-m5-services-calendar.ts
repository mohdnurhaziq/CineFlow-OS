/**
 * CineFlow OS — Challenger Stress Test Suite (Milestone 5: Services, Calendar, Proposals)
 * 
 * Adversarially challenges and verifies:
 * 1. Services & Categories Stress Testing (lib/actions/admin-services.ts)
 *    - Deleting categories that have attached packages (must fail with CATEGORY_IN_USE)
 *    - Deleting packages that are referenced by showcase items (must safely nullify showcaseItem.servicePackageId)
 *    - Duplicate category slugs under same tenant (must reject with SLUG_EXISTS)
 *    - Cross-tenant category slug independence (same slug allowed across distinct tenants)
 *    - Slug update conflict detection (updating to another category's slug fails with SLUG_EXISTS)
 *    - Self-slug update preserved
 *    - Zod schema validation (invalid slug format, negative price/deposit, invalid discipline)
 *    - Cross-tenant boundary isolation on categories and packages
 * 
 * 2. Calendar Slots Stress Testing (lib/actions/admin-calendar.ts)
 *    - Batch slot generation over complex ranges and boundary intervals (window truncation, day-of-week filters)
 *    - Inverted time ranges and date ranges rejection
 *    - Duration boundaries (< 15 mins rejected)
 *    - Conflict skipping when identical slots already exist
 *    - Force-releasing HELD slots (atomic conditional reversion to AVAILABLE, clearing heldUntil & heldBySessionId)
 *    - Force-release rejection when slot is not HELD or belongs to another tenant
 *    - Deleting BOOKED or PENDING_VERIFICATION slots rejection (SLOT_HAS_BOOKING)
 *    - Batch deleting mixed slots (deletes AVAILABLE, skips BOOKED)
 *    - Batch delete all-booked rejection (NO_DELETABLE_SLOTS)
 *    - Slot block toggling and protection of HELD/BOOKED slots
 * 
 * 3. Proposal Add-On Templates Stress Testing (lib/actions/admin-proposals.ts)
 *    - Add-on creation with unusual pricing ($0.00 free add-on, $99,999.99 high-value, negative price rejected)
 *    - Valid unit types ("fixed", "per_hour", "per_day") vs invalid units rejected
 *    - Toggling default and active statuses with DB persistence
 *    - Cross-tenant boundary isolation on template update, delete, and toggle actions
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
  cleanupExpiredHolds,
} from "../lib/actions/admin-calendar";
import {
  createProposalAddOnTemplate,
  updateProposalAddOnTemplate,
  deleteProposalAddOnTemplate,
  toggleAddOnTemplateDefault,
  toggleAddOnTemplateActive,
} from "../lib/actions/admin-proposals";

let assertionsPassed = 0;
let assertionsFailed = 0;

function assert(condition: boolean, description: string) {
  if (!condition) {
    console.error(`❌ CHALLENGE FAILED: ${description}`);
    assertionsFailed++;
    throw new Error(`Challenge failure: ${description}`);
  }
  console.log(`  ✓ PASS: ${description}`);
  assertionsPassed++;
}

async function runChallengerSuite() {
  console.log("\n===============================================================================");
  console.log("   CINEFLOW OS — MILESTONE 5 ADVERSARIAL CHALLENGER STRESS SUITE              ");
  console.log("===============================================================================\n");

  const startTime = Date.now();
  const runId = `chlg-${Date.now()}`;

  // Resolve tenants
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!lumina || !apex) {
    throw new Error("Required tenants 'lumina-cine' or 'apex-media' missing. Seed database first.");
  }

  console.log(`[Setup] Resolved tenants: Lumina (${lumina.id}), Apex (${apex.id})`);

  // ===========================================================================
  // SECTION 1: SERVICES & CATEGORIES STRESS TESTING
  // ===========================================================================
  console.log("\n--- [Section 1] Services & Categories Stress Testing ---");

  // 1.1 Category Creation & Slug Uniqueness Under Same Tenant
  const catSlug = `chlg-cat-${runId}`;
  const catCreateRes = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Challenger Category Alpha",
    slug: catSlug,
    badgeIcon: "🎯",
    description: "Stress test category",
    sortOrder: 10,
    isActive: true,
  });

  assert(catCreateRes.success && !!catCreateRes.category, "Create initial category on Lumina succeeds");
  const catAlphaId = catCreateRes.category!.id;

  // Duplicate slug on same tenant must be rejected
  const dupSlugRes = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Duplicate Category Slug",
    slug: catSlug,
    sortOrder: 20,
    isActive: true,
  });
  assert(
    !dupSlugRes.success && dupSlugRes.error === "SLUG_EXISTS",
    "Duplicate category slug on same tenant rejected with SLUG_EXISTS"
  );

  // Invalid slug format (uppercase, spaces, underscores) must be rejected by Zod regex
  const invalidSlugRes = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Invalid Slug Category",
    slug: "INVALID SLUG!",
    sortOrder: 30,
    isActive: true,
  });
  assert(
    !invalidSlugRes.success && invalidSlugRes.error === "CREATE_CATEGORY_FAILED",
    "Invalid category slug with uppercase and spaces rejected by validation"
  );

  const underscoreSlugRes = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Underscore Slug Category",
    slug: "invalid_slug_with_underscores",
    sortOrder: 30,
    isActive: true,
  });
  assert(
    !underscoreSlugRes.success && underscoreSlugRes.error === "CREATE_CATEGORY_FAILED",
    "Category slug with underscores rejected by Zod regex /^[a-z0-9-]+$/"
  );

  // Cross-tenant slug independence: Same slug on Apex MUST SUCCEED
  const apexSameSlugRes = await createCampaignCategory({
    tenantId: apex.id,
    tenantSlug: apex.slug,
    name: "Apex Independent Category",
    slug: catSlug,
    sortOrder: 10,
    isActive: true,
  });
  assert(
    apexSameSlugRes.success && !!apexSameSlugRes.category,
    "Identical category slug on distinct tenant (Apex) succeeds per @@unique([tenantId, slug])"
  );
  const apexCatId = apexSameSlugRes.category!.id;

  // Create a second category on Lumina to test slug update collision
  const catSlug2 = `chlg-cat2-${runId}`;
  const catCreateRes2 = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Challenger Category Beta",
    slug: catSlug2,
    sortOrder: 15,
    isActive: true,
  });
  assert(catCreateRes2.success && !!catCreateRes2.category, "Create second category on Lumina succeeds");
  const catBetaId = catCreateRes2.category!.id;

  // Attempting to update Category Beta's slug to Category Alpha's slug must fail
  const slugConflictRes = await updateCampaignCategory({
    id: catBetaId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Updated Beta with Conflicting Slug",
    slug: catSlug, // conflicts with catAlpha
    sortOrder: 15,
    isActive: true,
  });
  assert(
    !slugConflictRes.success && slugConflictRes.error === "SLUG_EXISTS",
    "Category slug update conflict with existing category under same tenant rejected with SLUG_EXISTS"
  );

  // Updating Category Beta with its OWN slug must succeed
  const selfSlugRes = await updateCampaignCategory({
    id: catBetaId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Category Beta Self-Update",
    slug: catSlug2,
    sortOrder: 16,
    isActive: true,
  });
  assert(selfSlugRes.success, "Category update preserving existing slug succeeds");

  // Cross-tenant category update attempt must fail
  const crossTenantCatUpdate = await updateCampaignCategory({
    id: catAlphaId,
    tenantId: apex.id, // wrong tenant
    tenantSlug: apex.slug,
    name: "Hacked Category",
    slug: catSlug,
    sortOrder: 1,
    isActive: true,
  });
  assert(
    !crossTenantCatUpdate.success && crossTenantCatUpdate.error === "CATEGORY_NOT_FOUND",
    "Cross-tenant category update rejected with CATEGORY_NOT_FOUND"
  );

  // 1.2 Deleting Categories with Attached Packages Guard (CATEGORY_IN_USE)
  const pkgCreateRes1 = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Challenger Alpha Package 1",
    category: catSlug, // assigned to catAlpha
    discipline: "HYBRID",
    price: 1800,
    depositPrice: 200,
    turnaround: "7 business days",
    description: "High-end commercial hybrid package for stress testing",
    deliverables: "4K Master, 20 Edited Photos",
    isFeatured: true,
  });
  assert(pkgCreateRes1.success && !!pkgCreateRes1.package, "Create package 1 assigned to Category Alpha succeeds");
  const pkgId1 = pkgCreateRes1.package!.id;

  const pkgCreateRes2 = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Challenger Alpha Package 2",
    category: catSlug, // also assigned to catAlpha
    discipline: "PHOTOGRAPHY",
    price: 950,
    depositPrice: 150,
    turnaround: "5 business days",
    description: "Photography package for stress testing",
    deliverables: "30 Edited High-Res Photos",
    isFeatured: false,
  });
  assert(pkgCreateRes2.success && !!pkgCreateRes2.package, "Create package 2 assigned to Category Alpha succeeds");
  const pkgId2 = pkgCreateRes2.package!.id;

  // Attempting to delete Category Alpha MUST FAIL with CATEGORY_IN_USE
  const deleteCatInUseRes = await deleteCampaignCategory({
    id: catAlphaId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !deleteCatInUseRes.success && deleteCatInUseRes.error === "CATEGORY_IN_USE",
    "Deleting category with active packages rejected with CATEGORY_IN_USE"
  );
  assert(
    typeof deleteCatInUseRes.message === "string" && deleteCatInUseRes.message.includes("2 service package(s)"),
    "CATEGORY_IN_USE message accurately reports attached package count (2 packages)"
  );

  // Cross-tenant category deletion attempt must fail
  const crossTenantCatDelete = await deleteCampaignCategory({
    id: catAlphaId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
  });
  assert(
    !crossTenantCatDelete.success && crossTenantCatDelete.error === "CATEGORY_NOT_FOUND",
    "Cross-tenant category deletion rejected with CATEGORY_NOT_FOUND"
  );

  // 1.3 Service Package Deletion & Showcase Cascade Nullification
  // Create showcase items referencing pkgId1 and pkgId2
  const showcaseItem1 = await db.showcaseItem.create({
    data: {
      tenantId: lumina.id,
      category: catSlug,
      title: "Showcase Ref 1",
      clientName: "Client A",
      discipline: "HYBRID",
      coverImageUrl: "/uploads/sample_1.jpg",
      servicePackageId: pkgId1,
      isFeatured: true,
    },
  });
  const showcaseItem2 = await db.showcaseItem.create({
    data: {
      tenantId: lumina.id,
      category: catSlug,
      title: "Showcase Ref 2",
      clientName: "Client B",
      discipline: "HYBRID",
      coverImageUrl: "/uploads/sample_2.jpg",
      servicePackageId: pkgId1,
      isFeatured: false,
    },
  });
  const showcaseItem3 = await db.showcaseItem.create({
    data: {
      tenantId: lumina.id,
      category: catSlug,
      title: "Showcase Ref 3",
      clientName: "Client C",
      discipline: "PHOTOGRAPHY",
      coverImageUrl: "/uploads/sample_3.jpg",
      servicePackageId: pkgId2,
      isFeatured: false,
    },
  });

  // Cross-tenant package deletion attempt must fail
  const crossTenantPkgDelete = await deleteServicePackage({
    id: pkgId1,
    tenantId: apex.id,
    tenantSlug: apex.slug,
  });
  assert(
    !crossTenantPkgDelete.success && crossTenantPkgDelete.error === "PACKAGE_NOT_FOUND",
    "Cross-tenant package deletion rejected with PACKAGE_NOT_FOUND"
  );

  // Delete pkgId1
  const deletePkg1Res = await deleteServicePackage({
    id: pkgId1,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(deletePkg1Res.success && deletePkg1Res.deletedId === pkgId1, "Package 1 deleted successfully");

  // Verify package 1 is gone from database
  const pkg1InDb = await db.servicePackage.findUnique({ where: { id: pkgId1 } });
  assert(pkg1InDb === null, "Package 1 verified deleted from database");

  // Verify showcaseItem1 and showcaseItem2 still exist, and servicePackageId is safely nullified
  const updatedShowcase1 = await db.showcaseItem.findUnique({ where: { id: showcaseItem1.id } });
  const updatedShowcase2 = await db.showcaseItem.findUnique({ where: { id: showcaseItem2.id } });
  const updatedShowcase3 = await db.showcaseItem.findUnique({ where: { id: showcaseItem3.id } });

  assert(
    updatedShowcase1 !== null && updatedShowcase1.servicePackageId === null,
    "Showcase item 1 preserved and servicePackageId safely nullified to null"
  );
  assert(
    updatedShowcase2 !== null && updatedShowcase2.servicePackageId === null,
    "Showcase item 2 preserved and servicePackageId safely nullified to null"
  );
  assert(
    updatedShowcase3 !== null && updatedShowcase3.servicePackageId === pkgId2,
    "Showcase item 3 untouched, retains link to package 2"
  );

  // Clean up showcase items
  await db.showcaseItem.deleteMany({
    where: { id: { in: [showcaseItem1.id, showcaseItem2.id, showcaseItem3.id] } },
  });

  // Now delete package 2
  const deletePkg2Res = await deleteServicePackage({
    id: pkgId2,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(deletePkg2Res.success, "Package 2 deleted successfully");

  // Now Category Alpha has 0 packages attached: deletion MUST SUCCEED
  const deleteCatAlphaRes = await deleteCampaignCategory({
    id: catAlphaId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(deleteCatAlphaRes.success, "Category Alpha deleted successfully after attached packages removed");

  const catAlphaInDb = await db.campaignCategory.findUnique({ where: { id: catAlphaId } });
  assert(catAlphaInDb === null, "Category Alpha verified removed from database");

  // Clean up Cat Beta and Apex Cat
  await deleteCampaignCategory({ id: catBetaId, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteCampaignCategory({ id: apexCatId, tenantId: apex.id, tenantSlug: apex.slug });

  // 1.4 Package Input Validation Edge Cases
  const negativePriceRes = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Negative Price Pkg",
    category: "commercial",
    discipline: "HYBRID",
    price: -500, // Invalid
    depositPrice: 50,
    turnaround: "3 days",
    description: "Invalid negative price test",
    deliverables: "None",
    isFeatured: false,
  });
  assert(!negativePriceRes.success, "Service package creation with negative price rejected by Zod");

  const invalidDisciplineRes = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Bad Discipline Pkg",
    category: "commercial",
    discipline: "AERIAL_STUNT" as any, // Invalid
    price: 500,
    depositPrice: 50,
    turnaround: "3 days",
    description: "Invalid discipline test",
    deliverables: "None",
    isFeatured: false,
  });
  assert(!invalidDisciplineRes.success, "Service package creation with invalid discipline enum rejected by Zod");

  // 1.5 Package Update, Featured Toggle & Category Active Toggles
  const updateTestPkgRes = await createServicePackage({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Update Test Pkg",
    category: "commercial",
    discipline: "PHOTOGRAPHY",
    price: 600,
    depositPrice: 100,
    turnaround: "4 days",
    description: "Package for update and toggle testing",
    deliverables: "10 Edits",
    isFeatured: false,
  });
  assert(updateTestPkgRes.success && !!updateTestPkgRes.package, "Create package for update testing succeeds");
  const updatePkgId = updateTestPkgRes.package!.id;

  const featTrue = await togglePackageFeatured({
    id: updatePkgId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: true,
  });
  assert(featTrue.success && featTrue.package?.isFeatured === true, "Toggle package featured true succeeds");

  const featFalse = await togglePackageFeatured({
    id: updatePkgId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: false,
  });
  assert(featFalse.success && featFalse.package?.isFeatured === false, "Toggle package featured false succeeds");

  const crossFeat = await togglePackageFeatured({
    id: updatePkgId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    isFeatured: true,
  });
  assert(!crossFeat.success && crossFeat.error === "PACKAGE_NOT_FOUND", "Cross-tenant package featured toggle rejected with PACKAGE_NOT_FOUND");

  const updatePkgRes = await updateServicePackage({
    id: updatePkgId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Updated Package Name",
    category: "commercial",
    discipline: "HYBRID",
    price: 750,
    depositPrice: 120,
    turnaround: "6 days",
    description: "Updated package description text",
    deliverables: "15 Edits + 4K Clip",
    isFeatured: true,
  });
  assert(updatePkgRes.success && updatePkgRes.package?.price === 750, "Update service package details succeeds");

  const crossUpdatePkg = await updateServicePackage({
    id: updatePkgId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    name: "Hacked Package Name",
    category: "commercial",
    discipline: "HYBRID",
    price: 999,
    depositPrice: 100,
    turnaround: "1 day",
    description: "Hacked description",
    deliverables: "All",
    isFeatured: false,
  });
  assert(!crossUpdatePkg.success && crossUpdatePkg.error === "PACKAGE_NOT_FOUND", "Cross-tenant package update rejected with PACKAGE_NOT_FOUND");

  await deleteServicePackage({ id: updatePkgId, tenantId: lumina.id, tenantSlug: lumina.slug });

  const catToggleTest = await createCampaignCategory({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Toggle Category Active Test",
    slug: `cat-toggle-${runId}`,
    sortOrder: 1,
    isActive: true,
  });
  assert(catToggleTest.success && !!catToggleTest.category, "Create category for toggle active test succeeds");
  const catToggleId = catToggleTest.category!.id;

  const toggleCatFalse = await toggleCategoryActive({
    id: catToggleId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: false,
  });
  assert(toggleCatFalse.success && toggleCatFalse.category?.isActive === false, "Toggle category active false succeeds");

  const toggleCatTrue = await toggleCategoryActive({
    id: catToggleId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: true,
  });
  assert(toggleCatTrue.success && toggleCatTrue.category?.isActive === true, "Toggle category active true succeeds");

  const crossCatToggle = await toggleCategoryActive({
    id: catToggleId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    isActive: false,
  });
  assert(!crossCatToggle.success && crossCatToggle.error === "CATEGORY_NOT_FOUND", "Cross-tenant category toggle active rejected with CATEGORY_NOT_FOUND");

  await deleteCampaignCategory({ id: catToggleId, tenantId: lumina.id, tenantSlug: lumina.slug });

  // ===========================================================================
  // SECTION 2: CALENDAR SLOTS STRESS TESTING
  // ===========================================================================
  console.log("\n--- [Section 2] Calendar Slots Stress Testing ---");

  // 2.1 Batch Slot Generation Over Complex Ranges & Boundary Intervals
  // Test boundary: dayStartTime >= dayEndTime rejected
  const invertedTimeRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    daysOfWeek: [0], // Sunday
    dayStartTime: "05:00 PM",
    dayEndTime: "09:00 AM", // Inverted
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    category: "STUDIO_PORTRAIT",
    price: 150,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(
    !invertedTimeRes.success && invertedTimeRes.error === "INVALID_TIME_RANGE",
    "Inverted day start/end time rejected with INVALID_TIME_RANGE"
  );

  // Test boundary: startDate > endDate rejected
  const invertedDateRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-11-15",
    endDate: "2026-11-10", // Inverted
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    dayStartTime: "09:00 AM",
    dayEndTime: "05:00 PM",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    category: "STUDIO_PORTRAIT",
    price: 150,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(
    !invertedDateRes.success && invertedDateRes.error === "INVALID_DATE_RANGE",
    "Inverted date range (start > end) rejected with INVALID_DATE_RANGE"
  );

  // Test boundary: slotDurationMinutes < 15 mins rejected by Zod
  const shortDurationRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    daysOfWeek: [0],
    dayStartTime: "09:00 AM",
    dayEndTime: "12:00 PM",
    slotDurationMinutes: 10, // < 15 mins minimum
    bufferMinutes: 0,
    category: "STUDIO_PORTRAIT",
    price: 150,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(!shortDurationRes.success, "Slot duration under 15 minutes rejected by Zod schema");

  // Test interval boundary calculation:
  // Window: 09:00 AM (540m) to 11:20 AM (680m) = 140 minutes total window
  // Slot duration = 60 mins, Buffer = 15 mins
  // Slot 1: 09:00 AM - 10:00 AM (curMin -> 615m)
  // Slot 2: 10:15 AM - 11:15 AM (curMin -> 690m)
  // 690m + 60m = 750m > 680m -> loop terminates!
  // Expected exactly 2 slots generated, no incomplete slots!
  const targetTestDate = "2026-12-16"; // Wednesday
  const boundaryGenRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: targetTestDate,
    endDate: targetTestDate,
    daysOfWeek: [3], // Wednesday
    dayStartTime: "09:00 AM",
    dayEndTime: "11:20 AM",
    slotDurationMinutes: 60,
    bufferMinutes: 15,
    category: "STUDIO_PORTRAIT",
    campaignTitle: "Boundary Stress Campaign",
    price: 200,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(
    boundaryGenRes.success && boundaryGenRes.createdCount === 2,
    `Interval arithmetic correctly generated exactly 2 slots in non-exact 140-minute window (got ${boundaryGenRes.createdCount})`
  );

  // Verify created slots in DB
  const createdBoundarySlots = await db.bookingSlot.findMany({
    where: {
      tenantId: lumina.id,
      date: new Date(`${targetTestDate}T00:00:00.000Z`),
      campaignTitle: "Boundary Stress Campaign",
    },
    orderBy: { startTime: "asc" },
  });
  assert(createdBoundarySlots.length === 2, "Verified 2 boundary slots stored in database");
  assert(
    createdBoundarySlots[0]?.startTime === "09:00 AM" && createdBoundarySlots[0]?.endTime === "10:00 AM",
    "Slot 1 window verified: 09:00 AM - 10:00 AM"
  );
  assert(
    createdBoundarySlots[1]?.startTime === "10:15 AM" && createdBoundarySlots[1]?.endTime === "11:15 AM",
    "Slot 2 window verified: 10:15 AM - 11:15 AM (accounts for 15-min buffer)"
  );

  // 2.2 Conflict Skipping Test
  // Re-run the exact same batch generation with skipConflicts: true
  const conflictSkipRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: targetTestDate,
    endDate: targetTestDate,
    daysOfWeek: [3],
    dayStartTime: "09:00 AM",
    dayEndTime: "11:20 AM",
    slotDurationMinutes: 60,
    bufferMinutes: 15,
    category: "STUDIO_PORTRAIT",
    campaignTitle: "Boundary Stress Campaign",
    price: 200,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(
    conflictSkipRes.success && conflictSkipRes.createdCount === 0 && conflictSkipRes.skippedCount === 2,
    `Conflict skipping succeeded: 0 created, 2 skipped (got created=${conflictSkipRes.createdCount}, skipped=${conflictSkipRes.skippedCount})`
  );

  // Verify DB count has NOT doubled
  const totalBoundaryInDb = await db.bookingSlot.count({
    where: {
      tenantId: lumina.id,
      date: new Date(`${targetTestDate}T00:00:00.000Z`),
      campaignTitle: "Boundary Stress Campaign",
    },
  });
  assert(totalBoundaryInDb === 2, "Database still contains exactly 2 slots (no duplicate rows created)");

  // Clean up boundary slots
  await db.bookingSlot.deleteMany({
    where: { id: { in: createdBoundarySlots.map((s) => s.id) } },
  });

  // Days of week selective filtering test (Weekends only: Sun=0, Sat=6)
  const dowGenRes = await batchGenerateBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    startDate: "2026-11-01",
    endDate: "2026-11-14",
    daysOfWeek: [0, 6], // Sundays (0) and Saturdays (6) only
    dayStartTime: "10:00 AM",
    dayEndTime: "12:00 PM",
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    category: "STUDIO_PORTRAIT",
    campaignTitle: "Weekend Only Campaign",
    price: 180,
    depositRequired: 50,
    skipConflicts: true,
  });
  assert(dowGenRes.success && (dowGenRes.createdCount ?? 0) > 0, `Weekend-only slot generation created ${dowGenRes.createdCount} slots`);

  const dowSlots = await db.bookingSlot.findMany({
    where: {
      tenantId: lumina.id,
      campaignTitle: "Weekend Only Campaign",
    },
  });
  const allWeekends = dowSlots.every((s) => {
    const day = s.date.getUTCDay();
    return day === 0 || day === 6;
  });
  assert(allWeekends, "Every generated slot strictly falls on weekend days (Sunday=0 or Saturday=6)");
  await db.bookingSlot.deleteMany({
    where: { id: { in: dowSlots.map((s) => s.id) } },
  });

  // 2.3 Force-Releasing HELD Slots Stress Testing
  // Create a single slot
  const testSlotRes = await createSingleBookingSlot({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    date: "2026-11-20",
    startTime: "02:00 PM",
    endTime: "03:00 PM",
    category: "STUDIO_PORTRAIT",
    price: 150,
    depositRequired: 50,
    status: "AVAILABLE",
  });
  assert(testSlotRes.success && !!testSlotRes.slot, "Created test slot for hold release testing");
  const testSlotId = testSlotRes.slot!.id;

  // Place slot in HELD status with active lease
  const holdExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const testSessionId = `session_challenger_${runId}`;
  await db.bookingSlot.update({
    where: { id: testSlotId },
    data: {
      status: "HELD",
      heldUntil: holdExpiry,
      heldBySessionId: testSessionId,
    },
  });

  // Cross-tenant force-release attempt must fail (Apex trying to release Lumina's slot)
  const crossTenantReleaseRes = await forceReleaseHeldSlot({
    slotId: testSlotId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
  });
  assert(
    !crossTenantReleaseRes.success && crossTenantReleaseRes.error === "NOT_HELD",
    "Cross-tenant force-release rejected with NOT_HELD"
  );

  // Verify slot remains HELD in DB
  const slotStillHeld = await db.bookingSlot.findUnique({ where: { id: testSlotId } });
  assert(
    slotStillHeld?.status === "HELD" && slotStillHeld.heldBySessionId === testSessionId,
    "Slot remains HELD after rejected cross-tenant release attempt"
  );

  // Legitimate force release by Lumina
  const legitimateReleaseRes = await forceReleaseHeldSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(legitimateReleaseRes.success, "Legitimate force release succeeded");

  // Verify in DB: status reverts to AVAILABLE, heldUntil is null, heldBySessionId is null
  const slotAfterRelease = await db.bookingSlot.findUnique({ where: { id: testSlotId } });
  assert(
    slotAfterRelease?.status === "AVAILABLE",
    "Slot status successfully reverted to AVAILABLE"
  );
  assert(
    slotAfterRelease?.heldUntil === null,
    "heldUntil timestamp successfully cleared to null"
  );
  assert(
    slotAfterRelease?.heldBySessionId === null,
    "heldBySessionId successfully cleared to null"
  );

  // Calling force release again on an already AVAILABLE slot must fail (conditional update)
  const doubleReleaseRes = await forceReleaseHeldSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !doubleReleaseRes.success && doubleReleaseRes.error === "NOT_HELD",
    "Force-releasing already AVAILABLE slot fails with NOT_HELD"
  );

  // Holding Engine: cleanupExpiredHolds verification
  const pastHoldTime = new Date(Date.now() - 5 * 60 * 1000); // 5 mins in past
  const futureHoldTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future

  const expiredLuminaSlot = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-25T00:00:00.000Z"),
      startTime: "09:00 AM",
      endTime: "10:00 AM",
      status: "HELD",
      heldUntil: pastHoldTime,
      heldBySessionId: "session_expired_lumina",
    },
  });

  const activeLuminaSlot = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-25T00:00:00.000Z"),
      startTime: "10:00 AM",
      endTime: "11:00 AM",
      status: "HELD",
      heldUntil: futureHoldTime,
      heldBySessionId: "session_active_lumina",
    },
  });

  const expiredApexSlot = await db.bookingSlot.create({
    data: {
      tenantId: apex.id,
      date: new Date("2026-11-25T00:00:00.000Z"),
      startTime: "09:00 AM",
      endTime: "10:00 AM",
      status: "HELD",
      heldUntil: pastHoldTime,
      heldBySessionId: "session_expired_apex",
    },
  });

  // Run cleanup for Lumina
  const cleanupRes = await cleanupExpiredHolds(lumina.id, lumina.slug);
  assert(cleanupRes.success && (cleanupRes.releasedCount ?? 0) >= 1, "cleanupExpiredHolds successfully executed for Lumina");

  // Verify expired Lumina slot was released
  const checkExpLumina = await db.bookingSlot.findUnique({ where: { id: expiredLuminaSlot.id } });
  assert(
    checkExpLumina?.status === "AVAILABLE" && checkExpLumina.heldUntil === null && checkExpLumina.heldBySessionId === null,
    "Expired Lumina held slot automatically reverted to AVAILABLE with hold fields cleared"
  );

  // Verify active Lumina slot was NOT released
  const checkActLumina = await db.bookingSlot.findUnique({ where: { id: activeLuminaSlot.id } });
  assert(
    checkActLumina?.status === "HELD" && checkActLumina.heldBySessionId === "session_active_lumina",
    "Active (non-expired) Lumina held slot remained HELD"
  );

  // Verify expired Apex slot was NOT released by Lumina cleanup
  const checkExpApex = await db.bookingSlot.findUnique({ where: { id: expiredApexSlot.id } });
  assert(
    checkExpApex?.status === "HELD" && checkExpApex.heldBySessionId === "session_expired_apex",
    "Cross-tenant isolation: Lumina cleanup did not release Apex expired hold"
  );

  // Clean up holding test slots
  await db.bookingSlot.deleteMany({
    where: { id: { in: [expiredLuminaSlot.id, activeLuminaSlot.id, expiredApexSlot.id] } },
  });

  // 2.4 Deleting BOOKED Slots Rejection
  // Put slot into BOOKED state
  await db.bookingSlot.update({
    where: { id: testSlotId },
    data: { status: "BOOKED" },
  });

  // Attempting to delete BOOKED slot must be rejected
  const deleteBookedRes = await deleteBookingSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !deleteBookedRes.success && deleteBookedRes.error === "SLOT_HAS_BOOKING",
    "Deleting BOOKED slot rejected with SLOT_HAS_BOOKING"
  );

  // Put slot into PENDING_VERIFICATION state
  await db.bookingSlot.update({
    where: { id: testSlotId },
    data: { status: "PENDING_VERIFICATION" },
  });
  const deletePendingRes = await deleteBookingSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !deletePendingRes.success && deletePendingRes.error === "SLOT_HAS_BOOKING",
    "Deleting PENDING_VERIFICATION slot rejected with SLOT_HAS_BOOKING"
  );

  // Test slot with actual ClientBooking relation attached
  const testBooking = await db.clientBooking.create({
    data: {
      tenantId: lumina.id,
      trackingCode: `TRK-CHLG-${runId}`,
      clientName: "Challenger Booked Client",
      clientEmail: "challenger@example.com",
      clientPhone: "+15550199999",
      discipline: "PHOTOGRAPHY",
      serviceTier: "STANDARD",
      status: "CONFIRMED",
      slotId: testSlotId,
    },
  });

  // Attempt to delete slot while linked to ClientBooking
  const deleteWithBookingRes = await deleteBookingSlot({
    slotId: testSlotId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !deleteWithBookingRes.success && deleteWithBookingRes.error === "SLOT_HAS_BOOKING",
    "Deleting slot with linked ClientBooking record rejected with SLOT_HAS_BOOKING"
  );

  // Clean up booking
  await db.clientBooking.delete({ where: { id: testBooking.id } });

  // 2.5 Batch Delete Mixed Slots
  // Create 2 additional AVAILABLE slots
  const availSlot1 = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-21T00:00:00.000Z"),
      startTime: "10:00 AM",
      endTime: "11:00 AM",
      status: "AVAILABLE",
    },
  });
  const availSlot2 = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-21T00:00:00.000Z"),
      startTime: "11:00 AM",
      endTime: "12:00 PM",
      status: "AVAILABLE",
    },
  });

  // Reset testSlotId to BOOKED
  await db.bookingSlot.update({
    where: { id: testSlotId },
    data: { status: "BOOKED" },
  });

  // Batch delete passing [availSlot1, availSlot2, testSlotId (BOOKED)]
  const batchDeleteMixedRes = await batchDeleteBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    slotIds: [availSlot1.id, availSlot2.id, testSlotId],
  });
  assert(
    batchDeleteMixedRes.success &&
      batchDeleteMixedRes.deletedCount === 2 &&
      batchDeleteMixedRes.skippedCount === 1,
    `Batch delete correctly deleted 2 AVAILABLE slots and skipped 1 BOOKED slot (deleted=${batchDeleteMixedRes.deletedCount}, skipped=${batchDeleteMixedRes.skippedCount})`
  );

  // Verify in DB: availSlot1 and availSlot2 are deleted; testSlotId still exists
  const availCheck = await db.bookingSlot.findMany({
    where: { id: { in: [availSlot1.id, availSlot2.id] } },
  });
  assert(availCheck.length === 0, "AVAILABLE slots verified deleted from database");

  const bookedCheck = await db.bookingSlot.findUnique({ where: { id: testSlotId } });
  assert(bookedCheck !== null && bookedCheck.status === "BOOKED", "BOOKED slot verified preserved in database");

  // Batch delete passing ONLY the BOOKED slot must fail with NO_DELETABLE_SLOTS
  const batchDeleteAllBookedRes = await batchDeleteBookingSlots({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    slotIds: [testSlotId],
  });
  assert(
    !batchDeleteAllBookedRes.success && batchDeleteAllBookedRes.error === "NO_DELETABLE_SLOTS",
    "Batch delete of exclusively BOOKED slots fails with NO_DELETABLE_SLOTS"
  );

  // Clean up testSlotId: revert to AVAILABLE and delete
  await db.bookingSlot.update({ where: { id: testSlotId }, data: { status: "AVAILABLE" } });
  await db.bookingSlot.delete({ where: { id: testSlotId } });

  // 2.6 Toggle Block Booking Slot
  const blockTestSlot = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-22T00:00:00.000Z"),
      startTime: "01:00 PM",
      endTime: "02:00 PM",
      status: "AVAILABLE",
    },
  });

  const toggleToBlocked = await toggleBlockBookingSlot({
    slotId: blockTestSlot.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    toggleToBlocked.success && toggleToBlocked.slot?.status === "BLOCKED",
    "Toggle block: AVAILABLE -> BLOCKED succeeds"
  );

  const toggleToAvailable = await toggleBlockBookingSlot({
    slotId: blockTestSlot.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    toggleToAvailable.success && toggleToAvailable.slot?.status === "AVAILABLE",
    "Toggle block: BLOCKED -> AVAILABLE succeeds"
  );

  // Clean up blockTestSlot
  await db.bookingSlot.delete({ where: { id: blockTestSlot.id } });

  // Attempt to toggle block on a HELD slot -> must fail with CANNOT_BLOCK
  const heldBlockSlot = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-26T00:00:00.000Z"),
      startTime: "03:00 PM",
      endTime: "04:00 PM",
      status: "HELD",
    },
  });
  const blockHeldRes = await toggleBlockBookingSlot({
    slotId: heldBlockSlot.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !blockHeldRes.success && blockHeldRes.error === "CANNOT_BLOCK",
    "Toggle block on HELD slot rejected with CANNOT_BLOCK"
  );

  // Attempt to toggle block on a BOOKED slot -> must fail with CANNOT_BLOCK
  await db.bookingSlot.update({ where: { id: heldBlockSlot.id }, data: { status: "BOOKED" } });
  const blockBookedRes = await toggleBlockBookingSlot({
    slotId: heldBlockSlot.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !blockBookedRes.success && blockBookedRes.error === "CANNOT_BLOCK",
    "Toggle block on BOOKED slot rejected with CANNOT_BLOCK"
  );

  // Cross-tenant toggle block -> fails with SLOT_NOT_FOUND
  const crossBlockRes = await toggleBlockBookingSlot({
    slotId: heldBlockSlot.id,
    tenantId: apex.id,
    tenantSlug: apex.slug,
  });
  assert(
    !crossBlockRes.success && crossBlockRes.error === "SLOT_NOT_FOUND",
    "Cross-tenant toggle block rejected with SLOT_NOT_FOUND"
  );
  await db.bookingSlot.delete({ where: { id: heldBlockSlot.id } });

  // 2.7 UpdateBookingSlot: Guard status change on booked slot
  const slotWithBooking = await db.bookingSlot.create({
    data: {
      tenantId: lumina.id,
      date: new Date("2026-11-27T00:00:00.000Z"),
      startTime: "09:00 AM",
      endTime: "10:00 AM",
      status: "BOOKED",
    },
  });
  const attachedBooking = await db.clientBooking.create({
    data: {
      tenantId: lumina.id,
      trackingCode: `TRK-UPDATE-GUARD-${runId}`,
      clientName: "Guard Booking Client",
      clientEmail: "guard@example.com",
      clientPhone: "+15550188888",
      discipline: "PHOTOGRAPHY",
      serviceTier: "STANDARD",
      status: "CONFIRMED",
      slotId: slotWithBooking.id,
    },
  });

  const illegalStatusChangeRes = await updateBookingSlot({
    id: slotWithBooking.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    status: "AVAILABLE",
  });
  assert(
    !illegalStatusChangeRes.success && illegalStatusChangeRes.error === "SLOT_HAS_BOOKING",
    "Changing status of slot with active booking to AVAILABLE rejected with SLOT_HAS_BOOKING"
  );

  // Cross-tenant update booking slot
  const crossUpdateSlot = await updateBookingSlot({
    id: slotWithBooking.id,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    price: 300,
  });
  assert(
    !crossUpdateSlot.success && crossUpdateSlot.error === "SLOT_NOT_FOUND",
    "Cross-tenant slot update rejected with SLOT_NOT_FOUND"
  );

  await db.clientBooking.delete({ where: { id: attachedBooking.id } });
  await db.bookingSlot.delete({ where: { id: slotWithBooking.id } });

  // ===========================================================================
  // SECTION 3: PROPOSAL ADD-ON TEMPLATES STRESS TESTING
  // ===========================================================================
  console.log("\n--- [Section 3] Proposal Add-On Templates Stress Testing ---");

  // 3.1 Unusual Pricing Boundaries
  // $0.00 free add-on
  const freeAddonRes = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Free Complimentary Consultation",
    description: "30-minute pre-shoot concept planning consultation",
    price: 0.0,
    unit: "fixed",
    isDefault: false,
    isActive: true,
  });
  assert(freeAddonRes.success && !!freeAddonRes.template, "Create $0.00 complimentary add-on template succeeds");
  const freeAddonId = freeAddonRes.template!.id;

  // High-value add-on ($99,999.99)
  const highValAddonRes = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Ultra-High Budget Production Helicopter Rig",
    description: "Full day dual helicopter Cineflex aerial gyro-stabilized camera package",
    price: 99999.99,
    unit: "per_day",
    isDefault: false,
    isActive: true,
  });
  assert(highValAddonRes.success && !!highValAddonRes.template, "Create high-value ($99,999.99) add-on template succeeds");
  const highValAddonId = highValAddonRes.template!.id;

  // Negative price must be rejected by Zod
  const negativePriceAddon = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Illegal Negative Price Add-On",
    description: "Negative price should fail",
    price: -45.0,
    unit: "fixed",
    isDefault: false,
    isActive: true,
  });
  assert(
    !negativePriceAddon.success && negativePriceAddon.error === "CREATE_TEMPLATE_FAILED",
    "Negative price add-on template rejected by Zod schema"
  );

  // Non-existent tenantId must be rejected
  const ghostTenantAddon = await createProposalAddOnTemplate({
    tenantId: "ten_nonexistent_ghost",
    tenantSlug: "ghost-studio",
    name: "Ghost Tenant Add-On",
    description: "Should fail tenant verification",
    price: 100.0,
    unit: "fixed",
    isDefault: false,
    isActive: true,
  });
  assert(
    !ghostTenantAddon.success && ghostTenantAddon.error === "TENANT_NOT_FOUND",
    "Add-on template creation for non-existent tenant rejected with TENANT_NOT_FOUND"
  );

  // 3.2 Unit Types Validation
  // Valid unit types: fixed, per_hour, per_day
  const perHourRes = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Overtime Hourly Extension",
    description: "Additional production coverage beyond scheduled call sheet",
    price: 150.0,
    unit: "per_hour",
    isDefault: false,
    isActive: true,
  });
  assert(perHourRes.success && perHourRes.template?.unit === "per_hour", "Create add-on with 'per_hour' unit succeeds");
  const perHourId = perHourRes.template!.id;

  // Invalid unit type rejected by Zod enum
  const invalidUnitRes = await createProposalAddOnTemplate({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Invalid Unit Add-On",
    description: "Testing unsupported unit string",
    price: 100.0,
    unit: "per_kilometer" as any,
    isDefault: false,
    isActive: true,
  });
  assert(
    !invalidUnitRes.success && invalidUnitRes.error === "CREATE_TEMPLATE_FAILED",
    "Invalid unit type ('per_kilometer') rejected by Zod enum validation"
  );

  // 3.3 Toggling Default & Active Statuses
  // Toggle default: false -> true -> false
  const toggleDef1 = await toggleAddOnTemplateDefault({
    id: freeAddonId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isDefault: true,
  });
  assert(toggleDef1.success && toggleDef1.template?.isDefault === true, "Toggle isDefault: false -> true succeeds");
  const dbDef1 = await db.proposalAddOnTemplate.findUnique({ where: { id: freeAddonId } });
  assert(dbDef1?.isDefault === true, "isDefault: true persisted in SQLite");

  const toggleDef2 = await toggleAddOnTemplateDefault({
    id: freeAddonId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isDefault: false,
  });
  assert(toggleDef2.success && toggleDef2.template?.isDefault === false, "Toggle isDefault: true -> false succeeds");
  const dbDef2 = await db.proposalAddOnTemplate.findUnique({ where: { id: freeAddonId } });
  assert(dbDef2?.isDefault === false, "isDefault: false persisted in SQLite");

  // Toggle active: true -> false -> true
  const toggleAct1 = await toggleAddOnTemplateActive({
    id: freeAddonId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: false,
  });
  assert(toggleAct1.success && toggleAct1.template?.isActive === false, "Toggle isActive: true -> false succeeds");
  const dbAct1 = await db.proposalAddOnTemplate.findUnique({ where: { id: freeAddonId } });
  assert(dbAct1?.isActive === false, "isActive: false persisted in SQLite");

  const toggleAct2 = await toggleAddOnTemplateActive({
    id: freeAddonId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: true,
  });
  assert(toggleAct2.success && toggleAct2.template?.isActive === true, "Toggle isActive: false -> true succeeds");
  const dbAct2 = await db.proposalAddOnTemplate.findUnique({ where: { id: freeAddonId } });
  assert(dbAct2?.isActive === true, "isActive: true persisted in SQLite");

  // 3.4 Cross-Tenant Security & Deletion
  // Apex trying to toggle Lumina's template must fail
  const crossToggle = await toggleAddOnTemplateDefault({
    id: freeAddonId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    isDefault: true,
  });
  assert(
    !crossToggle.success && crossToggle.error === "TEMPLATE_NOT_FOUND",
    "Cross-tenant toggle default rejected with TEMPLATE_NOT_FOUND"
  );

  // Update proposal add-on template
  const updateTemplateRes = await updateProposalAddOnTemplate({
    id: perHourId,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Updated Overtime Extension",
    description: "Updated overtime rate description with full details",
    price: 175.0,
    unit: "per_hour",
    isDefault: true,
    isActive: true,
  });
  assert(updateTemplateRes.success && updateTemplateRes.template?.price === 175.0, "Update proposal add-on template details succeeds");

  const crossUpdateTemplate = await updateProposalAddOnTemplate({
    id: perHourId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
    name: "Hacked Template",
    description: "Hacked description",
    price: 50.0,
    unit: "fixed",
    isDefault: false,
    isActive: true,
  });
  assert(
    !crossUpdateTemplate.success && crossUpdateTemplate.error === "TEMPLATE_NOT_FOUND",
    "Cross-tenant template update rejected with TEMPLATE_NOT_FOUND"
  );

  // Apex trying to delete Lumina's template must fail
  const crossDelete = await deleteProposalAddOnTemplate({
    id: freeAddonId,
    tenantId: apex.id,
    tenantSlug: apex.slug,
  });
  assert(
    !crossDelete.success && crossDelete.error === "TEMPLATE_NOT_FOUND",
    "Cross-tenant delete template rejected with TEMPLATE_NOT_FOUND"
  );

  // Clean up created templates
  await deleteProposalAddOnTemplate({ id: freeAddonId, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteProposalAddOnTemplate({ id: highValAddonId, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteProposalAddOnTemplate({ id: perHourId, tenantId: lumina.id, tenantSlug: lumina.slug });

  const templatesCheck = await db.proposalAddOnTemplate.findMany({
    where: { id: { in: [freeAddonId, highValAddonId, perHourId] } },
  });
  assert(templatesCheck.length === 0, "All challenger add-on templates cleanly removed from SQLite");

  // ===========================================================================
  // SUMMARY REPORT
  // ===========================================================================
  const durationMs = Date.now() - startTime;
  console.log("\n===============================================================================");
  console.log(`   TOTAL ASSERTIONS: ${assertionsPassed + assertionsFailed}`);
  console.log(`   PASSED:           ${assertionsPassed}`);
  console.log(`   FAILED:           ${assertionsFailed}`);
  console.log(`   DURATION:         ${durationMs}ms`);
  console.log("===============================================================================");

  if (assertionsFailed > 0) {
    console.error("\n❌ VERDICT: REJECT — Challenger stress suite found failures.");
    process.exit(1);
  } else {
    console.log("\n🎉 VERDICT: APPROVE — All Milestone 5 stress challenges satisfied with zero failures!");
    process.exit(0);
  }
}

runChallengerSuite().catch((err) => {
  console.error("Fatal exception in challenger suite:", err);
  process.exit(1);
});
