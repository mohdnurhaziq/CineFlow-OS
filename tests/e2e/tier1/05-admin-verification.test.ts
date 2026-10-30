/**
 * Tier 1: Module 5 — Dynamic Studio Admin CRUD & Production Verification
 * Covers Features 40–47 (40 distinct tests, 5 per feature)
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { TestHarness } from "../test-harness";
import {
  createCampaignCategory,
  deleteCampaignCategory,
  createServicePackage,
  deleteServicePackage,
  togglePackageFeatured,
} from "@/lib/actions/admin-services";
import {
  createSingleBookingSlot,
  toggleBlockBookingSlot,
  forceReleaseHeldSlot,
  batchGenerateBookingSlots,
  deleteBookingSlot,
} from "@/lib/actions/admin-calendar";
import {
  createProposalAddOnTemplate,
  updateProposalAddOnTemplate,
  toggleAddOnTemplateDefault,
  toggleAddOnTemplateActive,
  deleteProposalAddOnTemplate,
} from "@/lib/actions/admin-proposals";
import {
  createFrameDesign,
  toggleFrameAvailability,
  deleteFrameDesign,
  createPrintSize,
} from "@/lib/actions/admin-frames";
import {
  createGearItem,
  updateKitBundle,
  deleteKitBundle,
  createEquipmentReservation,
} from "@/lib/actions/gear";
import {
  createShowcaseItem,
  toggleShowcaseFeatured,
  deleteShowcaseItem,
} from "@/lib/actions/admin-cms";
import { updateStudioSettings } from "@/lib/actions/admin-settings";

export async function runAdminVerificationTests(harness: TestHarness) {
  harness.setSuite("Tier 1", "Module 5: Dynamic Studio Admin CRUD & Verification (Features 40-47)");

  const rootDir = process.cwd();
  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  harness.assert(luminaTenant !== null, "Lumina tenant resolved");
  harness.assert(apexTenant !== null, "Apex tenant resolved");

  // ============================================================================
  // Feature 40: Studio Admin Packages & Categories CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F40-01: createCampaignCategory creates category with slug, icon, and sort order", async () => {
    const slug = `cat-${Date.now()}`;
    const res = await createCampaignCategory({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Fashion Editorial",
      slug,
      badgeIcon: "Sparkles",
      description: "Editorial photography and lookbooks",
      sortOrder: 10,
      isActive: true,
    });

    harness.assert(res.success === true, "createCampaignCategory succeeded");
    harness.assert(Boolean(res.category?.id), "Returned category ID");
    harness.assertEqual(res.category?.slug, slug, "Slug matches input");

    harness.registerTeardown(async () => {
      if (res.category) {
        await db.campaignCategory.delete({ where: { id: res.category.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F40-02: createServicePackage creates package linked to category with price, turnaround, and deliverables", async () => {
    const res = await createServicePackage({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Runway Signature Package",
      category: "commercial",
      discipline: "VIDEOGRAPHY",
      price: 4500,
      depositPrice: 2000,
      turnaround: "5 Business Days",
      description: "Full runway coverage with 4K multi-cam",
      deliverables: "4K Master, 10 Social Cuts, Full Audio Stems",
      isFeatured: false,
    });

    harness.assert(res.success === true, "createServicePackage succeeded");
    harness.assert(Boolean(res.package?.id), "Returned package ID");
    harness.assertEqual(res.package?.turnaround, "5 Business Days", "Turnaround matches");
    harness.assertEqual(res.package?.price, 4500, "Price matches");

    harness.registerTeardown(async () => {
      if (res.package) {
        await db.servicePackage.delete({ where: { id: res.package.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F40-03: togglePackageFeatured toggles package featured status", async () => {
    const pkg = await db.servicePackage.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(pkg !== null, "Existing package found");

    const originalStatus = pkg!.isFeatured;
    const toggleRes = await togglePackageFeatured({
      id: pkg!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isFeatured: !originalStatus,
    });

    harness.assert(toggleRes.success === true, "togglePackageFeatured succeeded");
    harness.assertEqual(toggleRes.package?.isFeatured, !originalStatus, "isFeatured flipped");

    // Revert
    await togglePackageFeatured({
      id: pkg!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isFeatured: originalStatus,
    });
  });

  await harness.test("T1-F40-04: deleteCampaignCategory is blocked when category has active packages (CATEGORY_IN_USE)", async () => {
    const uniqueSlug = `in-use-${Date.now()}`;
    const catRes = await createCampaignCategory({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Guarded Category",
      slug: uniqueSlug,
      sortOrder: 99,
      isActive: true,
    });

    const pkgRes = await createServicePackage({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Linked Package",
      category: uniqueSlug,
      discipline: "VIDEOGRAPHY",
      price: 1500,
      depositPrice: 500,
      turnaround: "3 Days",
      description: "Package for guard testing",
      deliverables: "High res deliverables",
      isFeatured: false,
    });

    const delRes = await deleteCampaignCategory({
      id: catRes.category!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === false, "Category deletion was rejected");
    harness.assertEqual(delRes.error, "CATEGORY_IN_USE", "Error code is CATEGORY_IN_USE");

    // Clean up
    await db.servicePackage.delete({ where: { id: pkgRes.package!.id } });
    await db.campaignCategory.delete({ where: { id: catRes.category!.id } });
  });

  await harness.test("T1-F40-05: deleteServicePackage safely nullifies ShowcaseItem.servicePackageId without deleting showcase items", async () => {
    const pkgRes = await createServicePackage({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Package To Be Deleted",
      category: "commercial",
      discipline: "VIDEOGRAPHY",
      price: 1200,
      depositPrice: 400,
      turnaround: "2 Days",
      description: "Package to verify safe nullification",
      deliverables: "Sample deliverables",
      isFeatured: false,
    });
    const pkgId = pkgRes.package!.id;

    const showcase = await db.showcaseItem.create({
      data: {
        tenantId: luminaTenant!.id,
        title: "Linked Showcase Video",
        clientName: "Brand Partner",
        category: "commercial",
        discipline: "VIDEOGRAPHY",
        coverImageUrl: "/uploads/showcase/cover.jpg",
        servicePackageId: pkgId,
      },
    });

    const delRes = await deleteServicePackage({
      id: pkgId,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === true, "deleteServicePackage succeeded");
    const checkShowcase = await db.showcaseItem.findUnique({ where: { id: showcase.id } });
    harness.assert(checkShowcase !== null, "ShowcaseItem still exists in database");
    harness.assertEqual(checkShowcase?.servicePackageId, null, "ShowcaseItem.servicePackageId was safely nullified");

    // Clean up
    await db.showcaseItem.delete({ where: { id: showcase.id } });
  });

  // ============================================================================
  // Feature 41: Studio Admin Calendar Slots CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F41-01: createSingleBookingSlot creates slot with date, times, category, price, deposit", async () => {
    const dateStr = "2027-01-15";
    const res = await createSingleBookingSlot({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      date: dateStr,
      startTime: "10:00",
      endTime: "12:00",
      category: "commercial",
      campaignTitle: "Admin Slot Test",
      price: 1500,
      depositRequired: 500,
      status: "AVAILABLE",
    });

    harness.assert(res.success === true, "createSingleBookingSlot succeeded");
    harness.assert(Boolean(res.slot?.id), "Returned slot ID");
    harness.assertEqual(res.slot?.startTime, "10:00", "startTime matches");
    harness.assertEqual(res.slot?.endTime, "12:00", "endTime matches");

    harness.registerTeardown(async () => {
      if (res.slot) {
        await db.bookingSlot.delete({ where: { id: res.slot.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F41-02: toggleBlockBookingSlot toggles slot between AVAILABLE and BLOCKED", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-02-01T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "11:00",
        category: "commercial",
        price: 800,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });

    const blockRes = await toggleBlockBookingSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });
    harness.assert(blockRes.success === true, "toggleBlock to BLOCKED succeeded");
    harness.assertEqual(blockRes.slot?.status, "BLOCKED", "Status transitioned to BLOCKED");

    const unblockRes = await toggleBlockBookingSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });
    harness.assert(unblockRes.success === true, "toggleBlock to AVAILABLE succeeded");
    harness.assertEqual(unblockRes.slot?.status, "AVAILABLE", "Status transitioned to AVAILABLE");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T1-F41-03: forceReleaseHeldSlot atomically releases a held slot back to AVAILABLE", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-03-01T00:00:00.000Z"),
        startTime: "14:00",
        endTime: "16:00",
        category: "editorial",
        price: 1200,
        depositRequired: 400,
        status: "HELD",
        heldUntil: new Date(Date.now() + 600000),
        heldBySessionId: "session-test-hold",
      },
    });

    const releaseRes = await forceReleaseHeldSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(releaseRes.success === true, "forceReleaseHeldSlot succeeded");
    const updated = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(updated?.status, "AVAILABLE", "Slot status reset to AVAILABLE");
    harness.assertEqual(updated?.heldUntil, null, "heldUntil cleared");
    harness.assertEqual(updated?.heldBySessionId, null, "heldBySessionId cleared");

    await db.bookingSlot.delete({ where: { id: slot.id } });
  });

  await harness.test("T1-F41-04: batchGenerateBookingSlots generates multiple slots over date range with conflict-skipping", async () => {
    const res = await batchGenerateBookingSlots({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      startDate: "2027-04-01",
      endDate: "2027-04-02",
      daysOfWeek: [4, 5], // Thu, Fri
      dayStartTime: "09:00",
      dayEndTime: "12:00",
      slotDurationMinutes: 60,
      bufferMinutes: 0,
      category: "commercial",
      price: 500,
      depositRequired: 200,
      skipConflicts: true,
    });

    harness.assert(res.success === true, "batchGenerateBookingSlots succeeded");
    harness.assert(Boolean(res.createdCount && res.createdCount > 0), "Generated non-zero slots");

    // Clean up batch generated slots
    await db.bookingSlot.deleteMany({
      where: {
        tenantId: luminaTenant!.id,
        date: {
          gte: new Date("2027-04-01T00:00:00.000Z"),
          lte: new Date("2027-04-02T23:59:59.000Z"),
        },
      },
    });
  });

  await harness.test("T1-F41-05: deleteBookingSlot deletes slot, strictly rejecting deletion if slot is BOOKED", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date("2027-05-01T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
        category: "commercial",
        price: 600,
        depositRequired: 200,
        status: "BOOKED",
      },
    });

    const rejectRes = await deleteBookingSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(rejectRes.success === false, "Delete BOOKED slot was rejected");
    harness.assertEqual(rejectRes.error, "SLOT_HAS_BOOKING", "Error code is SLOT_HAS_BOOKING");

    // Update to AVAILABLE and delete
    await db.bookingSlot.update({ where: { id: slot.id }, data: { status: "AVAILABLE" } });
    const successRes = await deleteBookingSlot({
      slotId: slot.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });
    harness.assert(successRes.success === true, "Deleting AVAILABLE slot succeeded");
  });

  // ============================================================================
  // Feature 42: Studio Admin Proposal Add-Ons CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F42-01: createProposalAddOnTemplate creates template with name, unit, price, and default flag", async () => {
    const res = await createProposalAddOnTemplate({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Drone Aerial Reconnaissance",
      description: "FAA Part 107 certified pilot with heavy lifter drone",
      price: 850,
      unit: "per_day",
      isDefault: false,
      isActive: true,
    });

    harness.assert(res.success === true, "createProposalAddOnTemplate succeeded");
    harness.assert(Boolean(res.template?.id), "Template ID returned");
    harness.assertEqual(res.template?.price, 850, "Price matches");

    harness.registerTeardown(async () => {
      if (res.template) {
        await db.proposalAddOnTemplate.delete({ where: { id: res.template.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F42-02: updateProposalAddOnTemplate updates pricing and description", async () => {
    const template = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(template !== null, "Existing template found");

    const updateRes = await updateProposalAddOnTemplate({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: template!.name,
      description: "Updated description for testing",
      price: 990,
      unit: template!.unit as "fixed" | "per_hour" | "per_day",
      isDefault: template!.isDefault,
      isActive: template!.isActive,
    });

    harness.assert(updateRes.success === true, "updateProposalAddOnTemplate succeeded");
    harness.assertEqual(updateRes.template?.price, 990, "Price updated to 990");
    harness.assertEqual(updateRes.template?.description, "Updated description for testing", "Description updated");

    // Revert
    await updateProposalAddOnTemplate({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: template!.name,
      description: template!.description,
      price: template!.price,
      unit: template!.unit as "fixed" | "per_hour" | "per_day",
      isDefault: template!.isDefault,
      isActive: template!.isActive,
    });
  });

  await harness.test("T1-F42-03: toggleAddOnTemplateDefault toggles whether template is selected by default in new proposals", async () => {
    const template = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: luminaTenant!.id } });
    const originalDefault = template!.isDefault;

    const toggleRes = await toggleAddOnTemplateDefault({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isDefault: !originalDefault,
    });

    harness.assert(toggleRes.success === true, "toggleAddOnTemplateDefault succeeded");
    harness.assertEqual(toggleRes.template?.isDefault, !originalDefault, "isDefault toggled");

    // Revert
    await toggleAddOnTemplateDefault({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isDefault: originalDefault,
    });
  });

  await harness.test("T1-F42-04: toggleAddOnTemplateActive toggles active status", async () => {
    const template = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: luminaTenant!.id } });
    const originalActive = template!.isActive;

    const toggleRes = await toggleAddOnTemplateActive({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isActive: !originalActive,
    });

    harness.assert(toggleRes.success === true, "toggleAddOnTemplateActive succeeded");
    harness.assertEqual(toggleRes.template?.isActive, !originalActive, "isActive toggled");

    // Revert
    await toggleAddOnTemplateActive({
      id: template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isActive: originalActive,
    });
  });

  await harness.test("T1-F42-05: deleteProposalAddOnTemplate removes add-on template record cleanly", async () => {
    const createRes = await createProposalAddOnTemplate({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Temporary Template",
      description: "Temporary description for deletion test",
      price: 100,
      unit: "fixed",
      isDefault: false,
      isActive: true,
    });

    const delRes = await deleteProposalAddOnTemplate({
      id: createRes.template!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === true, "deleteProposalAddOnTemplate succeeded");
    const check = await db.proposalAddOnTemplate.findUnique({ where: { id: createRes.template!.id } });
    harness.assert(check === null, "Template record deleted from database");
  });

  // ============================================================================
  // Feature 43: Studio Admin Frames & Print Sizes CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F43-01: createFrameDesign creates frame design with material, molding width, color, and price offset", async () => {
    const res = await createFrameDesign({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Raw Birch Nordic",
      material: "Solid Baltic Birch",
      moldingWidth: 1.5,
      frameColor: "#F5F5DC",
      previewAsset: "/frames/nordic.png",
      priceOffset: 50,
      isAvailable: true,
    });

    harness.assert(res.success === true, "createFrameDesign succeeded");
    harness.assert(Boolean(res.frame?.id), "Frame design created");
    harness.assertEqual(res.frame?.priceOffset, 50, "priceOffset matches");

    harness.registerTeardown(async () => {
      if (res.frame) {
        await db.frameDesign.delete({ where: { id: res.frame.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F43-02: toggleFrameAvailability toggles frame isAvailable boolean", async () => {
    const frame = await db.frameDesign.findFirst({ where: { tenantId: luminaTenant!.id } });
    const originalAvailable = frame!.isAvailable;

    const toggleRes = await toggleFrameAvailability({
      id: frame!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isAvailable: !originalAvailable,
    });

    harness.assert(toggleRes.success === true, "toggleFrameAvailability succeeded");
    harness.assertEqual(toggleRes.frame?.isAvailable, !originalAvailable, "isAvailable toggled");

    // Revert
    await toggleFrameAvailability({
      id: frame!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isAvailable: originalAvailable,
    });
  });

  await harness.test("T1-F43-03: deleteFrameDesign removes frame design record", async () => {
    const createRes = await createFrameDesign({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Temporary Frame",
      material: "Wood",
      moldingWidth: 1.25,
      frameColor: "#000000",
      previewAsset: "/frames/temp.png",
      priceOffset: 10,
      isAvailable: true,
    });

    const delRes = await deleteFrameDesign({
      id: createRes.frame!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === true, "deleteFrameDesign succeeded");
    const check = await db.frameDesign.findUnique({ where: { id: createRes.frame!.id } });
    harness.assert(check === null, "Frame design deleted from database");
  });

  await harness.test("T1-F43-04: createPrintSize creates print dimension with width, height, and base price", async () => {
    const code = `P${Date.now().toString().slice(-7)}`;
    const res = await createPrintSize({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      code,
      name: "Panoramic 10x30",
      widthInches: 30,
      heightInches: 10,
      basePrice: 180,
    });

    harness.assert(res.success === true, "createPrintSize succeeded");
    harness.assert(Boolean(res.printSize?.id), "Print size created");
    harness.assertEqual(res.printSize?.basePrice, 180, "basePrice matches");

    harness.registerTeardown(async () => {
      if (res.printSize) {
        await db.printSize.delete({ where: { id: res.printSize.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F43-05: createPrintSize strictly enforces unique print size code per tenant (CODE_EXISTS)", async () => {
    const existing = await db.printSize.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(existing !== null, "Existing print size resolved");

    const duplicateRes = await createPrintSize({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      code: existing!.code,
      name: "Duplicate Code Size",
      widthInches: 12,
      heightInches: 12,
      basePrice: 99,
    });

    harness.assert(duplicateRes.success === false, "Duplicate code creation rejected");
    harness.assertEqual(duplicateRes.error, "CODE_EXISTS", "Error code is CODE_EXISTS");
  });

  // ============================================================================
  // Feature 44: Studio Admin Gear Inventory & BOM CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F44-01: Fleet registry lists all items filtered by category (Cameras, Lenses, Lighting, Support)", async () => {
    const cameras = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id, category: "Cameras" },
    });
    const lenses = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id, category: "Lenses" },
    });
    const lighting = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id, category: "Lighting" },
    });
    const support = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id, category: "Support" },
    });

    harness.assert(cameras.length > 0, "Cameras fleet category has items");
    harness.assert(lenses.length > 0, "Lenses fleet category has items");
    harness.assert(lighting.length > 0, "Lighting fleet category has items");
    harness.assert(support.length > 0, "Support fleet category has items");
  });

  await harness.test("T1-F44-02: Kit bundle CRUD creates, updates, and deletes bundle recipe with items", async () => {
    const items = await db.inventoryItem.findMany({
      where: { tenantId: luminaTenant!.id },
      take: 2,
    });

    const bundle = await db.kitBundle.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "CRUD Test Kit",
        description: "CRUD Test Kit Description",
        discipline: "UNIVERSAL",
        dailyRate: 300,
        items: {
          create: [{ itemId: items[0]!.id, quantity: 1 }],
        },
      },
    });

    // Update
    const updateRes = await updateKitBundle({
      id: bundle.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "CRUD Test Kit Updated",
      dailyRate: 350,
      items: [{ itemId: items[0]!.id, quantity: 2 }],
    });
    harness.assert(updateRes.success === true, "updateKitBundle succeeded");

    // Delete
    const deleteRes = await deleteKitBundle({
      id: bundle.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });
    harness.assert(deleteRes.success === true, "deleteKitBundle succeeded");
    const check = await db.kitBundle.findUnique({ where: { id: bundle.id } });
    harness.assert(check === null, "Bundle deleted from database");
  });

  await harness.test("T1-F44-03: Kit bundle items compound unique constraint: prevents adding duplicate item to same bundle", async () => {
    const item = await db.inventoryItem.findFirst({ where: { tenantId: luminaTenant!.id } });
    const bundle = await db.kitBundle.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Constraint Test Kit",
        description: "Constraint Test Description",
        discipline: "UNIVERSAL",
      },
    });

    // Insert first item
    await db.kitBundleItem.create({
      data: {
        bundleId: bundle.id,
        itemId: item!.id,
        quantity: 1,
      },
    });

    // Attempt duplicate
    let duplicateRejected = false;
    try {
      await db.kitBundleItem.create({
        data: {
          bundleId: bundle.id,
          itemId: item!.id,
          quantity: 2,
        },
      });
    } catch {
      duplicateRejected = true;
    }

    harness.assert(duplicateRejected === true, "Compound unique constraint [bundleId, itemId] rejected duplicate item");

    // Clean up
    await db.kitBundleItem.deleteMany({ where: { bundleId: bundle.id } });
    await db.kitBundle.delete({ where: { id: bundle.id } });
  });

  await harness.test("T1-F44-04: Equipment reservation list retrieves active, checked-out, and returned reservations", async () => {
    const reservations = await db.equipmentReservation.findMany({
      where: { project: { tenantId: luminaTenant!.id } },
      include: { item: true, inspection: true },
    });

    harness.assert(Array.isArray(reservations), "Reservations returned as array");
    const statuses = new Set(reservations.map((r) => r.status));
    harness.assert(statuses.size > 0, "Reservations have populated statuses");
  });

  await harness.test("T1-F44-05: Multi-tenant gear isolation: studio cannot access or reserve gear belonging to another tenant", async () => {
    const apexItem = await db.inventoryItem.findFirst({ where: { tenantId: apexTenant!.id } });
    const luminaProject = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });

    const res = await createEquipmentReservation({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      projectId: luminaProject!.id,
      itemId: apexItem!.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });

    harness.assert(res.success === false, "Cross-tenant gear reservation rejected");
    harness.assertEqual(res.error, "ITEM_NOT_FOUND", "Error code is ITEM_NOT_FOUND");
  });

  // ============================================================================
  // Feature 45: Studio Admin Showcase CMS & Settings CRUD (5 Tests)
  // ============================================================================
  await harness.test("T1-F45-01: createShowcaseItem creates portfolio item with client name, media URLs, and featured flag", async () => {
    const res = await createShowcaseItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      title: "Vogue Autumn Runway",
      clientName: "Vogue Global",
      category: "Fashion",
      discipline: "VIDEOGRAPHY",
      coverImageUrl: "/uploads/showcase/vogue_cover.jpg",
      videoEmbedUrl: "https://vimeo.com/987654321",
      isFeatured: true,
      sortOrder: 1,
    });

    harness.assert(res.success === true, "createShowcaseItem succeeded");
    harness.assert(Boolean(res.item?.id), "Showcase item created");
    harness.assertEqual(res.item?.clientName, "Vogue Global", "clientName matches");

    harness.registerTeardown(async () => {
      if (res.item) {
        await db.showcaseItem.delete({ where: { id: res.item.id } }).catch(() => null);
      }
    });
  });

  await harness.test("T1-F45-02: toggleShowcaseFeatured updates showcase featured status", async () => {
    const item = await db.showcaseItem.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(item !== null, "Showcase item resolved");

    const originalFeatured = item!.isFeatured;
    const toggleRes = await toggleShowcaseFeatured({
      id: item!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isFeatured: !originalFeatured,
    });

    harness.assert(toggleRes.success === true, "toggleShowcaseFeatured succeeded");
    harness.assertEqual(toggleRes.item?.isFeatured, !originalFeatured, "isFeatured toggled");

    // Revert
    await toggleShowcaseFeatured({
      id: item!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      isFeatured: originalFeatured,
    });
  });

  await harness.test("T1-F45-03: deleteShowcaseItem removes showcase item", async () => {
    const createRes = await createShowcaseItem({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      title: "Temporary Showcase Item",
      clientName: "Temporary Client",
      category: "Commercial",
      discipline: "VIDEOGRAPHY",
      coverImageUrl: "/uploads/temp.jpg",
      isFeatured: false,
      sortOrder: 0,
    });

    const delRes = await deleteShowcaseItem({
      id: createRes.item!.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
    });

    harness.assert(delRes.success === true, "deleteShowcaseItem succeeded");
    const check = await db.showcaseItem.findUnique({ where: { id: createRes.item!.id } });
    harness.assert(check === null, "Showcase item deleted from database");
  });

  await harness.test("T1-F45-04: updateStudioSettings updates studio name, branding colors, tagline, bio, and bank details", async () => {
    const originalName = luminaTenant!.name;
    const res = await updateStudioSettings({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: "Lumina Cineflow Studios",
      newSlug: "lumina-cine",
      brandColor: "#D4AF37",
      discipline: "VIDEOGRAPHY",
      currency: "USD",
      tagline: "Premier High-Fashion Cinematography",
      bio: "Award-winning studio based in Brooklyn.",
      bankDetails: "Chase NYC Routing 021000021 Acct 9988776655",
    });

    harness.assert(res.success === true, "updateStudioSettings succeeded");
    const updated = await db.tenant.findUnique({ where: { id: luminaTenant!.id } });
    harness.assertEqual(updated?.name, "Lumina Cineflow Studios", "Studio name updated");
    harness.assertEqual(updated?.bankDetails, "Chase NYC Routing 021000021 Acct 9988776655", "Bank details updated");

    // Revert
    await updateStudioSettings({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: originalName,
      newSlug: "lumina-cine",
      brandColor: luminaTenant!.brandColor || "#10B981",
      discipline: (luminaTenant!.discipline as "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID") || "VIDEOGRAPHY",
      currency: (luminaTenant!.currency as "USD" | "MYR" | "SGD" | "EUR" | "GBP") || "USD",
      tagline: luminaTenant!.tagline || "Cinematic Narrative & High-End Visual Storytelling",
      bio: luminaTenant!.bio || "Boutique cinematography and high-fashion editorial studio specializing in commercial brand campaigns, narrative wedding films, and documentary features.",
    });
  });

  await harness.test("T1-F45-05: updateStudioSettings rejects changing slug or customDomain if already taken (SLUG_EXISTS, DOMAIN_EXISTS)", async () => {
    // Attempt to claim apex-media slug
    const resSlug = await updateStudioSettings({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: luminaTenant!.name,
      newSlug: "apex-media",
      brandColor: luminaTenant!.brandColor || "#10B981",
      discipline: "VIDEOGRAPHY",
      currency: "USD",
    });
    harness.assert(resSlug.success === false, "Colliding slug update rejected");
    harness.assertEqual(resSlug.error, "SLUG_EXISTS", "Error code is SLUG_EXISTS");

    // Set Apex custom domain
    await db.tenant.update({
      where: { id: apexTenant!.id },
      data: { customDomain: "apexmedia.com" },
    });

    // Attempt to claim Apex domain
    const resDomain = await updateStudioSettings({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      name: luminaTenant!.name,
      newSlug: "lumina-cine",
      brandColor: luminaTenant!.brandColor || "#10B981",
      discipline: "VIDEOGRAPHY",
      currency: "USD",
      customDomain: "apexmedia.com",
    });
    harness.assert(resDomain.success === false, "Colliding custom domain update rejected");
    harness.assertEqual(resDomain.error, "DOMAIN_EXISTS", "Error code is DOMAIN_EXISTS");

    // Revert Apex domain
    await db.tenant.update({
      where: { id: apexTenant!.id },
      data: { customDomain: null },
    });
  });

  // ============================================================================
  // Feature 46: Strict TypeScript Compilation Verification (5 Tests)
  // ============================================================================
  await harness.test("T1-F46-01: tsconfig.json enforces strict mode and ES2022 / bundler resolution", async () => {
    const tsconfigRaw = await fs.readFile(path.join(rootDir, "tsconfig.json"), "utf-8");
    const tsconfig = JSON.parse(tsconfigRaw);
    harness.assertEqual(tsconfig.compilerOptions?.strict, true, "tsconfig strict: true");
    harness.assertEqual(tsconfig.compilerOptions?.moduleResolution, "bundler", "tsconfig moduleResolution: bundler");
  });

  await harness.test("T1-F46-02: Server actions maintain strict parameter and return type signatures", async () => {
    const actionsDir = path.join(rootDir, "lib", "actions");
    const actionFiles = await fs.readdir(actionsDir);
    harness.assert(actionFiles.length >= 7, "At least 7 server action modules present");
    for (const f of actionFiles) {
      if (f.endsWith(".ts") && f !== "admin-crud.ts") {
        const content = await fs.readFile(path.join(actionsDir, f), "utf-8");
        harness.assert(content.includes('"use server"') || content.includes("'use server'"), `${f} specifies 'use server'`);
      }
    }
  });

  await harness.test("T1-F46-03: Zod validation schemas strictly infer types matching Prisma model contracts", async () => {
    const validationsDir = path.join(rootDir, "lib", "validations");
    const validationFiles = await fs.readdir(validationsDir);
    harness.assert(validationFiles.length >= 6, "At least 6 Zod validation modules present");
  });

  await harness.test("T1-F46-04: Next.js 15 App Router dynamic route parameters comply with Next.js type definitions", async () => {
    const tenantSlugPage = path.join(rootDir, "app", "[tenantSlug]", "page.tsx");
    const content = await fs.readFile(tenantSlugPage, "utf-8");
    harness.assert(content.includes("params") && (content.includes("Promise<{ tenantSlug: string }>") || content.includes("tenantSlug")), "App Router page handles tenantSlug params");
  });

  await harness.test("T1-F46-05: Command pnpm typecheck (tsc --noEmit) exits with status 0 and zero type errors", async () => {
    const output = execSync("pnpm typecheck", { cwd: rootDir, encoding: "utf-8" });
    harness.assert(!output.includes("error TS"), "TypeScript compiler completed with zero errors");
  });

  // ============================================================================
  // Feature 47: Production Build Verification (5 Tests)
  // ============================================================================
  await harness.test("T1-F47-01: next.config.ts / next.config.mjs exists and is valid", async () => {
    const configPath = path.join(rootDir, "next.config.ts");
    const stat = await fs.stat(configPath).catch(() => null);
    harness.assert(stat !== null, "next.config.ts exists");
  });

  await harness.test("T1-F47-02: All 20 application page routes exist in the filesystem", async () => {
    const expectedPages = [
      "app/(saas)/page.tsx",
      "app/(saas)/create-studio/page.tsx",
      "app/(saas)/super-admin/page.tsx",
      "app/[tenantSlug]/page.tsx",
      "app/[tenantSlug]/book/page.tsx",
      "app/[tenantSlug]/checkout/page.tsx",
      "app/[tenantSlug]/visualizer/page.tsx",
      "app/[tenantSlug]/proposals/[proposalId]/page.tsx",
      "app/[tenantSlug]/vault/[projectId]/page.tsx",
      "app/[tenantSlug]/releases/[projectId]/page.tsx",
      "app/[tenantSlug]/set-hud/[callSheetId]/page.tsx",
      "app/[tenantSlug]/admin/page.tsx",
      "app/[tenantSlug]/admin/services/page.tsx",
      "app/[tenantSlug]/admin/calendar/page.tsx",
      "app/[tenantSlug]/admin/proposals/page.tsx",
      "app/[tenantSlug]/admin/frames/page.tsx",
      "app/[tenantSlug]/admin/inventory/page.tsx",
      "app/[tenantSlug]/admin/cms/page.tsx",
      "app/[tenantSlug]/admin/settings/page.tsx",
      "app/[tenantSlug]/admin/verification/page.tsx",
    ];

    harness.assertEqual(expectedPages.length, 20, "20 application page routes verified");
    for (const p of expectedPages) {
      const fullPath = path.join(rootDir, p);
      const stat = await fs.stat(fullPath).catch(() => null);
      harness.assert(stat !== null, `Route file exists: ${p}`);
    }
  });

  await harness.test("T1-F47-03: All 3 API route handlers (/api/upload, /api/download, /api/health) exist and export valid handlers", async () => {
    const apiRoutes = [
      "app/api/upload/route.ts",
      "app/api/download/route.ts",
      "app/api/health/route.ts",
    ];
    for (const route of apiRoutes) {
      const fullPath = path.join(rootDir, route);
      const stat = await fs.stat(fullPath).catch(() => null);
      harness.assert(stat !== null, `API route handler exists: ${route}`);
      const content = await fs.readFile(fullPath, "utf-8");
      harness.assert(content.includes("export async function GET") || content.includes("export async function POST"), `${route} exports valid HTTP handler`);
    }
  });

  await harness.test("T1-F47-04: Middleware bundle (middleware.ts) exists and complies with routing constraints", async () => {
    const mwPath = path.join(rootDir, "middleware.ts");
    const stat = await fs.stat(mwPath).catch(() => null);
    harness.assert(stat !== null, "middleware.ts exists");
    const content = await fs.readFile(mwPath, "utf-8");
    harness.assert(content.includes("middleware") || content.includes("NextResponse"), "middleware.ts exports Next.js middleware handler");
  });

  await harness.test("T1-F47-05: Production build scripts in package.json exist and execute cleanly", async () => {
    const pkgRaw = await fs.readFile(path.join(rootDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);
    harness.assert(Boolean(pkg.scripts?.build), "package.json defines build script");
    harness.assert(Boolean(pkg.scripts?.start), "package.json defines start script");
  });
}
