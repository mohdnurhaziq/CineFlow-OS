/**
 * Empirical Challenger Verification Suite: Milestone 5
 * Target: Frames, Showcase CMS, Studio Settings, and Multi-Tenant Isolation
 * File: tests/challenger-m5-frames-settings.ts
 *
 * Verifies:
 * 1. Frames & Print Sizes Stress Testing (admin-frames.ts)
 *    - Duplicate print size code rejection within tenant (exact, case, whitespace)
 *    - Multi-tenant print size code coexistence across distinct tenants
 *    - Print size code collision guard on update
 *    - Cross-tenant frame mutation rejection (update, toggle availability, delete)
 *    - Cross-tenant print size mutation rejection (update, delete)
 *    - Persistence and integrity check of target tenant data
 * 2. Showcase CMS Stress Testing (admin-cms.ts)
 *    - Creation with gallery JSON arrays and custom sort orders
 *    - Update with gallery modifications
 *    - Multi-item reordering verification with database order check
 *    - Feature status toggle
 *    - Cross-tenant showcase item isolation (update, toggle, delete rejection)
 * 3. Studio Settings & Slug Collisions (admin-settings.ts)
 *    - Updating branding (brandColor, bio, tagline), bankDetails, and qrCodeUrl
 *    - Strict slug collision rejection when attempting to claim another studio's slug
 *    - Database immutability verification (slug remains unchanged after collision attempt)
 *    - Custom domain collision rejection
 *    - Slug format regex validation rejection
 *    - Pristine state restoration
 * 4. Multi-Tenant Scoping Stress Across All Admin Actions
 *    - Cross-tenant service packages mutation rejection
 *    - Cross-tenant campaign categories mutation rejection
 *    - Cross-tenant calendar slots mutation rejection
 *    - Cross-tenant proposal add-on templates mutation rejection
 *    - Cross-tenant invoice payment verification approval & rejection
 */

import { db } from "../lib/db";
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
import {
  updateServicePackage,
  deleteServicePackage,
  togglePackageFeatured,
  updateCampaignCategory,
  deleteCampaignCategory,
  toggleCategoryActive,
} from "../lib/actions/admin-services";
import {
  updateBookingSlot,
  toggleBlockBookingSlot,
  deleteBookingSlot,
} from "../lib/actions/admin-calendar";
import {
  updateProposalAddOnTemplate,
  toggleAddOnTemplateDefault,
  deleteProposalAddOnTemplate,
} from "../lib/actions/admin-proposals";
import {
  approvePaymentVerification,
  rejectPaymentVerification,
} from "../lib/actions/admin-verification";

let passedCount = 0;
let failedCount = 0;
const failureDetails: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    const msg = `  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ""}`;
    console.error(msg);
    failureDetails.push(msg);
    failedCount++;
  }
}

async function runChallengerSuite() {
  console.log("\n================================================================================");
  console.log("   CINEFLOW OS — EMPIRICAL CHALLENGER SUITE: MILESTONE 5 (FRAMES, CMS, SETTINGS)   ");
  console.log("================================================================================\n");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!lumina || !apex) {
    throw new Error("Missing test tenants in database. Please run seed script first.");
  }

  console.log(`[Context] Lumina Tenant ID: ${lumina.id} (${lumina.slug})`);
  console.log(`[Context] Apex Tenant ID:   ${apex.id} (${apex.slug})\n`);

  // ===========================================================================
  // SECTION 1: Frames & Print Sizes Stress Testing
  // ===========================================================================
  console.log("--- [Suite 1] Frames & Print Sizes Stress Testing (admin-frames.ts) ---");

  // 1.1 Existing Seed Code Rejection
  const duplicateSeedCodeRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: "8R", // Already exists in Lumina
    name: "Duplicate 8R",
    widthInches: 8,
    heightInches: 10,
    basePrice: 50,
  });
  assert(
    !duplicateSeedCodeRes.success && duplicateSeedCodeRes.error === "CODE_EXISTS",
    "1.1 Seed print size code duplicate rejection ('8R')",
    `Result: ${JSON.stringify(duplicateSeedCodeRes)}`
  );

  // 1.2 Create custom print size for Lumina (max 10 chars, so 4-char code allows whitespace padding)
  const codeAlpha = `C${Date.now().toString().slice(-3)}`;
  const createPrintSizeRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeAlpha,
    name: "Challenger Alpha Size",
    widthInches: 11,
    heightInches: 14,
    basePrice: 65,
  });
  assert(
    createPrintSizeRes.success && !!createPrintSizeRes.printSize,
    `1.2 Create new unique print size '${codeAlpha}' for Lumina`,
    `Result: ${JSON.stringify(createPrintSizeRes)}`
  );
  const luminaPrintSizeId = createPrintSizeRes.printSize?.id;

  // 1.3 Exact duplicate code in same tenant
  const exactDuplicateRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeAlpha,
    name: "Exact Duplicate Print Size",
    widthInches: 11,
    heightInches: 14,
    basePrice: 70,
  });
  assert(
    !exactDuplicateRes.success && exactDuplicateRes.error === "CODE_EXISTS",
    `1.3 Exact duplicate print size code rejection ('${codeAlpha}')`,
    `Result: ${JSON.stringify(exactDuplicateRes)}`
  );

  // 1.4 Case-insensitive normalization test (lowercase)
  const lowerCaseDuplicateRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeAlpha.toLowerCase(),
    name: "Lowercase Duplicate Print Size",
    widthInches: 11,
    heightInches: 14,
    basePrice: 70,
  });
  assert(
    !lowerCaseDuplicateRes.success && lowerCaseDuplicateRes.error === "CODE_EXISTS",
    `1.4 Case normalization duplicate rejection ('${codeAlpha.toLowerCase()}')`,
    `Result: ${JSON.stringify(lowerCaseDuplicateRes)}`
  );

  // 1.5 Whitespace normalization test (length: 2 + 4 + 2 = 8 <= 10)
  const whitespaceDuplicateRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: `  ${codeAlpha}  `,
    name: "Whitespace Duplicate Print Size",
    widthInches: 11,
    heightInches: 14,
    basePrice: 70,
  });
  assert(
    !whitespaceDuplicateRes.success && whitespaceDuplicateRes.error === "CODE_EXISTS",
    `1.5 Whitespace trimmed duplicate rejection ('  ${codeAlpha}  ')`,
    `Result: ${JSON.stringify(whitespaceDuplicateRes)}`
  );

  // 1.6 Multi-tenant code coexistence: Apex CAN create the same codeAlpha
  const apexSameCodeRes = await createPrintSize({
    tenantId: apex.id,
    tenantSlug: apex.slug,
    code: codeAlpha,
    name: "Apex Sibling Print Size",
    widthInches: 11,
    heightInches: 14,
    basePrice: 80,
  });
  assert(
    apexSameCodeRes.success && !!apexSameCodeRes.printSize,
    `1.6 Cross-tenant code coexistence: Apex successfully creates '${codeAlpha}'`,
    `Result: ${JSON.stringify(apexSameCodeRes)}`
  );
  const apexPrintSizeId = apexSameCodeRes.printSize?.id;

  // 1.7 Create second size for Lumina to test update collision
  const codeBeta = `B${Date.now().toString().slice(-3)}`;
  const luminaSizeBetaRes = await createPrintSize({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeBeta,
    name: "Challenger Beta Size",
    widthInches: 12,
    heightInches: 18,
    basePrice: 90,
  });
  const luminaBetaId = luminaSizeBetaRes.printSize?.id;

  // Attempt to update size Beta's code to size Alpha's code
  const updateCollisionRes = await updatePrintSize({
    id: luminaBetaId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeAlpha, // Collides with luminaPrintSizeId
    name: "Challenger Beta Renamed",
    widthInches: 12,
    heightInches: 18,
    basePrice: 95,
  });
  assert(
    !updateCollisionRes.success && updateCollisionRes.error === "CODE_EXISTS",
    "1.7 Print size update code collision guard (Beta -> Alpha)",
    `Result: ${JSON.stringify(updateCollisionRes)}`
  );

  // Valid update without code collision
  const validUpdateRes = await updatePrintSize({
    id: luminaBetaId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: codeBeta,
    name: "Challenger Beta Updated",
    widthInches: 13,
    heightInches: 19,
    basePrice: 99,
  });
  assert(
    validUpdateRes.success && validUpdateRes.printSize?.basePrice === 99,
    "1.8 Valid print size update succeeds without changing code",
    `Result: ${JSON.stringify(validUpdateRes)}`
  );

  // 1.9 Create an Apex Frame Design for cross-tenant testing
  const apexFrameRes = await createFrameDesign({
    tenantId: apex.id,
    tenantSlug: apex.slug,
    name: "Apex Imperial Gold Frame",
    material: "Solid Maple Wood",
    moldingWidth: 2.75,
    frameColor: "#d4af37",
    previewAsset: "/uploads/frames/apex_gold_sample.png",
    priceOffset: 120,
    isAvailable: true,
  });
  assert(
    apexFrameRes.success && !!apexFrameRes.frame,
    "1.9 Create Apex Frame Design target entity",
    `Result: ${JSON.stringify(apexFrameRes)}`
  );
  const apexFrameId = apexFrameRes.frame?.id;

  // 1.10 Cross-tenant Frame Update: Lumina attempts to mutate Apex's frame
  const crossFrameUpdateRes = await updateFrameDesign({
    id: apexFrameId!,
    tenantId: lumina.id, // Hostile tenant attempt
    tenantSlug: lumina.slug,
    name: "Hostile Hijacked Frame",
    material: "Plastic",
    moldingWidth: 1.0,
    frameColor: "#000000",
    previewAsset: "/uploads/hacked.png",
    priceOffset: 1,
    isAvailable: false,
  });
  assert(
    !crossFrameUpdateRes.success && crossFrameUpdateRes.error === "FRAME_NOT_FOUND",
    "1.10 Cross-tenant frame update rejected with FRAME_NOT_FOUND",
    `Result: ${JSON.stringify(crossFrameUpdateRes)}`
  );

  // 1.11 Cross-tenant Frame Toggle: Lumina attempts to toggle Apex frame availability
  const crossFrameToggleRes = await toggleFrameAvailability({
    id: apexFrameId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isAvailable: false,
  });
  assert(
    !crossFrameToggleRes.success && crossFrameToggleRes.error === "FRAME_NOT_FOUND",
    "1.11 Cross-tenant frame toggle rejected with FRAME_NOT_FOUND",
    `Result: ${JSON.stringify(crossFrameToggleRes)}`
  );

  // 1.12 Cross-tenant Frame Delete: Lumina attempts to delete Apex frame
  const crossFrameDeleteRes = await deleteFrameDesign({
    id: apexFrameId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossFrameDeleteRes.success && crossFrameDeleteRes.error === "FRAME_NOT_FOUND",
    "1.12 Cross-tenant frame deletion rejected with FRAME_NOT_FOUND",
    `Result: ${JSON.stringify(crossFrameDeleteRes)}`
  );

  // 1.13 Cross-tenant Print Size Update: Lumina attempts to mutate Apex's print size
  const crossSizeUpdateRes = await updatePrintSize({
    id: apexPrintSizeId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    code: "HIJACKED",
    name: "Hijacked Size",
    widthInches: 5,
    heightInches: 5,
    basePrice: 5,
  });
  assert(
    !crossSizeUpdateRes.success && crossSizeUpdateRes.error === "PRINT_SIZE_NOT_FOUND",
    "1.13 Cross-tenant print size update rejected with PRINT_SIZE_NOT_FOUND",
    `Result: ${JSON.stringify(crossSizeUpdateRes)}`
  );

  // 1.14 Cross-tenant Print Size Delete: Lumina attempts to delete Apex's print size
  const crossSizeDeleteRes = await deletePrintSize({
    id: apexPrintSizeId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossSizeDeleteRes.success && crossSizeDeleteRes.error === "PRINT_SIZE_NOT_FOUND",
    "1.14 Cross-tenant print size deletion rejected with PRINT_SIZE_NOT_FOUND",
    `Result: ${JSON.stringify(crossSizeDeleteRes)}`
  );

  // 1.15 Database Verification: Verify Apex frame and print size are unmodified
  const apexFrameInDb = await db.frameDesign.findUnique({ where: { id: apexFrameId } });
  const apexPrintSizeInDb = await db.printSize.findUnique({ where: { id: apexPrintSizeId } });
  assert(
    apexFrameInDb?.name === "Apex Imperial Gold Frame" &&
      apexFrameInDb?.isAvailable === true &&
      apexPrintSizeInDb?.code === codeAlpha,
    "1.15 Database integrity: Apex frame and print size intact in SQLite"
  );

  // 1.16 Clean up test frames and sizes
  await deleteFrameDesign({ id: apexFrameId!, tenantId: apex.id, tenantSlug: apex.slug });
  await deletePrintSize({ id: apexPrintSizeId!, tenantId: apex.id, tenantSlug: apex.slug });
  await deletePrintSize({ id: luminaPrintSizeId!, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deletePrintSize({ id: luminaBetaId!, tenantId: lumina.id, tenantSlug: lumina.slug });
  console.log("  [Cleanup] Cleaned up temporary test frames and print sizes.");

  // ===========================================================================
  // SECTION 2: Showcase CMS Stress Testing
  // ===========================================================================
  console.log("\n--- [Suite 2] Showcase CMS Stress Testing (admin-cms.ts) ---");

  // 2.1 Create Showcase Item with Complex JSON Gallery Array
  const galleryArray = [
    "/uploads/showcase/cinematic_hero_1.jpg",
    "/uploads/showcase/cinematic_hero_2.jpg",
    "/uploads/showcase/cinematic_hero_3.jpg",
  ];
  const galleryJson = JSON.stringify(galleryArray);

  const createShowcaseRes = await createShowcaseItem({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Challenger Aurora Campaign",
    clientName: "Nordic Motors Co.",
    category: "COMMERCIAL",
    discipline: "HYBRID",
    coverImageUrl: "/uploads/showcase/aurora_cover.jpg",
    videoEmbedUrl: "https://vimeo.com/123456789",
    galleryImages: galleryJson,
    isFeatured: true,
    sortOrder: 10,
  });
  assert(
    createShowcaseRes.success && !!createShowcaseRes.item,
    "2.1 Create showcase item with gallery JSON array string",
    `Result: ${JSON.stringify(createShowcaseRes)}`
  );
  const showcaseItemId = createShowcaseRes.item?.id;

  // 2.2 Verify JSON gallery array in SQLite DB
  const showcaseInDb = await db.showcaseItem.findUnique({ where: { id: showcaseItemId } });
  const parsedGallery = JSON.parse(showcaseInDb?.galleryImages || "[]");
  assert(
    Array.isArray(parsedGallery) && parsedGallery.length === 3 && parsedGallery[1] === galleryArray[1],
    "2.2 Verified gallery JSON deserialization matches exact 3 URLs in DB"
  );

  // 2.3 Update Showcase Item with Modified Gallery & Properties
  const updatedGalleryJson = JSON.stringify([
    "/uploads/showcase/cinematic_revised_1.jpg",
    "/uploads/showcase/cinematic_revised_2.jpg",
  ]);
  const updateShowcaseRes = await updateShowcaseItem({
    id: showcaseItemId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Challenger Aurora Campaign (Director Cut)",
    clientName: "Nordic Motors Global",
    category: "COMMERCIAL",
    discipline: "VIDEOGRAPHY",
    coverImageUrl: "/uploads/showcase/aurora_cut.jpg",
    videoEmbedUrl: "https://vimeo.com/987654321",
    galleryImages: updatedGalleryJson,
    isFeatured: true,
    sortOrder: 15,
  });
  assert(
    updateShowcaseRes.success &&
      updateShowcaseRes.item?.clientName === "Nordic Motors Global" &&
      updateShowcaseRes.item?.sortOrder === 15,
    "2.3 Update showcase item with modified gallery and discipline",
    `Result: ${JSON.stringify(updateShowcaseRes)}`
  );

  // 2.4 Multi-Item Reordering Test
  // Create 3 temporary items with distinct sortOrders: 10, 20, 30
  const itemA = await createShowcaseItem({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item A",
    clientName: "Client A",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/a.jpg",
    sortOrder: 10,
    isFeatured: false,
  });
  const itemB = await createShowcaseItem({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item B",
    clientName: "Client B",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/b.jpg",
    sortOrder: 20,
    isFeatured: false,
  });
  const itemC = await createShowcaseItem({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item C",
    clientName: "Client C",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/c.jpg",
    sortOrder: 30,
    isFeatured: false,
  });

  const idA = itemA.item!.id;
  const idB = itemB.item!.id;
  const idC = itemC.item!.id;

  // Reorder items: C becomes first (5), A becomes middle (15), B becomes last (25)
  await updateShowcaseItem({
    id: idC,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item C",
    clientName: "Client C",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/c.jpg",
    sortOrder: 5,
    isFeatured: false,
  });
  await updateShowcaseItem({
    id: idA,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item A",
    clientName: "Client A",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/a.jpg",
    sortOrder: 15,
    isFeatured: false,
  });
  await updateShowcaseItem({
    id: idB,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    title: "Reorder Item B",
    clientName: "Client B",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/b.jpg",
    sortOrder: 25,
    isFeatured: false,
  });

  // Query database ordering
  const reorderedItems = await db.showcaseItem.findMany({
    where: { id: { in: [idA, idB, idC] } },
    orderBy: { sortOrder: "asc" },
  });
  assert(
    Boolean(
      reorderedItems.length === 3 &&
        reorderedItems[0]?.id === idC &&
        reorderedItems[1]?.id === idA &&
        reorderedItems[2]?.id === idB
    ),
    "2.4 Multi-item reordering verified in SQLite (C=5, A=15, B=25)"
  );

  // 2.5 Toggle Featured Status
  const toggleOffRes = await toggleShowcaseFeatured({
    id: showcaseItemId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: false,
  });
  const toggleOnRes = await toggleShowcaseFeatured({
    id: showcaseItemId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: true,
  });
  assert(
    toggleOffRes.success &&
      toggleOffRes.item?.isFeatured === false &&
      toggleOnRes.success &&
      toggleOnRes.item?.isFeatured === true,
    "2.5 Showcase featured status toggling (true -> false -> true)"
  );

  // 2.6 Cross-Tenant Showcase Item Isolation
  // Create an item for Apex
  const apexShowcaseRes = await createShowcaseItem({
    tenantId: apex.id,
    tenantSlug: apex.slug,
    title: "Apex Prestige Campaign",
    clientName: "Royal Selangor",
    category: "COMMERCIAL",
    discipline: "HYBRID",
    coverImageUrl: "/uploads/apex_prestige.jpg",
    sortOrder: 1,
    isFeatured: true,
  });
  const apexShowcaseId = apexShowcaseRes.item?.id;

  // Lumina attempts to update Apex showcase item
  const crossCmsUpdate = await updateShowcaseItem({
    id: apexShowcaseId!,
    tenantId: lumina.id, // Hostile tenant
    tenantSlug: lumina.slug,
    title: "Hostile Overwrite",
    clientName: "Hacker Corp",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY",
    coverImageUrl: "/uploads/hacked.jpg",
    sortOrder: 999,
    isFeatured: false,
  });
  assert(
    !crossCmsUpdate.success && crossCmsUpdate.error === "ITEM_NOT_FOUND",
    "2.6 Cross-tenant showcase item update rejected with ITEM_NOT_FOUND",
    `Result: ${JSON.stringify(crossCmsUpdate)}`
  );

  // Lumina attempts to toggle featured on Apex showcase item
  const crossCmsToggle = await toggleShowcaseFeatured({
    id: apexShowcaseId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: false,
  });
  assert(
    !crossCmsToggle.success && crossCmsToggle.error === "ITEM_NOT_FOUND",
    "2.7 Cross-tenant showcase featured toggle rejected with ITEM_NOT_FOUND",
    `Result: ${JSON.stringify(crossCmsToggle)}`
  );

  // Lumina attempts to delete Apex showcase item
  const crossCmsDelete = await deleteShowcaseItem({
    id: apexShowcaseId!,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossCmsDelete.success && crossCmsDelete.error === "ITEM_NOT_FOUND",
    "2.8 Cross-tenant showcase deletion rejected with ITEM_NOT_FOUND",
    `Result: ${JSON.stringify(crossCmsDelete)}`
  );

  // Verify Apex showcase item remains intact in DB
  const apexShowcaseInDb = await db.showcaseItem.findUnique({ where: { id: apexShowcaseId } });
  assert(
    apexShowcaseInDb?.title === "Apex Prestige Campaign" && apexShowcaseInDb?.isFeatured === true,
    "2.9 Database verification: Apex showcase item untouched in SQLite"
  );

  // Clean up created showcase items
  await deleteShowcaseItem({ id: showcaseItemId!, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteShowcaseItem({ id: idA, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteShowcaseItem({ id: idB, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteShowcaseItem({ id: idC, tenantId: lumina.id, tenantSlug: lumina.slug });
  await deleteShowcaseItem({ id: apexShowcaseId!, tenantId: apex.id, tenantSlug: apex.slug });
  console.log("  [Cleanup] Cleaned up temporary test showcase items.");

  // ===========================================================================
  // SECTION 3: Studio Settings & Slug Collisions
  // ===========================================================================
  console.log("\n--- [Suite 3] Studio Settings & Slug Collisions (admin-settings.ts) ---");

  // 3.1 Snapshot original Lumina settings
  const originalLumina = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });

  // 3.2 Update Studio Branding, Bank Information, and QR Code URL
  const updateSettingsRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Lumina CineWorks - Challenger Studio",
    newSlug: lumina.slug, // Maintain current slug
    customDomain: lumina.customDomain,
    discipline: "HYBRID",
    tagline: "Where Light Meets Motion — Challenger Suite",
    bio: "Pioneering cinematic visual storytelling for premier commercial brands and discerning couples.",
    logoUrl: "/uploads/branding/lumina_challenger_logo.svg",
    brandColor: "#6366f1",
    currency: "USD",
    qrCodeUrl: "/uploads/receipts/challenger_duitnow_qr.png",
    bankDetails: "Maybank Islamic Berhad\nAccount: 5140-1234-9999\nBeneficiary: Lumina CineWorks Escrow",
  });
  assert(
    updateSettingsRes.success && updateSettingsRes.tenant?.brandColor === "#6366f1",
    "3.1 Update studio branding, bank information, and QR code URL",
    `Result: ${JSON.stringify(updateSettingsRes)}`
  );

  // 3.3 Verify DB Persistence of Updated Settings
  const luminaUpdatedInDb = await db.tenant.findUnique({ where: { id: lumina.id } });
  assert(
    Boolean(
      luminaUpdatedInDb?.brandColor === "#6366f1" &&
        luminaUpdatedInDb?.tagline === "Where Light Meets Motion — Challenger Suite" &&
        luminaUpdatedInDb?.qrCodeUrl === "/uploads/receipts/challenger_duitnow_qr.png" &&
        luminaUpdatedInDb?.bankDetails?.includes("5140-1234-9999")
    ),
    "3.2 Verified persistence of branding, bank details, and QR URL in SQLite"
  );

  // 3.4 Strict Slug Collision Rejection: Lumina attempts to claim Apex's slug
  const slugCollisionRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Lumina CineWorks Hostile",
    newSlug: apex.slug, // Collision target!
    customDomain: lumina.customDomain,
    discipline: "HYBRID",
    brandColor: "#6366f1",
    currency: "USD",
  });
  // Accepts either SLUG_EXISTS or SLUG_TAKEN as compliant conflict rejection
  const isSlugRejected =
    !slugCollisionRes.success &&
    (slugCollisionRes.error === "SLUG_EXISTS" || slugCollisionRes.error === "SLUG_TAKEN");
  assert(
    isSlugRejected,
    `3.3 Strict slug collision rejection (claimed 'apex-media' rejected with ${slugCollisionRes.error})`,
    `Result: ${JSON.stringify(slugCollisionRes)}`
  );

  // 3.5 Database Immutability Check: Ensure Lumina's slug NEVER changed to Apex's slug
  const luminaDbCheck = await db.tenant.findUnique({ where: { id: lumina.id } });
  assert(
    luminaDbCheck?.slug === lumina.slug && luminaDbCheck?.slug !== apex.slug,
    "3.4 Database immutability: Lumina slug remained unchanged in SQLite"
  );

  // 3.6 Slug Format Validation Rejection (Invalid Characters)
  const invalidSlugRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Lumina CineWorks Invalid",
    newSlug: "INVALID SLUG WITH SPACES!",
    discipline: "HYBRID",
    brandColor: "#6366f1",
    currency: "USD",
  });
  assert(
    !invalidSlugRes.success,
    "3.5 Schema regex rejection for invalid slug characters ('INVALID SLUG WITH SPACES!')",
    `Result: ${JSON.stringify(invalidSlugRes)}`
  );

  // 3.7 Custom Domain Collision Guard
  const domainCollisionRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Lumina CineWorks Domain",
    newSlug: lumina.slug,
    customDomain: apex.customDomain, // Collides with Apex!
    discipline: "HYBRID",
    brandColor: "#6366f1",
    currency: "USD",
  });
  assert(
    !domainCollisionRes.success && domainCollisionRes.error === "DOMAIN_EXISTS",
    "3.6 Custom domain collision rejection ('studio.apexfilms.com')",
    `Result: ${JSON.stringify(domainCollisionRes)}`
  );

  // 3.8 Non-Existent Tenant Guard
  const nonExistentTenantRes = await updateStudioSettings({
    tenantId: "ten_non_existent_ghost_999",
    tenantSlug: "ghost-studio",
    name: "Ghost Studio",
    newSlug: "ghost-studio",
    discipline: "HYBRID",
    brandColor: "#6366f1",
    currency: "USD",
  });
  assert(
    !nonExistentTenantRes.success && nonExistentTenantRes.error === "TENANT_NOT_FOUND",
    "3.7 Non-existent tenant settings update rejected with TENANT_NOT_FOUND",
    `Result: ${JSON.stringify(nonExistentTenantRes)}`
  );

  // 3.9 Revert Lumina settings back to original pristine seed state
  const revertRes = await updateStudioSettings({
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: originalLumina.name,
    newSlug: originalLumina.slug,
    customDomain: originalLumina.customDomain,
    discipline: originalLumina.discipline as any,
    tagline: originalLumina.tagline,
    bio: originalLumina.bio,
    logoUrl: originalLumina.logoUrl,
    brandColor: originalLumina.brandColor || "#f59e0b",
    currency: originalLumina.currency as any,
    qrCodeUrl: originalLumina.qrCodeUrl,
    bankDetails: originalLumina.bankDetails,
  });
  assert(
    revertRes.success,
    "3.8 Successfully reverted studio settings to pristine seed baseline"
  );

  // ===========================================================================
  // SECTION 4: Multi-Tenant Scoping Stress Across All Admin Actions
  // ===========================================================================
  console.log("\n--- [Suite 4] Multi-Tenant Scoping Stress Across All Admin Domains ---");

  // 4.1 Cross-Tenant Service Packages
  const apexPackage = await db.servicePackage.findFirst({ where: { tenantId: apex.id } });
  assert(!!apexPackage, "Apex package located in database");

  const crossPkgUpdate = await updateServicePackage({
    id: apexPackage!.id,
    tenantId: lumina.id, // Hostile
    tenantSlug: lumina.slug,
    name: "Hostile Package Renamed",
    category: apexPackage!.category,
    discipline: apexPackage!.discipline as any,
    price: 1,
    depositPrice: 1,
    turnaround: "1 day",
    description: "Hacked",
    deliverables: "None",
    isFeatured: false,
  });
  assert(
    !crossPkgUpdate.success && crossPkgUpdate.error === "PACKAGE_NOT_FOUND",
    "4.1 Cross-tenant Service Package update rejected with PACKAGE_NOT_FOUND",
    `Result: ${JSON.stringify(crossPkgUpdate)}`
  );

  const crossPkgDelete = await deleteServicePackage({
    id: apexPackage!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossPkgDelete.success && crossPkgDelete.error === "PACKAGE_NOT_FOUND",
    "4.2 Cross-tenant Service Package deletion rejected with PACKAGE_NOT_FOUND",
    `Result: ${JSON.stringify(crossPkgDelete)}`
  );

  const crossPkgToggle = await togglePackageFeatured({
    id: apexPackage!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isFeatured: !apexPackage!.isFeatured,
  });
  assert(
    !crossPkgToggle.success && crossPkgToggle.error === "PACKAGE_NOT_FOUND",
    "4.3 Cross-tenant Service Package toggle rejected with PACKAGE_NOT_FOUND",
    `Result: ${JSON.stringify(crossPkgToggle)}`
  );

  // 4.2 Cross-Tenant Campaign Categories
  const apexCategory = await db.campaignCategory.findFirst({ where: { tenantId: apex.id } });
  assert(!!apexCategory, "Apex category located in database");

  const crossCatUpdate = await updateCampaignCategory({
    id: apexCategory!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Hostile Category",
    slug: `hostile-${Date.now()}`,
    badgeIcon: "☠️",
    description: "Hacked",
    sortOrder: 1,
    isActive: false,
  });
  assert(
    !crossCatUpdate.success && crossCatUpdate.error === "CATEGORY_NOT_FOUND",
    "4.4 Cross-tenant Campaign Category update rejected with CATEGORY_NOT_FOUND",
    `Result: ${JSON.stringify(crossCatUpdate)}`
  );

  const crossCatDelete = await deleteCampaignCategory({
    id: apexCategory!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossCatDelete.success && crossCatDelete.error === "CATEGORY_NOT_FOUND",
    "4.5 Cross-tenant Campaign Category deletion rejected with CATEGORY_NOT_FOUND",
    `Result: ${JSON.stringify(crossCatDelete)}`
  );

  const crossCatToggle = await toggleCategoryActive({
    id: apexCategory!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isActive: !apexCategory!.isActive,
  });
  assert(
    !crossCatToggle.success && crossCatToggle.error === "CATEGORY_NOT_FOUND",
    "4.6 Cross-tenant Campaign Category toggle rejected with CATEGORY_NOT_FOUND",
    `Result: ${JSON.stringify(crossCatToggle)}`
  );

  // 4.3 Cross-Tenant Calendar Slots
  const apexSlot = await db.bookingSlot.findFirst({ where: { tenantId: apex.id } });
  assert(!!apexSlot, "Apex calendar slot located in database");

  const crossSlotUpdate = await updateBookingSlot({
    id: apexSlot!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    price: 1,
  });
  assert(
    !crossSlotUpdate.success && crossSlotUpdate.error === "SLOT_NOT_FOUND",
    "4.7 Cross-tenant Calendar Slot update rejected with SLOT_NOT_FOUND",
    `Result: ${JSON.stringify(crossSlotUpdate)}`
  );

  const crossSlotBlock = await toggleBlockBookingSlot({
    slotId: apexSlot!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossSlotBlock.success && crossSlotBlock.error === "SLOT_NOT_FOUND",
    "4.8 Cross-tenant Calendar Slot block toggle rejected with SLOT_NOT_FOUND",
    `Result: ${JSON.stringify(crossSlotBlock)}`
  );

  const crossSlotDelete = await deleteBookingSlot({
    slotId: apexSlot!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossSlotDelete.success && crossSlotDelete.error === "SLOT_NOT_FOUND",
    "4.9 Cross-tenant Calendar Slot deletion rejected with SLOT_NOT_FOUND",
    `Result: ${JSON.stringify(crossSlotDelete)}`
  );

  // 4.4 Cross-Tenant Proposal Add-On Templates
  const apexTemplate = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: apex.id } });
  assert(!!apexTemplate, "Apex proposal add-on template located in database");

  const crossTplUpdate = await updateProposalAddOnTemplate({
    id: apexTemplate!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    name: "Hostile Add-on",
    description: "Hacked Addon Description",
    price: 1,
    unit: "per_hour",
    isDefault: false,
    isActive: false,
  });
  assert(
    !crossTplUpdate.success && crossTplUpdate.error === "TEMPLATE_NOT_FOUND",
    "4.10 Cross-tenant Proposal Add-On Template update rejected with TEMPLATE_NOT_FOUND",
    `Result: ${JSON.stringify(crossTplUpdate)}`
  );

  const crossTplToggle = await toggleAddOnTemplateDefault({
    id: apexTemplate!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
    isDefault: !apexTemplate!.isDefault,
  });
  assert(
    !crossTplToggle.success && crossTplToggle.error === "TEMPLATE_NOT_FOUND",
    "4.11 Cross-tenant Proposal Add-On Template toggle rejected with TEMPLATE_NOT_FOUND",
    `Result: ${JSON.stringify(crossTplToggle)}`
  );

  const crossTplDelete = await deleteProposalAddOnTemplate({
    id: apexTemplate!.id,
    tenantId: lumina.id,
    tenantSlug: lumina.slug,
  });
  assert(
    !crossTplDelete.success && crossTplDelete.error === "TEMPLATE_NOT_FOUND",
    "4.12 Cross-tenant Proposal Add-On Template deletion rejected with TEMPLATE_NOT_FOUND",
    `Result: ${JSON.stringify(crossTplDelete)}`
  );

  // 4.5 Cross-Tenant Invoice Payment Verification
  const apexInvoice = await db.milestoneInvoice.findFirst({
    where: { tenantId: apex.id, status: "PENDING_VERIFICATION" },
  });
  assert(!!apexInvoice, "Apex invoice with PENDING_VERIFICATION located in database");

  const crossApproveRes = await approvePaymentVerification({
    invoiceId: apexInvoice!.id,
    tenantId: lumina.id, // Hostile tenant
    tenantSlug: lumina.slug,
    staffName: "Lumina Hacker Staff",
    notes: "Hostile cross-tenant approval attempt",
  });
  assert(
    !crossApproveRes.success && crossApproveRes.error === "INVOICE_NOT_FOUND",
    "4.13 Cross-tenant Payment Verification approval rejected with INVOICE_NOT_FOUND",
    `Result: ${JSON.stringify(crossApproveRes)}`
  );

  const crossRejectRes = await rejectPaymentVerification({
    invoiceId: apexInvoice!.id,
    tenantId: lumina.id, // Hostile tenant
    tenantSlug: lumina.slug,
    staffName: "Lumina Hacker Staff",
    reason: "Hostile cross-tenant rejection attempt",
  });
  assert(
    !crossRejectRes.success && crossRejectRes.error === "INVOICE_NOT_FOUND",
    "4.14 Cross-tenant Payment Verification rejection rejected with INVOICE_NOT_FOUND",
    `Result: ${JSON.stringify(crossRejectRes)}`
  );

  // Verify invoice status remains untouched in SQLite
  const invoiceDbCheck = await db.milestoneInvoice.findUnique({ where: { id: apexInvoice!.id } });
  assert(
    invoiceDbCheck?.status === "PENDING_VERIFICATION",
    "4.15 Database integrity: Apex invoice status remained strictly PENDING_VERIFICATION"
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log("\n================================================================================");
  console.log(`   TOTAL EMPIRICAL CHALLENGER ASSERTIONS: ${passedCount + failedCount}`);
  console.log(`   PASSED:                                ${passedCount}`);
  console.log(`   FAILED:                                ${failedCount}`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    console.error("FAILURES DETECTED:");
    failureDetails.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log("🎉 ALL ADVERSARIAL CHALLENGER TESTS PASSED WITH ZERO FAILURES!\n");
  }
}

runChallengerSuite()
  .catch((err) => {
    console.error("FATAL SUITE CRASH:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
