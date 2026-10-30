import { db } from "@/lib/db";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { SlugSchema, OnboardStudioSchema, RESERVED_SLUGS } from "@/lib/validations/onboarding";

interface AssertResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
  critical?: boolean;
}

const results: AssertResult[] = [];

function check(
  category: string,
  name: string,
  passed: boolean,
  details?: string,
  critical: boolean = false
) {
  results.push({ category, name, passed, details, critical });
  if (passed) {
    console.log(`  ✓ [${category}] ${name}${details ? ` — ${details}` : ""}`);
  } else {
    console.error(`  ❌ [${category}] FAIL: ${name}${details ? ` — ${details}` : ""}${critical ? " [CRITICAL]" : ""}`);
  }
}

async function runEmpiricalChallenger2() {
  console.log("===============================================================================");
  console.log("  Challenger M2 Iteration 2 (Agent 2) Deep Empirical Adversarial Verification  ");
  console.log("===============================================================================\n");

  // ---------------------------------------------------------------------------
  // SECTION 1: Exhaustive Reserved Slugs Rejection on Direct Server Action Call
  // ---------------------------------------------------------------------------
  console.log("▶ 1. Exhaustive Reserved Slugs Rejection (Direct Server Action Invocation)");

  const allReservedSlugs = [
    "super-admin",
    "create-studio",
    "api",
    "admin",
    "login",
    "auth",
    "public",
    "uploads",
    "_next",
    "favicon.ico",
    "settings",
    "dashboard",
    // Case sensitivity variations
    "SUPER-ADMIN",
    "Super-Admin",
    "API",
    "Admin",
    "Dashboard",
    "Settings",
  ];

  for (const slug of allReservedSlugs) {
    // 1.1 Schema parse test
    const schemaCheck = SlugSchema.safeParse(slug);
    check(
      "Reserved Slugs Schema",
      `SlugSchema rejects '${slug}'`,
      !schemaCheck.success,
      schemaCheck.success ? "Schema allowed reserved slug!" : "Correctly rejected by schema"
    );

    // 1.2 checkSlugAvailability test
    const availCheck = await checkSlugAvailability(slug);
    check(
      "Reserved Slugs Availability",
      `checkSlugAvailability rejects '${slug}'`,
      availCheck.available === false,
      `available=${availCheck.available}, error=${availCheck.error}`
    );

    // 1.3 Direct Server Action onboardStudio call
    const email = `adversary_${slug.toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now()}@test.io`;
    const onboardRes = await onboardStudio({
      name: `Adversary Studio ${slug}`,
      slug,
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Adversary Attacker",
      ownerEmail: email,
      password: "Password123!",
      subscriptionTier: "PRO",
    });

    check(
      "Reserved Slugs Server Action",
      `onboardStudio rejects reserved slug '${slug}'`,
      onboardRes.success === false,
      `success=${onboardRes.success}, error=${onboardRes.error}`,
      true
    );

    // 1.4 Database verification: Ensure no record exists in dev.db
    const dbRecord = await db.tenant.findFirst({
      where: {
        OR: [
          { slug: slug },
          { slug: slug.toLowerCase() },
        ],
      },
    });

    // Check if this record is a legitimate existing studio or an attacker created one
    const isExploitRecord = dbRecord && dbRecord.id !== "ten_lumina" && dbRecord.id !== "ten_apex";
    check(
      "Reserved Slugs DB Persistence",
      `dev.db has 0 tenant records for reserved slug '${slug}'`,
      !isExploitRecord,
      isExploitRecord ? `CRITICAL: Leaked tenant ID ${dbRecord?.id}` : "Clean (no record in db)",
      true
    );

    // If an exploit record was created, clean it up immediately
    if (isExploitRecord && dbRecord) {
      await db.user.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.campaignCategory.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.printSize.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.frameDesign.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.proposalAddOnTemplate.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.servicePackage.deleteMany({ where: { tenantId: dbRecord.id } });
      await db.tenant.delete({ where: { id: dbRecord.id } });
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: Boundary Regex & Malformed Slug Stress-Testing
  // ---------------------------------------------------------------------------
  console.log("\n▶ 2. Slug Boundary Regex & Malformed Input Hardening");

  const boundaryTestCases = [
    { label: "Hyphen-only (1 hyphen)", slug: "-", shouldPass: false },
    { label: "Hyphen-only (2 hyphens)", slug: "--", shouldPass: false },
    { label: "Hyphen-only (3 hyphens)", slug: "---", shouldPass: false },
    { label: "Leading single hyphen", slug: "-mystudio", shouldPass: false },
    { label: "Leading double hyphen", slug: "--mystudio", shouldPass: false },
    { label: "Trailing single hyphen", slug: "mystudio-", shouldPass: false },
    { label: "Trailing double hyphen", slug: "mystudio--", shouldPass: false },
    { label: "Consecutive hyphens inside", slug: "my--studio", shouldPass: false },
    { label: "Triple hyphens inside", slug: "my---studio", shouldPass: false },
    { label: "Space in middle", slug: "my studio", shouldPass: false },
    { label: "Leading whitespace", slug: " mystudio", shouldPass: false },
    { label: "Trailing whitespace", slug: "mystudio ", shouldPass: false },
    { label: "Period/dot separator", slug: "my.studio", shouldPass: false },
    { label: "Underscore separator", slug: "my_studio", shouldPass: false },
    { label: "Slash separator", slug: "my/studio", shouldPass: false },
    { label: "Backslash separator", slug: "my\\studio", shouldPass: false },
    { label: "Length 1 character ('a')", slug: "a", shouldPass: false },
    { label: "Length 2 characters ('ab')", slug: "ab", shouldPass: false },
    { label: "Length 51 characters", slug: "a".repeat(51), shouldPass: false },
    // Valid boundaries
    { label: "Min valid length 3 ('abc')", slug: "abc", shouldPass: true },
    { label: "Min valid with hyphen ('a-b')", slug: "a-b", shouldPass: true },
    { label: "Alphanumeric mix ('studio-42')", slug: "studio-42", shouldPass: true },
    { label: "Max valid length 50", slug: "a".repeat(50), shouldPass: true },
    { label: "Max valid 50 with hyphens", slug: "a".repeat(24) + "-" + "b".repeat(25), shouldPass: true },
  ];

  for (const tc of boundaryTestCases) {
    const parsed = SlugSchema.safeParse(tc.slug);
    const valid = parsed.success;
    check(
      "Boundary Regex",
      `${tc.label} ('${tc.slug.length > 25 ? tc.slug.slice(0, 20) + "..." : tc.slug}') ${tc.shouldPass ? "ACCEPTED" : "REJECTED"}`,
      valid === tc.shouldPass,
      `Expected ${tc.shouldPass ? "valid" : "invalid"}, got ${valid ? "valid" : "invalid"}`
    );

    // If invalid, verify checkSlugAvailability also rejects it
    if (!tc.shouldPass) {
      const avail = await checkSlugAvailability(tc.slug);
      check(
        "Boundary Availability",
        `checkSlugAvailability rejects ${tc.label}`,
        avail.available === false,
        `avail=${avail.available}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: Relational Completeness & Rollback Invariance
  // ---------------------------------------------------------------------------
  console.log("\n▶ 3. Relational Completeness & Rollback Invariance");

  const testSlug = `rel-test-${Date.now().toString(36)}`;
  const testEmail = `owner_${Date.now().toString(36)}@reltest.com`;

  // Onboard valid studio
  const onboardRes = await onboardStudio({
    name: "Relational Verification Studio",
    slug: testSlug,
    discipline: "HYBRID",
    currency: "USD",
    tagline: "Verifying relational tree completeness",
    bio: "Deep inspection of multi-model relational integrity.",
    brandColor: "#10b981",
    ownerName: "Relational Auditor",
    ownerEmail: testEmail,
    password: "StrongSecurePassword123!",
    ownerPhone: "+1 (555) 987-6543",
    subscriptionTier: "PRO",
  });

  check(
    "Relational Onboard",
    "onboardStudio completes with success: true",
    onboardRes.success === true,
    JSON.stringify(onboardRes)
  );

  const tenant = await db.tenant.findUnique({
    where: { slug: testSlug },
    include: {
      users: true,
      campaignCategories: true,
      printSizes: true,
      frameDesigns: true,
      proposalAddOnTemplates: true,
      servicePackages: true,
      bookingSlots: true,
      projects: true,
      invoices: true,
    },
  });

  check("Relational Tree", "Tenant record found in SQLite dev.db", tenant !== null);

  if (tenant) {
    // 1. Owner User
    const owner = tenant.users.find((u) => u.role === "STUDIO_OWNER");
    check(
      "Relational Tree",
      "Owner user created with role STUDIO_OWNER",
      owner !== undefined && owner.email === testEmail
    );
    check(
      "Relational Tree",
      "Owner passwordHash is not plaintext and is bcrypt hash",
      Boolean(owner?.passwordHash && owner.passwordHash.startsWith("$2") && owner.passwordHash !== "StrongSecurePassword123!")
    );

    // 2. Categories
    const categories = tenant.campaignCategories;
    const catSlugs = new Set(categories.map((c) => c.slug));
    check(
      "Relational Tree",
      "Exactly 4 standard categories seeded (convocation, hari-raya, wedding, commercial)",
      categories.length === 4 &&
        catSlugs.has("convocation") &&
        catSlugs.has("hari-raya") &&
        catSlugs.has("wedding") &&
        catSlugs.has("commercial"),
      `Found: ${Array.from(catSlugs).join(", ")}`
    );

    // All categories scoped to tenant.id
    const foreignCats = categories.filter((c) => c.tenantId !== tenant.id);
    check(
      "Relational Scoping",
      "All seeded categories have tenantId strictly matching created tenant",
      foreignCats.length === 0,
      `Foreign count: ${foreignCats.length}`
    );

    // 3. Print Sizes
    const printSizes = tenant.printSizes;
    const sizeCodes = new Set(printSizes.map((p) => p.code));
    check(
      "Relational Tree",
      "Print sizes include 8R, 12R, 16R",
      sizeCodes.has("8R") && sizeCodes.has("12R") && sizeCodes.has("16R"),
      `Codes: ${Array.from(sizeCodes).join(", ")}`
    );

    // 4. Frame Designs
    const frames = tenant.frameDesigns;
    check(
      "Relational Tree",
      "At least 3 frame designs created",
      frames.length >= 3,
      `Found: ${frames.length}`
    );

    // 5. Proposal Add-On Templates
    const addOns = tenant.proposalAddOnTemplates;
    check(
      "Relational Tree",
      "At least 4 proposal add-on templates created",
      addOns.length >= 4,
      `Found: ${addOns.length}`
    );

    // 6. Service Packages
    const packages = tenant.servicePackages;
    check(
      "Relational Tree",
      "Starter service package created",
      packages.length >= 1,
      `Found: ${packages.length} (${packages[0]?.name})`
    );

    // Clean up test tenant
    await db.user.deleteMany({ where: { tenantId: tenant.id } });
    await db.campaignCategory.deleteMany({ where: { tenantId: tenant.id } });
    await db.printSize.deleteMany({ where: { tenantId: tenant.id } });
    await db.frameDesign.deleteMany({ where: { tenantId: tenant.id } });
    await db.proposalAddOnTemplate.deleteMany({ where: { tenantId: tenant.id } });
    await db.servicePackage.deleteMany({ where: { tenantId: tenant.id } });
    await db.tenant.delete({ where: { id: tenant.id } });

    // Verify complete removal
    const postCleanTenant = await db.tenant.findUnique({ where: { id: tenant.id } });
    check("Cleanup Verification", "Test tenant cleanly purged from dev.db", postCleanTenant === null);
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: Multi-Tenant Category Isolation & Scoping Guarantees
  // ---------------------------------------------------------------------------
  console.log("\n▶ 4. Multi-Tenant Category Isolation & Cross-Tenant Security");

  const lumina = await db.tenant.findUnique({
    where: { slug: "lumina-cine" },
    include: { campaignCategories: true },
  });
  const apex = await db.tenant.findUnique({
    where: { slug: "apex-media" },
    include: { campaignCategories: true },
  });

  check("Tenants Exist", "Lumina CineWorks exists in dev.db", lumina !== null);
  check("Tenants Exist", "Apex Photo & Motion exists in dev.db", apex !== null);

  if (lumina && apex) {
    const luminaSlugs = lumina.campaignCategories.map((c) => c.slug);
    const apexSlugs = apex.campaignCategories.map((c) => c.slug);

    // Specification: Convocation and Hari Raya are exclusive to Apex
    check(
      "Category Isolation",
      "Apex has 'convocation' category",
      apexSlugs.includes("convocation")
    );
    check(
      "Category Isolation",
      "Apex has 'hari-raya' category",
      apexSlugs.includes("hari-raya")
    );
    check(
      "Category Isolation",
      "Lumina does NOT have 'convocation' category",
      !luminaSlugs.includes("convocation")
    );
    check(
      "Category Isolation",
      "Lumina does NOT have 'hari-raya' category",
      !luminaSlugs.includes("hari-raya")
    );

    // Weddings is exclusive to Lumina
    check(
      "Category Isolation",
      "Lumina has 'weddings' category",
      luminaSlugs.includes("weddings")
    );
    check(
      "Category Isolation",
      "Apex does NOT have 'weddings' category",
      !apexSlugs.includes("weddings")
    );

    // Direct database query scoping check: Query with where: { tenantId: lumina.id }
    const luminaQueryCats = await db.campaignCategory.findMany({
      where: { tenantId: lumina.id },
    });
    const apexQueryCats = await db.campaignCategory.findMany({
      where: { tenantId: apex.id },
    });

    const anyLuminaInApex = luminaQueryCats.some((c) => c.tenantId !== lumina.id);
    const anyApexInLumina = apexQueryCats.some((c) => c.tenantId !== apex.id);

    check(
      "Query Scoping",
      "Lumina query returns ZERO cross-tenant categories",
      !anyLuminaInApex
    );
    check(
      "Query Scoping",
      "Apex query returns ZERO cross-tenant categories",
      !anyApexInLumina
    );

    // Check all campaign categories in database to ensure none have orphan or null tenantId
    const allDbCats = await db.campaignCategory.findMany();
    const orphanCats = allDbCats.filter((c) => !c.tenantId);
    check(
      "Database Integrity",
      "All campaign categories have a valid, non-null tenantId",
      orphanCats.length === 0,
      `Total categories in dev.db: ${allDbCats.length}, Orphans: ${orphanCats.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: Summary & Verdict
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log("  Summary of Challenger M2 Iteration 2 Results");
  console.log("===============================================================================");

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const critical = results.filter((r) => !r.passed && r.critical).length;

  console.log(`Total Assertions : ${total}`);
  console.log(`Passed           : ${passed}`);
  console.log(`Failed           : ${failed}`);
  console.log(`Critical Failures: ${critical}\n`);

  if (failed > 0) {
    console.error("❌ FAILURES DETECTED:");
    for (const f of results.filter((r) => !r.passed)) {
      console.error(`  - [${f.category}] ${f.name}: ${f.details || "Failed"}`);
    }
    console.error("\nRECOMMENDED VERDICT: REQUEST_CHANGES");
    process.exitCode = 1;
  } else {
    console.log("✓ ALL EMPIRICAL CHALLENGES PASSED.");
    console.log("RECOMMENDED VERDICT: APPROVE");
  }

  return { total, passed, failed, critical };
}

runEmpiricalChallenger2()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
