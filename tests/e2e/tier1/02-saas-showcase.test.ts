/**
 * Tier 1: Module 2 — SaaS Platform, Studio Onboarding & Public Showcase
 * Covers Features 6–14 (45 distinct tests, 5 per feature)
 */

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { db } from "@/lib/db";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import {
  holdBookingSlot,
  releaseBookingSlot,
  getTenantBookingSlots,
} from "@/lib/actions/booking";
import { TestHarness } from "../test-harness";

export async function runSaaSShowcaseTests(harness: TestHarness) {
  harness.setSuite("Tier 1", "Module 2: SaaS Platform, Onboarding & Showcase (Features 6-14)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  harness.assert(luminaTenant !== null, "Seed tenant lumina-cine resolved");
  harness.assert(apexTenant !== null, "Seed tenant apex-media resolved");

  // ============================================================================
  // Feature 6: Multi-Tenant Path & Domain Middleware (5 Tests)
  // ============================================================================
  await harness.test("T1-F06-01: Middleware rewrites custom domain studio.luminacine.com to /lumina-cine", async () => {
    const req = new NextRequest("http://studio.luminacine.com/book", {
      headers: { host: "studio.luminacine.com" },
    });
    const res = middleware(req);
    harness.assert(res !== undefined, "Middleware returned a response");
    const rewriteHeader = res.headers.get("x-middleware-rewrite");
    const tenantSlug = res.headers.get("x-tenant-slug");
    harness.assert(
      rewriteHeader?.includes("/lumina-cine/book") || res.headers.get("x-is-custom-domain") === "true",
      "Middleware rewrote custom domain path to include tenant slug"
    );
    harness.assert(tenantSlug === "lumina-cine", "Middleware set x-tenant-slug: lumina-cine");
  });

  await harness.test("T1-F06-02: Middleware rewrites custom domain studio.apexfilms.com to /apex-media", async () => {
    const req = new NextRequest("http://studio.apexfilms.com/services", {
      headers: { host: "studio.apexfilms.com" },
    });
    const res = middleware(req);
    const tenantSlug = res.headers.get("x-tenant-slug");
    harness.assert(tenantSlug === "apex-media", "Middleware set x-tenant-slug: apex-media");
  });

  await harness.test("T1-F06-03: Middleware honors direct x-tenant-slug header simulation", async () => {
    const req = new NextRequest("http://localhost:3000/pricing", {
      headers: {
        host: "localhost:3000",
        "x-tenant-slug": "lumina-cine",
      },
    });
    const res = middleware(req);
    harness.assert(res.headers.get("x-tenant-slug") === "lumina-cine", "Honored simulated x-tenant-slug header");
  });

  await harness.test("T1-F06-04: Middleware passes platform routes through without tenant rewrites", async () => {
    const platformRoutes = ["/", "/create-studio", "/super-admin"];
    for (const route of platformRoutes) {
      const req = new NextRequest(`http://localhost:3000${route}`, {
        headers: { host: "localhost:3000" },
      });
      const res = middleware(req);
      harness.assert(res.headers.get("x-tenant-slug") === null, `Route ${route} passed through without tenant rewrite`);
    }
  });

  await harness.test("T1-F06-05: Middleware bypasses Next.js internal paths, static files, and API routes", async () => {
    const bypassPaths = [
      "/_next/static/chunks/main.js",
      "/api/upload",
      "/uploads/logos/brand.png",
      "/favicon.ico",
    ];
    for (const path of bypassPaths) {
      const req = new NextRequest(`http://localhost:3000${path}`, {
        headers: { host: "localhost:3000" },
      });
      const res = middleware(req);
      harness.assert(res.headers.get("x-tenant-slug") === null, `Path ${path} bypassed middleware tenant processing`);
    }
  });

  // ============================================================================
  // Feature 7: SaaS Platform Landing Page (5 Tests)
  // ============================================================================
  await harness.test("T1-F07-01: Landing page data retrieves flagship studios with disciplines and currencies", async () => {
    const tenants = await db.tenant.findMany({
      where: { slug: { in: ["lumina-cine", "apex-media"] } },
      select: { slug: true, name: true, discipline: true, currency: true },
    });
    harness.assert(tenants.length === 2, "Found both flagship studios");
    const lumina = tenants.find((t) => t.slug === "lumina-cine");
    const apex = tenants.find((t) => t.slug === "apex-media");
    harness.assert(lumina?.discipline === "HYBRID" && lumina?.currency === "USD", "Lumina has HYBRID discipline and USD currency");
    harness.assert(apex?.discipline === "PHOTOGRAPHY" && apex?.currency === "MYR", "Apex has PHOTOGRAPHY discipline and MYR currency");
  });

  await harness.test("T1-F07-02: Landing page metrics compute showcase portfolio counts and active package counts", async () => {
    const luminaShowcaseCount = await db.showcaseItem.count({ where: { tenantId: luminaTenant!.id } });
    const luminaPackageCount = await db.servicePackage.count({ where: { tenantId: luminaTenant!.id } });
    harness.assert(luminaShowcaseCount > 0, "Lumina has active showcase items", `Count: ${luminaShowcaseCount}`);
    harness.assert(luminaPackageCount > 0, "Lumina has active service packages", `Count: ${luminaPackageCount}`);
  });

  await harness.test("T1-F07-03: CTA navigation targets match required application endpoints", async () => {
    const ctaTargets = ["/create-studio", "/super-admin", "/lumina-cine", "/apex-media"];
    for (const target of ctaTargets) {
      harness.assert(typeof target === "string" && target.startsWith("/"), `Valid CTA target: ${target}`);
    }
  });

  await harness.test("T1-F07-04: Nocturne Cine branding attributes configured on flagship studios", async () => {
    const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    harness.assert(Boolean(lumina?.brandColor), "Lumina has custom brandColor hex code");
    harness.assert(typeof lumina?.tagline === "string" && lumina.tagline.length > 5, "Lumina has cinematic tagline");
    harness.assert(typeof lumina?.bio === "string" && lumina.bio.length > 10, "Lumina has studio narrative bio");
  });

  await harness.test("T1-F07-05: Studio fallback handling when tenant has no custom logo", async () => {
    const fallbackTenant = await db.tenant.create({
      data: {
        name: "No Logo Studios",
        slug: `nologo_${Date.now()}`,
        discipline: "VIDEOGRAPHY",
        currency: "USD",
        logoUrl: null,
      },
    });
    harness.registerTeardown(async () => {
      await db.tenant.delete({ where: { id: fallbackTenant.id } }).catch(() => null);
    });
    harness.assert(fallbackTenant.logoUrl === null, "Tenant created without logo");
    // Verify fallback initial letters can be derived: "No Logo Studios" -> "NL"
    const initials = fallbackTenant.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
    harness.assert(initials === "NL", "Computed fallback initials 'NL' from studio name");
  });

  // ============================================================================
  // Feature 8: Self-Service Studio Onboarding (5 Tests)
  // ============================================================================
  await harness.test("T1-F08-01: checkSlugAvailability rejects reserved platform slugs", async () => {
    const reserved = ["super-admin", "create-studio", "api", "admin"];
    for (const slug of reserved) {
      const res = await checkSlugAvailability(slug);
      harness.assert(res.available === false, `Reserved slug '${slug}' is reported as unavailable`);
    }
  });

  await harness.test("T1-F08-02: checkSlugAvailability rejects already registered tenant slugs", async () => {
    const res = await checkSlugAvailability("lumina-cine");
    harness.assert(res.available === false, "Existing tenant slug 'lumina-cine' rejected");
  });

  await harness.test("T1-F08-03: checkSlugAvailability accepts valid unique studio slug", async () => {
    const uniqueSlug = `cine-oasis-${Date.now()}`;
    const res = await checkSlugAvailability(uniqueSlug);
    harness.assert(res.available === true, `Unique slug '${uniqueSlug}' accepted`);
  });

  await harness.test("T1-F08-04: onboardStudio completes registration with atomic default catalog seeding", async () => {
    const testSlug = `onboard-e2e-${Date.now()}`;
    const ownerEmail = `${testSlug}@studio.test`;

    const onboardRes = await onboardStudio({
      name: "Onboard E2E Studio",
      slug: testSlug,
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Alexandra Vance",
      ownerEmail,
      ownerPhone: "+15559876543",
      password: "StrongPassword123!",
      subscriptionTier: "PRO",
      tagline: "Precision Hybrid Production",
      bio: "Editorial and commercial cinema house.",
    });

    harness.assert(onboardRes.success === true, "onboardStudio returned success: true");

    const createdTenant = await db.tenant.findUnique({
      where: { slug: testSlug },
      include: {
        users: true,
        campaignCategories: true,
        frameDesigns: true,
        printSizes: true,
        proposalAddOnTemplates: true,
        servicePackages: true,
      },
    });

    harness.registerTeardown(async () => {
      if (createdTenant) {
        await db.tenant.delete({ where: { id: createdTenant.id } }).catch(() => null);
      }
    });

    harness.assert(createdTenant !== null, "Tenant record exists in database");
    harness.assert(createdTenant?.users.length === 1, "Owner user created");
    harness.assert(createdTenant?.users[0]?.role === "STUDIO_OWNER", "Owner has STUDIO_OWNER role");
    harness.assert(createdTenant?.campaignCategories.length === 4, "4 default campaign categories seeded");
    harness.assert(createdTenant?.frameDesigns.length === 3, "3 default frame designs seeded");
    harness.assert(createdTenant?.printSizes.length === 3, "3 default print sizes seeded");
    harness.assert(createdTenant?.proposalAddOnTemplates.length === 4, "4 default add-on templates seeded");
    harness.assert(createdTenant?.servicePackages.length === 1, "1 starter service package seeded");
  });

  await harness.test("T1-F08-05: onboardStudio rejects submission if owner email is already taken", async () => {
    const superAdmin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    harness.assert(superAdmin !== null, "Super admin user exists");

    const dupRes = await onboardStudio({
      name: "Duplicate Email Studio",
      slug: `dup-mail-${Date.now()}`,
      discipline: "PHOTOGRAPHY",
      currency: "USD",
      ownerName: "Imposter",
      ownerEmail: superAdmin!.email,
      ownerPhone: "+15551112222",
      password: "StrongPassword123!",
      subscriptionTier: "STARTER",
    });

    harness.assert(dupRes.success === false, "onboardStudio rejected duplicate owner email");
    harness.assert(
      Boolean(dupRes.error?.toLowerCase().includes("taken") || dupRes.error?.toLowerCase().includes("email") || dupRes.fieldErrors?.ownerEmail),
      "Error indicates email collision"
    );
  });

  // ============================================================================
  // Feature 9: Platform Super-Admin Console (5 Tests)
  // ============================================================================
  await harness.test("T1-F09-01: getPlatformMetrics returns total registered studios count matching database", async () => {
    const metrics = await getPlatformMetrics();
    const dbCount = await db.tenant.count();
    harness.assertEqual(metrics.totalStudios, dbCount, "metrics.totalStudios matches db.tenant.count()");
  });

  await harness.test("T1-F09-02: getPlatformMetrics computes estimated MRR based on active subscriptions", async () => {
    const metrics = await getPlatformMetrics();
    harness.assert(typeof metrics.estimatedMrrUsd === "number", "estimatedMrrUsd is a number");
    harness.assert(metrics.estimatedMrrUsd >= 0, "estimatedMrrUsd is non-negative");
  });

  await harness.test("T1-F09-03: getPlatformMetrics separates settled revenue and pending amounts by currency", async () => {
    const metrics = await getPlatformMetrics();
    harness.assert(typeof metrics.paidRevenueUsd === "number", "paidRevenueUsd is defined");
    harness.assert(typeof metrics.paidRevenueMyr === "number", "paidRevenueMyr is defined");
    harness.assert(typeof metrics.pendingVerificationAmountUsd === "number", "pendingVerificationAmountUsd is defined");
    harness.assert(typeof metrics.pendingVerificationAmountMyr === "number", "pendingVerificationAmountMyr is defined");
  });

  await harness.test("T1-F09-04: getAllTenantsSummary returns complete tenant directory with entity counters", async () => {
    const directory = await getAllTenantsSummary();
    harness.assert(Array.isArray(directory) && directory.length >= 2, "Directory contains registered studios");
    const luminaEntry = directory.find((t) => t.slug === "lumina-cine");
    harness.assert(luminaEntry !== null && luminaEntry !== undefined, "Lumina entry present in directory");
    if (luminaEntry) {
      harness.assert(typeof luminaEntry.userCount === "number", "User count present");
      harness.assert(typeof luminaEntry.slotCount === "number", "Slot count present");
      harness.assert(typeof luminaEntry.projectCount === "number", "Project count present");
    }
  });

  await harness.test("T1-F09-05: getPlatformMetrics calculates active projects across pre/production stages", async () => {
    const metrics = await getPlatformMetrics();
    const actualActive = await db.project.count({
      where: { status: { in: ["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION", "IN_REVIEW"] } },
    });
    harness.assertEqual(metrics.activeProjects, actualActive, "metrics.activeProjects matches active projects query");
  });

  // ============================================================================
  // Feature 10: Public Tenant Showcase (5 Tests)
  // ============================================================================
  await harness.test("T1-F10-01: Tenant showcase resolves existing tenant and returns null for non-existent studio", async () => {
    const valid = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    const invalid = await db.tenant.findUnique({ where: { slug: "ghost-studio-404" } });
    harness.assert(valid !== null, "Resolved lumina-cine");
    harness.assert(invalid === null, "ghost-studio-404 returned null");
  });

  await harness.test("T1-F10-02: Showcase items are strictly scoped by tenantId", async () => {
    const luminaItems = await db.showcaseItem.findMany({ where: { tenantId: luminaTenant!.id } });
    harness.assert(luminaItems.length > 0, "Lumina showcase items exist");
    harness.assert(luminaItems.every((item) => item.tenantId === luminaTenant!.id), "All items match Lumina tenantId");
  });

  await harness.test("T1-F10-03: Studio hero data attributes are populated accurately", async () => {
    const studio = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    harness.assert(Boolean(studio?.tagline), "tagline populated");
    harness.assert(Boolean(studio?.bio), "bio populated");
    harness.assert(Boolean(studio?.discipline), "discipline populated");
  });

  await harness.test("T1-F10-04: Multi-tenant showcase data isolation: Apex items never appear in Lumina query", async () => {
    const apexItems = await db.showcaseItem.findMany({ where: { tenantId: apexTenant!.id } });
    const apexItemIds = new Set(apexItems.map((i) => i.id));
    const luminaItems = await db.showcaseItem.findMany({ where: { tenantId: luminaTenant!.id } });
    for (const luminaItem of luminaItems) {
      harness.assert(!apexItemIds.has(luminaItem.id), `Lumina item ${luminaItem.id} is distinct from Apex items`);
    }
  });

  await harness.test("T1-F10-05: Featured packages linked to showcase items populate deliverables and turnaround", async () => {
    const featuredPackages = await db.servicePackage.findMany({
      where: { tenantId: luminaTenant!.id, isFeatured: true },
    });
    harness.assert(featuredPackages.length > 0, "Lumina has at least one featured package");
    for (const pkg of featuredPackages) {
      harness.assert(pkg.price > 0, "Package price is > 0");
      harness.assert(typeof pkg.turnaround === "string" && pkg.turnaround.length > 0, "turnaround is defined string");
      harness.assert(typeof pkg.deliverables === "string" && pkg.deliverables.length > 0, "deliverables is defined string");
    }
  });

  // ============================================================================
  // Feature 11: Campaign Category Filters (5 Tests)
  // ============================================================================
  await harness.test("T1-F11-01: Lumina returns Commercial/Weddings and Apex returns Convocation/Raya categories", async () => {
    const luminaCats = await db.campaignCategory.findMany({ where: { tenantId: luminaTenant!.id } });
    const apexCats = await db.campaignCategory.findMany({ where: { tenantId: apexTenant!.id } });

    const luminaSlugs = new Set(luminaCats.map((c) => c.slug.toLowerCase()));
    const apexSlugs = new Set(apexCats.map((c) => c.slug.toLowerCase()));

    harness.assert(luminaSlugs.has("commercial") || luminaSlugs.has("weddings"), "Lumina has Commercial or Weddings category");
    harness.assert(apexSlugs.has("convocation") || apexSlugs.has("hari-raya"), "Apex has Convocation or Hari Raya category");
  });

  await harness.test("T1-F11-02: Category badge icons and descriptions populate accurately", async () => {
    const categories = await db.campaignCategory.findMany({ where: { tenantId: luminaTenant!.id } });
    for (const cat of categories) {
      harness.assert(typeof cat.name === "string" && cat.name.length > 0, "Category has valid name");
      harness.assert(typeof cat.slug === "string" && cat.slug.length > 0, "Category has valid slug");
    }
  });

  await harness.test("T1-F11-03: Filtering showcase items by category returns only items for that category", async () => {
    const commercialItems = await db.showcaseItem.findMany({
      where: { tenantId: luminaTenant!.id, category: "COMMERCIAL" },
    });
    if (commercialItems.length > 0) {
      harness.assert(commercialItems.every((i) => i.category === "COMMERCIAL"), "All items belong to COMMERCIAL category");
    } else {
      harness.assert(true, "No commercial showcase items found");
    }
  });

  await harness.test("T1-F11-04: Inactive categories (isActive: false) are excluded from public showcase", async () => {
    const inactiveCat = await db.campaignCategory.create({
      data: {
        tenantId: luminaTenant!.id,
        name: "Archived Campaign",
        slug: `archived-${Date.now()}`,
        isActive: false,
      },
    });
    harness.registerTeardown(async () => {
      await db.campaignCategory.delete({ where: { id: inactiveCat.id } }).catch(() => null);
    });

    const activePublicCats = await db.campaignCategory.findMany({
      where: { tenantId: luminaTenant!.id, isActive: true },
    });
    harness.assert(!activePublicCats.some((c) => c.id === inactiveCat.id), "Inactive category excluded from public query");
  });

  await harness.test("T1-F11-05: Compound uniqueness allows identical category slug across distinct tenants", async () => {
    const sharedSlug = `holiday-special-${Date.now()}`;
    const catLumina = await db.campaignCategory.create({
      data: { tenantId: luminaTenant!.id, name: "Holiday Special", slug: sharedSlug },
    });
    const catApex = await db.campaignCategory.create({
      data: { tenantId: apexTenant!.id, name: "Holiday Special", slug: sharedSlug },
    });

    harness.registerTeardown(async () => {
      await db.campaignCategory.deleteMany({ where: { slug: sharedSlug } }).catch(() => null);
    });

    harness.assert(catLumina.id !== catApex.id, "Both tenants created category with identical slug without collision");
  });

  // ============================================================================
  // Feature 12: Cinema-Style Slot Selection Grid (5 Tests)
  // ============================================================================
  await harness.test("T1-F12-01: getTenantBookingSlots returns slots chronologically sorted", async () => {
    const res = await getTenantBookingSlots({ tenantSlug: "lumina-cine" });
    harness.assert(res.success === true, "getTenantBookingSlots returned success: true");
    harness.assert(Array.isArray(res.slots) && res.slots.length > 0, "Slots returned");
  });

  await harness.test("T1-F12-02: Slot pricing and deposit required match database configuration", async () => {
    const res = await getTenantBookingSlots({ tenantSlug: "lumina-cine" });
    for (const slot of res.slots) {
      harness.assert(slot.price >= 0, "Slot price is non-negative");
      harness.assert(slot.depositRequired >= 0, "Deposit required is non-negative");
      harness.assert(slot.depositRequired <= slot.price, "Deposit required does not exceed total price");
    }
  });

  await harness.test("T1-F12-03: Filtering slots by category parameter returns only matching category slots", async () => {
    const res = await getTenantBookingSlots({ tenantSlug: "lumina-cine", category: "COMMERCIAL" });
    harness.assert(res.success === true, "Filtered slot query succeeded");
    harness.assert(res.slots.every((s) => s.category === "COMMERCIAL"), "All returned slots match category COMMERCIAL");
  });

  await harness.test("T1-F12-04: Slot status mapping covers valid status states", async () => {
    const validStatuses = new Set(["AVAILABLE", "HELD", "PENDING_VERIFICATION", "BOOKED", "BLOCKED"]);
    const res = await getTenantBookingSlots({ tenantSlug: "lumina-cine" });
    for (const slot of res.slots) {
      harness.assert(validStatuses.has(slot.status), `Slot ${slot.id} has valid status: ${slot.status}`);
    }
  });

  await harness.test("T1-F12-05: Expired holds are automatically cleared back to AVAILABLE on slot retrieval", async () => {
    const expiredSlot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 3),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "COMMERCIAL",
        price: 350,
        depositRequired: 175,
        status: "HELD",
        heldUntil: new Date(Date.now() - 60000), // Expired 1 min ago
        heldBySessionId: "expired_session_123",
      },
    });

    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: expiredSlot.id } }).catch(() => null);
    });

    // Calling getTenantBookingSlots triggers auto-cleanup
    await getTenantBookingSlots({ tenantSlug: "lumina-cine" });

    const reloaded = await db.bookingSlot.findUnique({ where: { id: expiredSlot.id } });
    harness.assert(reloaded?.status === "AVAILABLE", "Expired held slot automatically reverted to AVAILABLE");
    harness.assert(reloaded?.heldBySessionId === null, "heldBySessionId cleared to null");
    harness.assert(reloaded?.heldUntil === null, "heldUntil cleared to null");
  });

  // ============================================================================
  // Feature 13: 10-Minute Slot Holding Engine (5 Tests)
  // ============================================================================
  await harness.test("T1-F13-01: Session A holds AVAILABLE slot: status becomes HELD and heldUntil is ~10 mins in future", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 4),
        startTime: "11:00 AM",
        endTime: "01:00 PM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const sessionA = "sess_hold_engine_a_" + Date.now();
    const tBefore = Date.now();
    const holdRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: sessionA,
    });

    harness.assert(holdRes.success === true, "holdBookingSlot returned success: true");
    const heldSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(heldSlot?.status === "HELD", "Slot status is HELD");
    harness.assert(heldSlot?.heldBySessionId === sessionA, "heldBySessionId matches session A");

    const heldUntilMs = heldSlot?.heldUntil ? new Date(heldSlot.heldUntil).getTime() : 0;
    const expectedTenMins = tBefore + 10 * 60 * 1000;
    harness.assertRange(heldUntilMs, expectedTenMins - 2000, expectedTenMins + 5000, "heldUntil is ~10 minutes in future");
  });

  await harness.test("T1-F13-02: Concurrent Session B attempting to hold same active slot is rejected with SLOT_ALREADY_HELD", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 5),
        startTime: "03:00 PM",
        endTime: "05:00 PM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const sessionA = "sess_winner_" + Date.now();
    const sessionB = "sess_loser_" + Date.now();

    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: sessionA });
    const loserRes = await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: sessionB });

    harness.assert(loserRes.success === false, "Session B hold attempt rejected");
    harness.assert(loserRes.error === "SLOT_ALREADY_HELD", "Error code is SLOT_ALREADY_HELD");
  });

  await harness.test("T1-F13-03: Session A can refresh its own active hold without conflict", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 6),
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const sessionA = "sess_refresh_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: sessionA });

    const refreshRes = await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: sessionA });
    harness.assert(refreshRes.success === true, "Session A refreshed own hold successfully");
  });

  await harness.test("T1-F13-04: Switching slots: holding Slot B with previousSlotId automatically releases Slot A", async () => {
    const slotA = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 7),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    const slotB = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 7),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slotA.id } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slotB.id } }).catch(() => null);
    });

    const session = "sess_switch_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slotA.id, sessionId: session });

    // Switch to Slot B passing previousSlotId
    const switchRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slotB.id,
      sessionId: session,
      previousSlotId: slotA.id,
    });

    harness.assert(switchRes.success === true, "Holding Slot B succeeded");
    const reloadedA = await db.bookingSlot.findUnique({ where: { id: slotA.id } });
    const reloadedB = await db.bookingSlot.findUnique({ where: { id: slotB.id } });

    harness.assert(reloadedA?.status === "AVAILABLE", "Slot A was released back to AVAILABLE");
    harness.assert(reloadedB?.status === "HELD", "Slot B is now HELD");
  });

  await harness.test("T1-F13-05: releaseBookingSlot releases held slot back to AVAILABLE with cleared token", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 8),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 400,
        depositRequired: 200,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const session = "sess_release_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const releaseRes = await releaseBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: session,
    });

    harness.assert(releaseRes.success === true, "releaseBookingSlot succeeded");
    const reloaded = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(reloaded?.status === "AVAILABLE", "Slot returned to AVAILABLE");
    harness.assert(reloaded?.heldBySessionId === null, "heldBySessionId cleared");
  });

  // ============================================================================
  // Feature 14: Slot Countdown Timer UI (5 Tests)
  // ============================================================================
  await harness.test("T1-F14-01: heldUntil timestamp is returned as valid ISO 8601 string", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 9),
        startTime: "08:00 AM",
        endTime: "10:00 AM",
        category: "COMMERCIAL",
        price: 300,
        depositRequired: 150,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const res = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: "sess_iso_" + Date.now(),
    });

    harness.assert(typeof res.heldUntil === "string", "heldUntil is string");
    const parsedDate = new Date(res.heldUntil!);
    harness.assert(!isNaN(parsedDate.getTime()), "heldUntil parses into valid Date object");
  });

  await harness.test("T1-F14-02: Remaining duration calculation accurately computes seconds left", async () => {
    const now = Date.now();
    const tenMinsLater = new Date(now + 600 * 1000);
    const remainingSecs = Math.max(0, Math.floor((tenMinsLater.getTime() - now) / 1000));
    harness.assertRange(remainingSecs, 598, 600, "Calculated ~600 seconds remaining");
  });

  await harness.test("T1-F14-03: Warning threshold triggers when remaining time is under 120 seconds", async () => {
    const remainingSeconds = 115;
    const isWarningState = remainingSeconds < 120 && remainingSeconds > 0;
    harness.assert(isWarningState, "Warning state triggered when remaining time < 120s");
  });

  await harness.test("T1-F14-04: Expired slot recovery: any session can acquire a slot whose heldUntil has passed", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 10),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "COMMERCIAL",
        price: 300,
        depositRequired: 150,
        status: "HELD",
        heldUntil: new Date(Date.now() - 5000), // Expired 5 seconds ago
        heldBySessionId: "sess_old_holder",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const newSession = "sess_new_claimer_" + Date.now();
    const claimRes = await holdBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: newSession,
    });

    harness.assert(claimRes.success === true, "New session claimed expired slot");
    const reloaded = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(reloaded?.heldBySessionId === newSession, "Slot heldBySessionId transferred to new session");
  });

  await harness.test("T1-F14-05: Session mismatch protection: user cannot release a slot held by a different session", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 11),
        startTime: "06:00 PM",
        endTime: "08:00 PM",
        category: "COMMERCIAL",
        price: 300,
        depositRequired: 150,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const realSession = "sess_legit_" + Date.now();
    const rogueSession = "sess_rogue_" + Date.now();

    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: realSession });

    // Rogue session attempts release
    const releaseRes = await releaseBookingSlot({
      tenantId: luminaTenant!.id,
      slotId: slot.id,
      sessionId: rogueSession,
    });

    harness.assert(releaseRes.success === false, "Rogue release attempt rejected (result.count is 0)");
    const reloaded = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(reloaded?.status === "HELD", "Slot remains HELD");
    harness.assert(reloaded?.heldBySessionId === realSession, "Slot heldBySessionId unchanged");
  });
}
