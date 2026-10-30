import { db } from "@/lib/db";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import { OnboardStudioSchema, CheckSlugSchema } from "@/lib/validations/onboarding";
import { holdBookingSlot, getTenantBookingSlots } from "@/lib/actions/booking";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

interface TestResult {
  suite: string;
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
  error?: string;
  critical?: boolean;
}

const results: TestResult[] = [];

function recordPass(suite: string, name: string, details?: string) {
  results.push({ suite, test: name, status: "PASS", details });
  console.log(`  ✓ PASS [${suite}]: ${name}${details ? ` — ${details}` : ""}`);
}

function recordFail(
  suite: string,
  name: string,
  error?: string,
  details?: string,
  critical: boolean = false
) {
  const errStr = error || name;
  results.push({ suite, test: name, status: "FAIL", error: errStr, details, critical });
  console.error(`  ❌ FAIL [${suite}]: ${name} — ${errStr}${details ? ` (${details})` : ""}${critical ? " [CRITICAL]" : ""}`);
}

export async function runChallengerM2Suite() {
  console.log("===============================================================================");
  console.log("  CineFlow OS Milestone 2: Adversarial Empirical Challenger Verification Suite ");
  console.log("===============================================================================\n");

  // ==============================================================================
  // SUITE 1: Reserved Platform Slugs Enforcement & Bypass Challenge
  // ==============================================================================
  console.log("▶ SUITE 1: Reserved Slugs Enforcement & Server-Side Bypass Challenge");
  const reservedSlugs = [
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
  ];

  // 1.1 Check checkSlugAvailability rejects all reserved slugs
  for (const slug of reservedSlugs) {
    const res = await checkSlugAvailability(slug);
    if (res.available === false) {
      const detail = res.error?.includes("reserved") ? "reserved check" : "regex rejection";
      recordPass("Reserved Slugs", `checkSlugAvailability rejects '${slug}' (${detail})`, res.error);
    } else {
      recordFail("Reserved Slugs", `checkSlugAvailability failed to reject reserved slug '${slug}'`, JSON.stringify(res), undefined, true);
    }
  }

  // 1.2 Adversarial Challenge: Does OnboardStudioSchema reject reserved slugs?
  // Schema-level validation should reject reserved slugs before database invocation
  for (const slug of ["super-admin", "admin", "api", "create-studio"]) {
    const parseRes = OnboardStudioSchema.safeParse({
      name: "Exploit Studio",
      slug,
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Attacker",
      ownerEmail: `attacker_${slug}@exploit.com`,
      password: "Password123!",
      subscriptionTier: "PRO",
    });

    if (!parseRes.success) {
      recordPass("Reserved Slugs Schema", `OnboardStudioSchema rejects reserved slug '${slug}'`);
    } else {
      recordFail(
        "Reserved Slugs Schema",
        `OnboardStudioSchema accepts reserved slug '${slug}'`,
        "Zod schema lacks reserved slug refinement. Allowed adversary to pass schema check.",
        undefined,
        true
      );
    }
  }

  // 1.3 Adversarial Challenge: Server Action Execution with Reserved Slug
  // Can an attacker bypass the UI and execute onboardStudio with slug 'super-admin'?
  const exploitEmail = `exploit_superadmin_${Date.now()}@challenger.test`;
  const exploitResult = await onboardStudio({
    name: "Super Admin Hijack Studio",
    slug: "super-admin",
    discipline: "HYBRID",
    currency: "USD",
    ownerName: "Adversary",
    ownerEmail: exploitEmail,
    password: "Password123!",
    subscriptionTier: "PRO",
  });

  // Check if tenant was actually created in dev.db
  const leakedTenant = await db.tenant.findUnique({ where: { slug: "super-admin" } });
  if (leakedTenant) {
    recordFail(
      "Reserved Slugs Server Action",
      "onboardStudio created tenant with reserved slug 'super-admin'",
      `Tenant created with ID: ${leakedTenant.id}. Server action has no server-side check for reserved slugs!`,
      undefined,
      true
    );
    // Cleanup exploit tenant immediately to keep database clean
    await db.user.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.campaignCategory.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.printSize.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.frameDesign.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.proposalAddOnTemplate.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.servicePackage.deleteMany({ where: { tenantId: leakedTenant.id } });
    await db.tenant.delete({ where: { id: leakedTenant.id } });
    console.log("    ↳ Cleaned up exploit tenant 'super-admin' from dev.db");
  } else if (!exploitResult.success) {
    recordPass("Reserved Slugs Server Action", "onboardStudio rejects reserved slug 'super-admin'");
  } else {
    recordFail("Reserved Slugs Server Action", "onboardStudio reported success but no tenant found", JSON.stringify(exploitResult));
  }

  // ==============================================================================
  // SUITE 2: Duplicate Slug & Duplicate Email Collision Resistance
  // ==============================================================================
  console.log("\n▶ SUITE 2: Duplicate Slug & Email Collisions");

  // 2.1 Existing tenant slug rejection via checkSlugAvailability
  const dupeLuminaCheck = await checkSlugAvailability("lumina-cine");
  if (!dupeLuminaCheck.available) {
    recordPass("Duplicate Collisions", "checkSlugAvailability marks existing slug 'lumina-cine' as unavailable");
  } else {
    recordFail("Duplicate Collisions", "checkSlugAvailability marked existing slug 'lumina-cine' as available", JSON.stringify(dupeLuminaCheck));
  }

  // 2.2 Attempt to register existing slug 'apex-media' via onboardStudio
  const dupeApexOnboard = await onboardStudio({
    name: "Apex Impersonator",
    slug: "apex-media",
    discipline: "PHOTOGRAPHY",
    currency: "MYR",
    ownerName: "Impersonator",
    ownerEmail: `impersonator_${Date.now()}@test.com`,
    password: "Password123!",
    subscriptionTier: "STARTER",
  });
  if (!dupeApexOnboard.success && dupeApexOnboard.error?.includes("already taken")) {
    recordPass("Duplicate Collisions", "onboardStudio rejects collision on taken slug 'apex-media'", dupeApexOnboard.error);
  } else {
    recordFail("Duplicate Collisions", "onboardStudio did not reject collision on 'apex-media'", JSON.stringify(dupeApexOnboard), undefined, true);
  }

  // 2.3 Attempt to register existing email 'alex@luminacine.com'
  const dupeEmailOnboard = await onboardStudio({
    name: "Email Collision Studio",
    slug: `unique-slug-${Date.now()}`,
    discipline: "HYBRID",
    currency: "USD",
    ownerName: "Duplicate Alex",
    ownerEmail: "alex@luminacine.com",
    password: "Password123!",
    subscriptionTier: "PRO",
  });
  if (!dupeEmailOnboard.success && dupeEmailOnboard.error?.includes("already exists")) {
    recordPass("Duplicate Collisions", "onboardStudio rejects existing owner email 'alex@luminacine.com'", dupeEmailOnboard.error);
  } else {
    recordFail("Duplicate Collisions", "onboardStudio allowed duplicate owner email", JSON.stringify(dupeEmailOnboard), undefined, true);
  }

  // ==============================================================================
  // SUITE 3: Special Characters, Sanitization, Injection & Boundaries
  // ==============================================================================
  console.log("\n▶ SUITE 3: Slug Sanitization, Injection & Boundaries");

  const adversarialInputs = [
    { label: "Spaces in slug", slug: "lumina cine works" },
    { label: "Uppercase letters", slug: "LUMINA-CINE" },
    { label: "Path traversal", slug: "../etc/passwd" },
    { label: "Special symbol @", slug: "lumina@cine" },
    { label: "Special symbol dot", slug: "lumina.cine" },
    { label: "Special symbol slash", slug: "lumina/cine" },
    { label: "XSS payload", slug: "<script>alert(1)</script>" },
    { label: "SQL Injection payload", slug: "' OR '1'='1" },
    { label: "Too short (< 3 chars)", slug: "ab" },
    { label: "Too long (> 50 chars)", slug: "a".repeat(51) },
  ];

  for (const input of adversarialInputs) {
    const checkRes = await checkSlugAvailability(input.slug);
    const onboardRes = await onboardStudio({
      name: "Adversarial Studio",
      slug: input.slug,
      discipline: "HYBRID",
      currency: "USD",
      ownerName: "Tester",
      ownerEmail: `tester_${Date.now()}@adversary.com`,
      password: "Password123!",
      subscriptionTier: "PRO",
    });

    if (checkRes.available === false && onboardRes.success === false) {
      recordPass("Adversarial Inputs", `Rejected ${input.label} ('${input.slug.slice(0, 20)}...')`);
    } else {
      recordFail(
        "Adversarial Inputs",
        `Failed to reject ${input.label} ('${input.slug}')`,
        `check: ${checkRes.available}, onboard: ${onboardRes.success}`
      );
    }
  }

  // 3.7 Frontend Auto-Slugify Oracle Test
  // Frontend uses: val.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const sanitizeOracle = (val: string) =>
    val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const oracleTestCases = [
    { input: "Apex & Media! (Studio #1)", expected: "apex-media-studio-1" },
    { input: "   ---Leading & Trailing---   ", expected: "leading-trailing" },
    { input: "Lumina CineWorks 2026", expected: "lumina-cineworks-2026" },
    { input: "Special / Char @ Test %%% Done", expected: "special-char-test-done" },
  ];

  for (const tc of oracleTestCases) {
    const output = sanitizeOracle(tc.input);
    if (output === tc.expected) {
      recordPass("Slugify Oracle", `Sanitized '${tc.input}' -> '${output}'`);
    } else {
      recordFail("Slugify Oracle", `Expected '${tc.expected}' but got '${output}' for input '${tc.input}'`);
    }
  }

  // 3.8 Server-side boundary anomaly: Hyphen-only or leading/trailing hyphens
  const hyphenSlug = "---";
  const checkHyphen = await checkSlugAvailability(hyphenSlug);
  if (checkHyphen.available === true) {
    recordFail(
      "Boundary Flaw",
      "Hyphen-only slug '---' accepted by CheckSlugSchema",
      "Regex /^[a-z0-9-]+$/ allows strings with only hyphens or leading/trailing hyphens. Server schema should enforce non-hyphen start/end."
    );
  } else {
    recordPass("Boundary Flaw", "Hyphen-only slug '---' rejected");
  }

  // ==============================================================================
  // SUITE 4: Full Atomic Transaction Rollback Verification
  // ==============================================================================
  console.log("\n▶ SUITE 4: Transaction Atomicity & Rollback Verification");

  const rollbackSlug = `rollback-test-${Date.now().toString(36)}`;
  const rollbackEmail = `rollback_${Date.now()}@transact.test`;
  let rollbackErrorCaught = false;

  try {
    await db.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: "Rollback Incomplete Studio",
          slug: rollbackSlug,
          discipline: "HYBRID",
          currency: "USD",
          subscriptionTier: "PRO",
          subscriptionStatus: "ACTIVE",
        },
      });

      // 2. Create Owner User
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: "Rollback Owner",
          email: rollbackEmail,
          role: "STUDIO_OWNER",
          passwordHash: await bcrypt.hash("SimulatedSecret123", 10),
        },
      });

      // 3. Create Categories
      await tx.campaignCategory.createMany({
        data: [
          { tenantId: tenant.id, name: "Cat 1", slug: "cat-1", sortOrder: 1, isActive: true },
          { tenantId: tenant.id, name: "Cat 2", slug: "cat-2", sortOrder: 2, isActive: true },
        ],
      });

      // 4. Create Print Sizes
      await tx.printSize.create({
        data: { tenantId: tenant.id, code: "8R", name: "8R", widthInches: 8, heightInches: 10, basePrice: 100 },
      });

      // 5. Simulate catastrophic failure before package creation
      throw new Error("SIMULATED_ATOMIC_FAILURE_BEFORE_COMMIT");
    });
  } catch (err: any) {
    if (err.message === "SIMULATED_ATOMIC_FAILURE_BEFORE_COMMIT") {
      rollbackErrorCaught = true;
    }
  }

  if (rollbackErrorCaught) {
    recordPass("Transaction Rollback", "Simulated mid-transaction failure caught cleanly");
  } else {
    recordFail("Transaction Rollback", "Simulated failure was not caught");
  }

  // Empirically verify that ZERO orphan records remain in SQLite dev.db
  const orphanTenant = await db.tenant.findUnique({ where: { slug: rollbackSlug } });
  const orphanUser = await db.user.findUnique({ where: { email: rollbackEmail } });
  const orphanCats = await db.campaignCategory.findMany({ where: { slug: { in: ["cat-1", "cat-2"] } } });
  const orphanPrints = await db.printSize.findMany({ where: { name: "8R", basePrice: 100 } });

  if (orphanTenant === null) {
    recordPass("Transaction Rollback", "Zero orphan Tenant records found in dev.db");
  } else {
    recordFail("Transaction Rollback", "Found orphan Tenant record in dev.db", JSON.stringify(orphanTenant), undefined, true);
  }

  if (orphanUser === null) {
    recordPass("Transaction Rollback", "Zero orphan User records found in dev.db");
  } else {
    recordFail("Transaction Rollback", "Found orphan User record in dev.db", JSON.stringify(orphanUser), undefined, true);
  }

  if (orphanCats.length === 0) {
    recordPass("Transaction Rollback", "Zero orphan CampaignCategory records found in dev.db");
  } else {
    recordFail("Transaction Rollback", `Found ${orphanCats.length} orphan CampaignCategory records`, undefined, undefined, true);
  }

  // ==============================================================================
  // SUITE 5: Relational Completeness & Password Security Verification
  // ==============================================================================
  console.log("\n▶ SUITE 5: Relational Completeness & Password Security");

  const validTestSlug = `challenger-studio-${Date.now().toString(36)}`;
  const validTestEmail = `owner_${Date.now().toString(36)}@cinetest.io`;
  const rawPlaintextPassword = "AdversarialEmpiricalSecret999!";

  const validOnboard = await onboardStudio({
    name: "Challenger Verification Studio",
    slug: validTestSlug,
    discipline: "HYBRID",
    currency: "USD",
    tagline: "Empirical challenger verification studio",
    bio: "Validating multi-model integrity and bcrypt password protection.",
    brandColor: "#06b6d4",
    ownerName: "Empirical Lead",
    ownerEmail: validTestEmail,
    password: rawPlaintextPassword,
    ownerPhone: "+1 (555) 019-2831",
    subscriptionTier: "PRO",
  });

  if (validOnboard.success && validOnboard.slug === validTestSlug) {
    recordPass("Onboarding Integrity", `onboardStudio succeeded for valid tenant '${validTestSlug}'`);
  } else {
    recordFail("Onboarding Integrity", `onboardStudio failed for valid payload`, JSON.stringify(validOnboard));
  }

  // Query database with all relations
  const createdTenant = await db.tenant.findUnique({
    where: { slug: validTestSlug },
    include: {
      users: true,
      campaignCategories: true,
      printSizes: true,
      frameDesigns: true,
      proposalAddOnTemplates: true,
      servicePackages: true,
    },
  });

  if (createdTenant) {
    recordPass("Onboarding Integrity", "Tenant persisted to SQLite dev.db");

    // 5.1 Campaign categories count and presence
    const cats = createdTenant.campaignCategories;
    const catSlugs = new Set(cats.map((c) => c.slug));
    if (
      cats.length === 4 &&
      catSlugs.has("convocation") &&
      catSlugs.has("hari-raya") &&
      catSlugs.has("wedding") &&
      catSlugs.has("commercial")
    ) {
      recordPass("Onboarding Integrity", "Tenant seeded with exactly 4 standard categories (convocation, hari-raya, wedding, commercial)");
    } else {
      recordFail("Onboarding Integrity", `Expected 4 standard categories, got ${cats.length} (${Array.from(catSlugs).join(", ")})`);
    }

    // 5.2 Print sizes (at least 3)
    if (createdTenant.printSizes.length >= 3) {
      recordPass("Onboarding Integrity", `Tenant seeded with ${createdTenant.printSizes.length} print sizes (>= 3)`);
    } else {
      recordFail("Onboarding Integrity", `Insufficient print sizes: ${createdTenant.printSizes.length}`);
    }

    // 5.3 Frame designs (at least 3)
    if (createdTenant.frameDesigns.length >= 3) {
      recordPass("Onboarding Integrity", `Tenant seeded with ${createdTenant.frameDesigns.length} frame designs (>= 3)`);
    } else {
      recordFail("Onboarding Integrity", `Insufficient frame designs: ${createdTenant.frameDesigns.length}`);
    }

    // 5.4 Proposal add-on templates (at least 4)
    if (createdTenant.proposalAddOnTemplates.length >= 4) {
      recordPass("Onboarding Integrity", `Tenant seeded with ${createdTenant.proposalAddOnTemplates.length} proposal add-on templates (>= 4)`);
    } else {
      recordFail("Onboarding Integrity", `Insufficient proposal add-on templates: ${createdTenant.proposalAddOnTemplates.length}`);
    }

    // 5.5 Starter service package (at least 1)
    if (createdTenant.servicePackages.length >= 1) {
      recordPass("Onboarding Integrity", `Tenant seeded with starter service package: '${createdTenant.servicePackages[0]?.name}'`);
    } else {
      recordFail("Onboarding Integrity", "No starter service package created");
    }

    // 5.6 Password Security & Plaintext Leak Check
    const owner = createdTenant.users.find((u) => u.role === "STUDIO_OWNER");
    if (owner) {
      // Must not match plaintext
      if (owner.passwordHash !== rawPlaintextPassword) {
        recordPass("Password Security", "User passwordHash is not stored in plaintext");
      } else {
        recordFail("Password Security", "PLAINTEXT PASSWORD LEAK: owner.passwordHash matches raw password!", undefined, undefined, true);
      }

      // Must be a valid bcrypt hash format ($2a$ or $2b$)
      if (owner.passwordHash && (owner.passwordHash.startsWith("$2a$") || owner.passwordHash.startsWith("$2b$"))) {
        recordPass("Password Security", "Password hash starts with valid bcrypt prefix ($2a$/$2b$)");
      } else {
        recordFail("Password Security", `Password hash does not match bcrypt format: '${owner.passwordHash?.slice(0, 10)}'`);
      }

      // bcrypt verification
      const passwordMatches = owner.passwordHash ? await bcrypt.compare(rawPlaintextPassword, owner.passwordHash) : false;
      const wrongPasswordMatches = owner.passwordHash ? await bcrypt.compare("WrongPassword123!", owner.passwordHash) : false;

      if (passwordMatches && !wrongPasswordMatches) {
        recordPass("Password Security", "bcrypt.compare authenticates true password and rejects incorrect password");
      } else {
        recordFail("Password Security", "bcrypt validation failed for owner password hash");
      }

      // Check return payload of onboardStudio
      if (!JSON.stringify(validOnboard).includes(rawPlaintextPassword)) {
        recordPass("Password Security", "onboardStudio action return payload does not leak plaintext password");
      } else {
        recordFail("Password Security", "onboardStudio action return payload contains plaintext password!", undefined, undefined, true);
      }
    } else {
      recordFail("Onboarding Integrity", "No STUDIO_OWNER user found for tenant", undefined, undefined, true);
    }

    // Clean up test tenant
    await db.user.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.campaignCategory.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.printSize.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.frameDesign.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.proposalAddOnTemplate.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.servicePackage.deleteMany({ where: { tenantId: createdTenant.id } });
    await db.tenant.delete({ where: { id: createdTenant.id } });
    console.log("    ↳ Cleaned up valid test tenant from dev.db");
  } else {
    recordFail("Onboarding Integrity", "Failed to retrieve created tenant from dev.db", undefined, undefined, true);
  }

  // ==============================================================================
  // SUITE 6: Category Scoping & Multi-Tenant Showcase Isolation
  // ==============================================================================
  console.log("\n▶ SUITE 6: Category Scoping & Multi-Tenant Showcase Isolation");

  const luminaTenant = await db.tenant.findUnique({
    where: { slug: "lumina-cine" },
    include: { campaignCategories: true, servicePackages: true, showcaseItems: true },
  });
  const apexTenant = await db.tenant.findUnique({
    where: { slug: "apex-media" },
    include: { campaignCategories: true, servicePackages: true, showcaseItems: true },
  });

  if (!luminaTenant || !apexTenant) {
    recordFail("Multi-Tenant Isolation", "Flagship tenants 'lumina-cine' or 'apex-media' missing from dev.db", undefined, undefined, true);
  } else {
    const luminaCatSlugs = new Set(luminaTenant.campaignCategories.map((c) => c.slug));
    const apexCatSlugs = new Set(apexTenant.campaignCategories.map((c) => c.slug));

    // 6.1 Convocation & Hari Raya are exclusive to Apex
    if (apexCatSlugs.has("convocation") && apexCatSlugs.has("hari-raya")) {
      recordPass("Category Isolation", "Apex Photo & Motion has exclusive 'convocation' and 'hari-raya' categories");
    } else {
      recordFail("Category Isolation", "Apex missing 'convocation' or 'hari-raya' category");
    }

    if (!luminaCatSlugs.has("convocation") && !luminaCatSlugs.has("hari-raya")) {
      recordPass("Category Isolation", "Lumina CineWorks has ZERO 'convocation' or 'hari-raya' categories");
    } else {
      recordFail("Category Isolation", "CROSS-TENANT LEAK: Lumina CineWorks contains Apex categories!");
    }

    // 6.2 Weddings is exclusive to Lumina
    if (luminaCatSlugs.has("weddings")) {
      recordPass("Category Isolation", "Lumina CineWorks has 'weddings' category");
    } else {
      recordFail("Category Isolation", "Lumina missing 'weddings' category");
    }

    if (!apexCatSlugs.has("weddings")) {
      recordPass("Category Isolation", "Apex Photo & Motion has ZERO 'weddings' categories");
    } else {
      recordFail("Category Isolation", "CROSS-TENANT LEAK: Apex Photo & Motion contains Lumina 'weddings' category!");
    }

    // 6.3 Query Scoping Guarantee
    const luminaScopedCats = await db.campaignCategory.findMany({
      where: { tenantId: luminaTenant.id, isActive: true },
    });
    const apexScopedCats = await db.campaignCategory.findMany({
      where: { tenantId: apexTenant.id, isActive: true },
    });

    const crossContamination1 = luminaScopedCats.some((c) => c.tenantId !== luminaTenant.id);
    const crossContamination2 = apexScopedCats.some((c) => c.tenantId !== apexTenant.id);

    if (!crossContamination1 && !crossContamination2) {
      recordPass("Query Scoping", "Strict { where: { tenantId } } query returns zero cross-tenant category records");
    } else {
      recordFail("Query Scoping", "CROSS-CONTAMINATION: Query returned entities belonging to other tenants!");
    }

    // 6.4 Cross-Tenant Booking Slot Protection
    const luminaSlot = await db.bookingSlot.findFirst({ where: { tenantId: luminaTenant.id } });
    if (luminaSlot) {
      // Attempt to hold Lumina's slot using Apex's tenant ID
      const spoofHold = await holdBookingSlot({
        tenantId: apexTenant.id, // spoofed tenantId!
        slotId: luminaSlot.id,
        sessionId: "attacker-spoofed-session",
      });

      if (!spoofHold.success) {
        recordPass("Slot Multi-Tenant Guard", "holdBookingSlot rejects cross-tenant slot hold attempt (Apex cannot hold Lumina slot)");
      } else {
        recordFail("Slot Multi-Tenant Guard", "CROSS-TENANT EXPLOIT: Apex tenantId was allowed to hold Lumina slot!", undefined, undefined, true);
      }
    }
  }

  // ==============================================================================
  // SUITE 7: Non-Existent & Inactive Tenant Handling
  // ==============================================================================
  console.log("\n▶ SUITE 7: Non-Existent Tenant Handling");

  const nonExistentSlug = "non-existent-studio-404-xyz";
  const nonExistentTenant = await db.tenant.findUnique({
    where: { slug: nonExistentSlug },
  });

  if (nonExistentTenant === null) {
    recordPass("404 Handling", `db.tenant.findUnique returns null for non-existent slug '${nonExistentSlug}'`);
  } else {
    recordFail("404 Handling", "Expected null for non-existent tenant slug");
  }

  const slotResult = await getTenantBookingSlots({ tenantSlug: nonExistentSlug });
  if (!slotResult.success && slotResult.error?.includes("Tenant not found") && slotResult.slots.length === 0) {
    recordPass("404 Handling", "getTenantBookingSlots returns error and empty array for non-existent slug");
  } else {
    recordFail("404 Handling", "getTenantBookingSlots did not return expected error for non-existent tenant", JSON.stringify(slotResult));
  }

  // ==============================================================================
  // SUITE 8: Middleware Custom Domain & Host Routing
  // ==============================================================================
  console.log("\n▶ SUITE 8: Middleware Custom Domain & Host Routing");

  // 8.1 Simulated Custom Domain Header
  const reqLuminaCustom = new NextRequest("http://localhost:3000/book", {
    headers: { "x-custom-domain": "studio.luminacine.com" },
  });
  const resLuminaCustom = middleware(reqLuminaCustom);
  if (
    resLuminaCustom.headers.get("x-tenant-slug") === "lumina-cine" &&
    resLuminaCustom.headers.get("x-is-custom-domain") === "true"
  ) {
    recordPass("Middleware", "Simulated domain 'studio.luminacine.com' resolves to 'lumina-cine'");
  } else {
    recordFail("Middleware", "Failed to resolve 'studio.luminacine.com'", `Header: ${resLuminaCustom.headers.get("x-tenant-slug")}`);
  }

  // 8.2 Host Header Resolution (Edge runtime simulation)
  const reqApexHost = new NextRequest("http://studio.apexfilms.com/", {
    headers: { host: "studio.apexfilms.com" },
  });
  const resApexHost = middleware(reqApexHost);
  if (resApexHost.headers.get("x-tenant-slug") === "apex-media") {
    recordPass("Middleware", "Direct host 'studio.apexfilms.com' resolves to 'apex-media'");
  } else {
    recordFail("Middleware", "Failed to resolve host 'studio.apexfilms.com'");
  }

  // 8.3 Subdomain pattern (<slug>.cineflow.app)
  const reqSubdomain = new NextRequest("http://lumina-cine.cineflow.app/book", {
    headers: { host: "lumina-cine.cineflow.app" },
  });
  const resSubdomain = middleware(reqSubdomain);
  if (resSubdomain.headers.get("x-tenant-slug") === "lumina-cine") {
    recordPass("Middleware", "Subdomain 'lumina-cine.cineflow.app' resolves to 'lumina-cine'");
  } else {
    recordFail("Middleware", "Failed to resolve subdomain 'lumina-cine.cineflow.app'");
  }

  // 8.4 Platform Host Passthrough (no tenant rewrite)
  const platformHosts = ["localhost:3000", "cineflow.app", "www.cineflow.app", "app.cineflow.app"];
  for (const host of platformHosts) {
    const reqPlatform = new NextRequest(`http://${host}/create-studio`, {
      headers: { host },
    });
    const resPlatform = middleware(reqPlatform);
    if (resPlatform.headers.get("x-tenant-slug") === null) {
      recordPass("Middleware", `Platform host '${host}' passes through without tenant rewrite`);
    } else {
      recordFail("Middleware", `Platform host '${host}' erroneously resolved tenant: ${resPlatform.headers.get("x-tenant-slug")}`);
    }
  }

  // 8.5 Static / Internal Path Bypass
  const bypassPaths = ["/_next/static/chunks/main.js", "/api/upload", "/uploads/test.png", "/favicon.ico"];
  for (const path of bypassPaths) {
    const reqBypass = new NextRequest(`http://studio.luminacine.com${path}`, {
      headers: { "x-custom-domain": "studio.luminacine.com" },
    });
    const resBypass = middleware(reqBypass);
    if (resBypass.headers.get("x-tenant-slug") === null) {
      recordPass("Middleware", `Bypass path '${path}' passes through without tenant rewrite`);
    } else {
      recordFail("Middleware", `Bypass path '${path}' was rewritten with tenant header`);
    }
  }

  // ==============================================================================
  // SUMMARY & METRICS
  // ==============================================================================
  console.log("\n===============================================================================");
  console.log("  Empirical Challenger Test Suite Results");
  console.log("===============================================================================");

  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const criticalFails = results.filter((r) => r.critical).length;

  console.log(`Total Assertions : ${total}`);
  console.log(`Passed           : ${passed}`);
  console.log(`Failed           : ${failed}`);
  console.log(`Critical Failures: ${criticalFails}\n`);

  if (criticalFails > 0) {
    console.error("❌ CRITICAL DEFECTS DETECTED:");
    for (const f of results.filter((r) => r.critical)) {
      console.error(`  - [${f.suite}] ${f.test}: ${f.error}`);
    }
    console.error("\nRECOMMENDED VERDICT: REQUEST_CHANGES");
  } else if (failed > 0) {
    console.warn("⚠️ NON-CRITICAL FINDINGS DETECTED:");
    for (const f of results.filter((r) => r.status === "FAIL")) {
      console.warn(`  - [${f.suite}] ${f.test}: ${f.error}`);
    }
    console.warn("\nRECOMMENDED VERDICT: REQUEST_CHANGES");
  } else {
    console.log("✓ ALL EMPIRICAL CHALLENGES PASSED.");
    console.log("RECOMMENDED VERDICT: APPROVE");
  }

  return { total, passed, failed, criticalFails, results };
}

runChallengerM2Suite()
  .then((res) => {
    if (res.criticalFails > 0) {
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error("Test runner threw unhandled error:", err);
    process.exitCode = 2;
  });

