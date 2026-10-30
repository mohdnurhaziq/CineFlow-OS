import { db } from "@/lib/db";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { holdBookingSlot, releaseBookingSlot, getTenantBookingSlots } from "@/lib/actions/booking";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

async function runM2Verification() {
  console.log("===============================================================");
  console.log("   CineFlow OS Milestone 2 Verification Suite (Modules 1 & 2)  ");
  console.log("===============================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`✗ FAIL: ${testName}`);
      if (details) console.error(`  ↳ Details: ${details}`);
      failedCount++;
      process.exitCode = 1;
    }
  }

  // ============================================================================
  // Test Suite 1: Middleware & Custom Domain Routing
  // ============================================================================
  console.log("--- 1. Multi-Tenant Middleware & Custom Domain Resolution ---");
  {
    // A: Test simulated custom domain header for Lumina CineWorks
    const reqLumina = new NextRequest("http://localhost:3000/book", {
      headers: { "x-custom-domain": "studio.luminacine.com" },
    });
    const resLumina = middleware(reqLumina);
    assert(
      resLumina.headers.get("x-tenant-slug") === "lumina-cine",
      "Middleware resolves 'studio.luminacine.com' to 'lumina-cine'",
      `Resolved: ${resLumina.headers.get("x-tenant-slug")}`
    );
    assert(
      resLumina.headers.get("x-is-custom-domain") === "true",
      "Middleware sets x-is-custom-domain header"
    );

    // B: Test simulated custom domain header for Apex Photo & Motion
    const reqApex = new NextRequest("http://localhost:3000/", {
      headers: { "x-custom-domain": "studio.apexfilms.com" },
    });
    const resApex = middleware(reqApex);
    assert(
      resApex.headers.get("x-tenant-slug") === "apex-media",
      "Middleware resolves 'studio.apexfilms.com' to 'apex-media'",
      `Resolved: ${resApex.headers.get("x-tenant-slug")}`
    );

    // C: Test test-override header x-tenant-slug
    const reqOverride = new NextRequest("http://localhost:3000/admin", {
      headers: { "x-tenant-slug": "custom-test-slug" },
    });
    const resOverride = middleware(reqOverride);
    assert(
      resOverride.headers.get("x-tenant-slug") === "custom-test-slug",
      "Middleware honors 'x-tenant-slug' direct override header"
    );

    // D: Test standard platform route passthrough (no rewrite)
    const reqPlatform = new NextRequest("http://localhost:3000/create-studio");
    const resPlatform = middleware(reqPlatform);
    assert(
      resPlatform.headers.get("x-tenant-slug") === null,
      "Platform routes pass through without unwanted tenant rewrites"
    );
  }

  // ============================================================================
  // Test Suite 2: SaaS Landing Page Flagship Switcher Data
  // ============================================================================
  console.log("\n--- 2. SaaS Landing Page Flagship Studios Data ---");
  {
    const lumina = await db.tenant.findUnique({
      where: { slug: "lumina-cine" },
      include: { campaignCategories: true, servicePackages: true },
    });
    const apex = await db.tenant.findUnique({
      where: { slug: "apex-media" },
      include: { campaignCategories: true, servicePackages: true },
    });

    assert(lumina !== null, "Flagship Studio 1 (Lumina CineWorks) exists");
    assert(lumina?.discipline === "HYBRID", "Lumina discipline is HYBRID");
    assert(lumina?.currency === "USD", "Lumina currency is USD");

    assert(apex !== null, "Flagship Studio 2 (Apex Photo & Motion) exists");
    assert(apex?.discipline === "PHOTOGRAPHY", "Apex discipline is PHOTOGRAPHY");
    assert(apex?.currency === "MYR", "Apex currency is MYR");
  }

  // ============================================================================
  // Test Suite 3: Self-Service Studio Onboarding Server Action
  // ============================================================================
  console.log("\n--- 3. Self-Service Onboarding Server Action (`onboardStudio`) ---");
  let createdTenantSlug = "";
  {
    // A: Slug availability check
    const reservedCheck = await checkSlugAvailability("super-admin");
    assert(
      reservedCheck.available === false,
      "checkSlugAvailability rejects reserved platform slug 'super-admin'"
    );

    const takenCheck = await checkSlugAvailability("lumina-cine");
    assert(
      takenCheck.available === false,
      "checkSlugAvailability rejects existing tenant slug 'lumina-cine'"
    );

    const testSlug = `test-studio-${Date.now().toString(36)}`;
    const freeCheck = await checkSlugAvailability(testSlug);
    assert(
      freeCheck.available === true,
      `checkSlugAvailability approves available slug '${testSlug}'`
    );

    // B: Execute full onboarding transaction
    createdTenantSlug = testSlug;
    const testEmail = `owner_${Date.now()}@teststudio.com`;
    const onboardResult = await onboardStudio({
      name: "Solaris Motion Lab",
      slug: testSlug,
      discipline: "VIDEOGRAPHY",
      currency: "USD",
      tagline: "Bold cinematic visuals for global brands",
      bio: "Pushing the boundaries of cinema tech and optical storytelling.",
      brandColor: "#f59e0b",
      ownerName: "Devon Vance",
      ownerEmail: testEmail,
      password: "SuperSecretPassword123!",
      ownerPhone: "+1 (555) 234-5678",
      subscriptionTier: "PRO",
    });

    assert(onboardResult.success === true, "onboardStudio executes successfully");
    assert(
      onboardResult.slug === testSlug,
      `onboardStudio returns newly created slug '${testSlug}'`
    );

    // C: Verify DB records created genuinely in SQLite dev.db
    const newTenant = await db.tenant.findUnique({
      where: { slug: testSlug },
      include: {
        users: true,
        campaignCategories: true,
        printSizes: true,
        frameDesigns: true,
        proposalAddOnTemplates: true,
        servicePackages: true,
      },
    });

    assert(newTenant !== null, "New Tenant record exists in dev.db");
    assert(
      newTenant?.subscriptionStatus === "ACTIVE",
      "New Tenant subscriptionStatus is ACTIVE"
    );
    assert(
      newTenant?.subscriptionTier === "PRO",
      "New Tenant subscriptionTier is PRO"
    );

    // Verify Owner user
    const ownerUser = newTenant?.users.find((u) => u.role === "STUDIO_OWNER");
    assert(ownerUser !== undefined, "Tenant has User with role STUDIO_OWNER");
    assert(ownerUser?.email === testEmail, "Owner User has correct email");
    assert(
      ownerUser?.passwordHash !== null &&
        ownerUser?.passwordHash !== "SuperSecretPassword123!",
      "Owner password was securely hashed (not stored in plain text)"
    );
    const passwordValid = await bcrypt.compare(
      "SuperSecretPassword123!",
      ownerUser?.passwordHash || ""
    );
    assert(passwordValid === true, "Owner password hash validates with bcrypt");

    // Verify 4 Standard Campaign Categories
    const categories = newTenant?.campaignCategories || [];
    assert(
      categories.length === 4,
      `Tenant has 4 standard campaign categories (found: ${categories.length})`
    );
    const categorySlugs = new Set(categories.map((c) => c.slug));
    assert(
      categorySlugs.has("convocation") &&
        categorySlugs.has("hari-raya") &&
        categorySlugs.has("wedding") &&
        categorySlugs.has("commercial"),
      "Tenant includes Convocation, Hari Raya, Wedding, and Commercial categories"
    );

    // Verify Print Sizes
    const printSizes = newTenant?.printSizes || [];
    assert(
      printSizes.length >= 3,
      `Tenant has at least 3 print sizes (found: ${printSizes.length})`
    );

    // Verify Frame Designs
    const frameDesigns = newTenant?.frameDesigns || [];
    assert(
      frameDesigns.length >= 3,
      `Tenant has at least 3 frame designs (found: ${frameDesigns.length})`
    );

    // Verify Proposal Add-On Templates
    const addOns = newTenant?.proposalAddOnTemplates || [];
    assert(
      addOns.length >= 4,
      `Tenant has at least 4 proposal add-on templates (found: ${addOns.length})`
    );

    // Verify Starter Service Package
    const packages = newTenant?.servicePackages || [];
    assert(
      packages.length >= 1,
      `Tenant has starter service package (found: ${packages.length})`
    );
  }

  // ============================================================================
  // Test Suite 4: Super-Admin Macro Platform Telemetry
  // ============================================================================
  console.log("\n--- 4. Platform Super-Admin Metrics (`getPlatformMetrics`) ---");
  {
    const metrics = await getPlatformMetrics();
    assert(metrics.totalStudios >= 3, `Total studios >= 3 (found: ${metrics.totalStudios})`);
    assert(metrics.estimatedMrrUsd > 0, `Estimated MRR > 0 (found: $${metrics.estimatedMrrUsd})`);
    assert(
      metrics.paidRevenueUsd > 0,
      `USD Paid revenue > 0 (found: $${metrics.paidRevenueUsd})`
    );
    assert(
      metrics.paidRevenueMyr > 0,
      `MYR Paid revenue > 0 (found: RM ${metrics.paidRevenueMyr})`
    );
    assert(metrics.totalBookings >= 4, `Total bookings >= 4 (found: ${metrics.totalBookings})`);
    assert(metrics.totalUsers >= 13, `Total users >= 13 (found: ${metrics.totalUsers})`);

    const summaries = await getAllTenantsSummary();
    assert(summaries.length >= 3, "getAllTenantsSummary returns all registered studios");
    const luminaSummary = summaries.find((s) => s.slug === "lumina-cine");
    assert(luminaSummary !== undefined, "Lumina summary exists in directory");
    assert(
      luminaSummary?.totalPaidRevenue !== undefined && luminaSummary.totalPaidRevenue > 0,
      `Lumina settled revenue correctly computed (found: $${luminaSummary?.totalPaidRevenue})`
    );
  }

  // ============================================================================
  // Test Suite 5: Public Tenant Showcase Scoping & Filters
  // ============================================================================
  console.log("\n--- 5. Public Tenant Showcase Scoping & Filters ---");
  {
    // Lumina: Commercial, Weddings, Studio Portrait
    const luminaCategories = await db.campaignCategory.findMany({
      where: { tenant: { slug: "lumina-cine" }, isActive: true },
    });
    const luminaSlugs = new Set(luminaCategories.map((c) => c.slug));
    assert(
      luminaSlugs.has("commercial") && luminaSlugs.has("weddings"),
      "Lumina showcase has commercial and weddings campaign categories"
    );

    // Apex: Convocation, Hari Raya, Studio Portrait, Commercial
    const apexCategories = await db.campaignCategory.findMany({
      where: { tenant: { slug: "apex-media" }, isActive: true },
    });
    const apexSlugs = new Set(apexCategories.map((c) => c.slug));
    assert(
      apexSlugs.has("convocation") && apexSlugs.has("hari-raya"),
      "Apex showcase has Convocation and Hari Raya campaign categories"
    );

    // Isolation check: Apex has convocation, Lumina does not
    assert(
      apexSlugs.has("convocation") && !luminaSlugs.has("convocation"),
      "Strict Scoping: Convocation is exclusive to Apex and not leaked to Lumina"
    );
  }

  // ============================================================================
  // Test Suite 6: Cinema Booking Engine & Atomic 10-Minute Slot Holding
  // ============================================================================
  console.log("\n--- 6. Cinema-Style Booking Engine & Slot Holding Concurrency ---");
  {
    const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    if (!luminaTenant) throw new Error("Lumina tenant not found");

    // Clean up or find an AVAILABLE slot
    let testSlot = await db.bookingSlot.findFirst({
      where: { tenantId: luminaTenant.id, status: "AVAILABLE" },
    });

    if (!testSlot) {
      testSlot = await db.bookingSlot.create({
        data: {
          tenantId: luminaTenant.id,
          category: "COMMERCIAL",
          campaignTitle: "Commercial Campaign Session",
          date: new Date(Date.now() + 86400000 * 5),
          startTime: "10:00 AM",
          endTime: "11:30 AM",
          status: "AVAILABLE",
          price: 850.0,
          depositRequired: 425.0,
        },
      });
    }

    const sessionA = "client_session_alpha";
    const sessionB = "client_session_bravo";

    // 1. Client Session A holds the slot
    const holdA = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: testSlot.id,
      sessionId: sessionA,
    });

    assert(holdA.success === true, "Session A acquires 10-minute hold on available slot");
    assert(
      holdA.heldUntil !== undefined,
      "holdBookingSlot returns heldUntil timestamp"
    );

    const heldUntilDate = new Date(holdA.heldUntil!);
    const diffMinutes = (heldUntilDate.getTime() - Date.now()) / (60 * 1000);
    assert(
      diffMinutes >= 9.8 && diffMinutes <= 10.1,
      `Slot lock duration is exactly 10 minutes (actual: ${diffMinutes.toFixed(2)} mins)`
    );

    // Verify slot state in database
    const slotInDb = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(slotInDb?.status === "HELD", "Database slot status transitioned to HELD");
    assert(
      slotInDb?.heldBySessionId === sessionA,
      "Database records heldBySessionId matching Session A"
    );

    // 2. Concurrency Test: Client Session B attempts to hold the same slot
    const holdB = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: testSlot.id,
      sessionId: sessionB,
    });

    assert(
      holdB.success === false,
      "Concurrent Session B is deterministically rejected from holding an active slot"
    );
    assert(
      holdB.error === "SLOT_ALREADY_HELD",
      "holdBookingSlot returns error code 'SLOT_ALREADY_HELD'"
    );

    // 3. Re-hold by Session A: Idempotency / Refresh own hold
    const holdARefresh = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: testSlot.id,
      sessionId: sessionA,
    });
    assert(
      holdARefresh.success === true,
      "Session A can refresh / maintain its own active hold without conflict"
    );

    // 4. Single-Slot Hold Discipline: Holding Slot B releases Slot A
    const slotB = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant.id,
        category: "COMMERCIAL",
        date: new Date(Date.now() + 86400000 * 6),
        startTime: "02:00 PM",
        endTime: "03:30 PM",
        status: "AVAILABLE",
        price: 950.0,
        depositRequired: 475.0,
      },
    });

    const holdASlotB = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotB.id,
      sessionId: sessionA,
      previousSlotId: testSlot.id,
    });

    assert(
      holdASlotB.success === true,
      "Session A successfully switches to new Slot B"
    );

    const slotARecheck = await db.bookingSlot.findUnique({ where: { id: testSlot.id } });
    assert(
      slotARecheck?.status === "AVAILABLE",
      "Switching slots automatically released prior Slot A back to AVAILABLE"
    );

    // 5. Early Voluntary Release: Client Session A releases Slot B
    const releaseResult = await releaseBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotB.id,
      sessionId: sessionA,
    });
    assert(releaseResult.success === true, "releaseBookingSlot successfully releases slot");

    const slotBRecheck = await db.bookingSlot.findUnique({ where: { id: slotB.id } });
    assert(
      slotBRecheck?.status === "AVAILABLE" && slotBRecheck?.heldBySessionId === null,
      "Slot B status is restored to AVAILABLE with null session ID"
    );

    // 6. Expired Hold Auto-Reclaim
    // Manually simulate an expired hold on slotB
    await db.bookingSlot.update({
      where: { id: slotB.id },
      data: {
        status: "HELD",
        heldUntil: new Date(Date.now() - 5000), // Expired 5 seconds ago
        heldBySessionId: sessionA,
      },
    });

    // Session B tries to hold slotB — it should reclaim the expired hold atomically!
    const holdBExpiredReclaim = await holdBookingSlot({
      tenantId: luminaTenant.id,
      slotId: slotB.id,
      sessionId: sessionB,
    });
    assert(
      holdBExpiredReclaim.success === true,
      "Session B successfully reclaims an expired slot hold"
    );

    // Clean up test slots
    await db.bookingSlot.delete({ where: { id: slotB.id } });
  }

  // ============================================================================
  // Cleanup test tenant
  // ============================================================================
  if (createdTenantSlug) {
    await db.tenant.delete({ where: { slug: createdTenantSlug } }).catch(() => {});
  }

  console.log("\n===============================================================");
  console.log(`   Verification Summary: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("===============================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runM2Verification()
  .catch((err) => {
    console.error("Fatal verification error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
