/**
 * Tier 1: Module 1 — Framework, Tooling, Database & Local Storage
 * Covers Features 1–5 (25 distinct tests, 5 per feature)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { POST as uploadHandler } from "@/app/api/upload/route";
import { TestHarness } from "../test-harness";

export async function runFrameworkStorageTests(harness: TestHarness) {
  harness.setSuite("Tier 1", "Module 1: Framework, Tooling, Database & Storage (Features 1-5)");

  const rootDir = process.cwd();

  // ============================================================================
  // Feature 1: Framework & Tooling Scaffolding (5 Tests)
  // ============================================================================
  await harness.test("T1-F01-01: package.json specifies Next.js 15, React 19, TypeScript, and Prisma", async () => {
    const pkgContent = await fs.readFile(path.join(rootDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgContent);
    harness.assert(
      pkg.dependencies?.next?.includes("15.") || pkg.dependencies?.next?.startsWith("^15"),
      "Next.js version is 15.x",
      `Actual: ${pkg.dependencies?.next}`
    );
    harness.assert(
      pkg.dependencies?.react?.includes("19.") || pkg.dependencies?.react?.startsWith("^19"),
      "React version is 19.x",
      `Actual: ${pkg.dependencies?.react}`
    );
    harness.assert(
      pkg.devDependencies?.typescript?.includes("5.") || pkg.devDependencies?.typescript?.startsWith("^5"),
      "TypeScript version is 5.x",
      `Actual: ${pkg.devDependencies?.typescript}`
    );
    harness.assert(
      pkg.dependencies?.["@prisma/client"]?.includes("6.") || pkg.dependencies?.["@prisma/client"]?.startsWith("^6"),
      "Prisma client version is 6.x",
      `Actual: ${pkg.dependencies?.["@prisma/client"]}`
    );
  });

  await harness.test("T1-F01-02: Tailwind CSS v4 and PostCSS configuration files exist", async () => {
    const postcssPath = path.join(rootDir, "postcss.config.mjs");
    const globalsCssPath = path.join(rootDir, "app", "globals.css");
    const postcssStat = await fs.stat(postcssPath).catch(() => null);
    const cssStat = await fs.stat(globalsCssPath).catch(() => null);
    harness.assert(postcssStat !== null, "postcss.config.mjs exists on disk");
    harness.assert(cssStat !== null, "app/globals.css exists on disk");
    if (cssStat) {
      const css = await fs.readFile(globalsCssPath, "utf-8");
      harness.assert(css.includes("@import \"tailwindcss\"") || css.includes("@import 'tailwindcss'") || css.includes("tailwindcss"), "globals.css imports tailwindcss");
    }
  });

  await harness.test("T1-F01-03: lib/env.ts validates environment variables and enforces required secrets", async () => {
    const { env } = await import("@/lib/env");
    harness.assert(typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0, "env.DATABASE_URL is defined");
    harness.assert(env.DATABASE_URL.includes("dev.db"), "env.DATABASE_URL points to dev.db");
    harness.assert(typeof env.AUTH_SECRET === "string" && env.AUTH_SECRET.length >= 32, "env.AUTH_SECRET meets minimum 32-character requirement");
  });

  await harness.test("T1-F01-04: tsconfig.json enforces strict mode and resolves module path aliases", async () => {
    const tsconfigRaw = await fs.readFile(path.join(rootDir, "tsconfig.json"), "utf-8");
    const tsconfig = JSON.parse(tsconfigRaw);
    harness.assert(tsconfig.compilerOptions?.strict === true, "tsconfig compilerOptions.strict is true");
    harness.assert(Boolean(tsconfig.compilerOptions?.paths?.["@/*"]), "tsconfig resolves @/* path alias");
  });

  await harness.test("T1-F01-05: shadcn/ui primitives and styling utilities are installed and loadable", async () => {
    const clsx = await import("clsx");
    const twMerge = await import("tailwind-merge");
    const cva = await import("class-variance-authority");
    const lucide = await import("lucide-react");
    harness.assert(typeof clsx.clsx === "function", "clsx utility is loadable");
    harness.assert(typeof twMerge.twMerge === "function", "tailwind-merge utility is loadable");
    harness.assert(typeof cva.cva === "function", "class-variance-authority cva is loadable");
    harness.assert(typeof lucide.Camera === "object" || typeof lucide.Camera === "function", "lucide-react icons are loadable");
  });

  // ============================================================================
  // Feature 2: Complete 24-Model Prisma Schema (5 Tests)
  // ============================================================================
  await harness.test("T1-F02-01: Prisma Client instantiates all 24 canonical models", async () => {
    const models = [
      "tenant", "campaignCategory", "proposalAddOnTemplate", "bookingSlot",
      "frameDesign", "printSize", "user", "proposal", "proposalAddOn",
      "milestoneInvoice", "project", "callSheet", "shotItem", "digitalRelease",
      "clientDeliverable", "deliverableItem", "inventoryItem", "kitBundle",
      "kitBundleItem", "equipmentReservation", "inspectionLog", "clientBooking",
      "servicePackage", "showcaseItem"
    ];
    for (const model of models) {
      harness.assert(
        typeof (db as any)[model]?.findMany === "function",
        `db.${model} is accessible as a Prisma model delegate`
      );
    }
  });

  await harness.test("T1-F02-02: Multi-tenant cascade delete automatically cleans linked child records", async () => {
    const testSlug = `e2e_cascade_ten_${Date.now()}`;
    const testTenant = await db.tenant.create({
      data: {
        name: "Cascade Test Studio",
        slug: testSlug,
        discipline: "HYBRID",
        currency: "USD",
      },
    });

    const category = await db.campaignCategory.create({
      data: {
        tenantId: testTenant.id,
        name: "Cascade Category",
        slug: "cascade-cat",
      },
    });

    const slot = await db.bookingSlot.create({
      data: {
        tenantId: testTenant.id,
        date: new Date(Date.now() + 86400000),
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        category: "COMMERCIAL",
        price: 200,
        depositRequired: 100,
        status: "AVAILABLE",
      },
    });

    // Delete tenant and verify children are cascaded
    await db.tenant.delete({ where: { id: testTenant.id } });

    const orphanedCategory = await db.campaignCategory.findUnique({ where: { id: category.id } });
    const orphanedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });

    harness.assert(orphanedCategory === null, "Linked CampaignCategory was cascade-deleted with Tenant");
    harness.assert(orphanedSlot === null, "Linked BookingSlot was cascade-deleted with Tenant");
  });

  await harness.test("T1-F02-03: Global unique constraints enforce duplicate rejection on Tenant.slug and User.email", async () => {
    const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    harness.assert(lumina !== null, "Seed tenant lumina-cine exists");

    await harness.assertRejects(
      () =>
        db.tenant.create({
          data: {
            name: "Lumina Clone",
            slug: "lumina-cine",
            discipline: "HYBRID",
            currency: "USD",
          },
        }),
      "Unique constraint failed",
      "Duplicate Tenant.slug rejected by database unique constraint"
    );

    const superAdmin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
    harness.assert(superAdmin !== null, "Super admin user exists");

    await harness.assertRejects(
      () =>
        db.user.create({
          data: {
            tenantId: lumina!.id,
            email: superAdmin!.email,
            name: "Fake Admin",
            role: "STAFF",
            passwordHash: "hash",
          },
        }),
      "Unique constraint failed",
      "Duplicate User.email rejected by database unique constraint"
    );
  });

  await harness.test("T1-F02-04: Compound unique indexes reject duplicates within the same parent", async () => {
    const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    harness.assert(lumina !== null, "Lumina tenant exists");

    // CampaignCategory(tenantId, slug)
    const existingCat = await db.campaignCategory.findFirst({ where: { tenantId: lumina!.id } });
    harness.assert(existingCat !== null, "Lumina has a campaign category");

    await harness.assertRejects(
      () =>
        db.campaignCategory.create({
          data: {
            tenantId: lumina!.id,
            name: "Duplicate Category",
            slug: existingCat!.slug,
          },
        }),
      "Unique constraint failed",
      "Compound unique CampaignCategory(tenantId, slug) rejects duplicate slug within same tenant"
    );

    // PrintSize(tenantId, code)
    const existingSize = await db.printSize.findFirst({ where: { tenantId: lumina!.id } });
    harness.assert(existingSize !== null, "Lumina has a print size");

    await harness.assertRejects(
      () =>
        db.printSize.create({
          data: {
            tenantId: lumina!.id,
            name: "Duplicate 8R",
            code: existingSize!.code,
            widthInches: 8,
            heightInches: 10,
            basePrice: 50,
          },
        }),
      "Unique constraint failed",
      "Compound unique PrintSize(tenantId, code) rejects duplicate code within same tenant"
    );
  });

  await harness.test("T1-F02-05: Relational foreign key navigation traverses parent-child relations cleanly", async () => {
    const projectWithRelations = await db.project.findFirst({
      where: { callSheets: { some: {} } },
      include: {
        callSheets: true,
        shotItems: true,
        tenant: true,
        invoices: true,
      },
    });

    harness.assert(projectWithRelations !== null, "Project with call sheets and shots found");
    if (projectWithRelations) {
      harness.assert(typeof projectWithRelations.tenant.name === "string", "Project navigated to parent Tenant");
      harness.assert(projectWithRelations.callSheets.length > 0, "Project navigated to CallSheet children");
      harness.assert(projectWithRelations.shotItems.length > 0, "Project navigated to ShotItem children");
    }

    const bundleWithItems = await db.kitBundle.findFirst({
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });
    harness.assert(bundleWithItems !== null, "KitBundle with items found");
    if (bundleWithItems && bundleWithItems.items.length > 0) {
      harness.assert(Boolean(bundleWithItems.items[0]!.item?.sku), "KitBundleItem navigated to InventoryItem SKU");
    }
  });

  // ============================================================================
  // Feature 3: SQLite Migration & Database Engine (5 Tests)
  // ============================================================================
  await harness.test("T1-F03-01: SQLite dev.db database file exists and has non-zero size", async () => {
    const dbPath = path.join(rootDir, "prisma", "dev.db");
    const stat = await fs.stat(dbPath).catch(() => null);
    harness.assert(stat !== null, "prisma/dev.db file exists");
    harness.assert(stat !== null && stat.size > 1024, "dev.db file size is > 1KB", `Actual size: ${stat?.size} bytes`);
  });

  await harness.test("T1-F03-02: SQLite pragma foreign_keys is enabled (ON)", async () => {
    const result = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>("PRAGMA foreign_keys;");
    const fkVal = result.length > 0 ? Number(result[0]!.foreign_keys) : 0;
    harness.assert(
      fkVal === 1,
      "PRAGMA foreign_keys is 1 (ON)",
      `Actual: ${fkVal}`
    );
  });

  await harness.test("T1-F03-03: sqlite_master contains all 24 canonical model tables and indexes", async () => {
    const tables = await db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';"
    );
    const tableNames = new Set(tables.map((t) => t.name));
    const requiredTables = [
      "Tenant", "CampaignCategory", "ProposalAddOnTemplate", "BookingSlot",
      "FrameDesign", "PrintSize", "User", "Proposal", "ProposalAddOn",
      "MilestoneInvoice", "Project", "CallSheet", "ShotItem", "DigitalRelease",
      "ClientDeliverable", "DeliverableItem", "InventoryItem", "KitBundle",
      "KitBundleItem", "EquipmentReservation", "InspectionLog", "ClientBooking",
      "ServicePackage", "ShowcaseItem"
    ];

    for (const table of requiredTables) {
      harness.assert(tableNames.has(table), `Table '${table}' exists in sqlite_master schema`);
    }
  });

  await harness.test("T1-F03-04: Database transaction rollback leaves state pristine on error", async () => {
    const testSlug = `e2e_rollback_test_${Date.now()}`;
    let threw = false;

    try {
      await db.$transaction(async (tx) => {
        await tx.tenant.create({
          data: {
            name: "Rollback Studio",
            slug: testSlug,
            discipline: "HYBRID",
            currency: "USD",
          },
        });
        // Intentionally throw inside transaction
        throw new Error("FORCED_TRANSACTION_ABORT");
      });
    } catch (err: any) {
      if (err.message === "FORCED_TRANSACTION_ABORT") {
        threw = true;
      }
    }

    harness.assert(threw, "Transaction threw expected abort exception");
    const checkTenant = await db.tenant.findUnique({ where: { slug: testSlug } });
    harness.assert(checkTenant === null, "Tenant was not persisted due to clean transaction rollback");
  });

  await harness.test("T1-F03-05: Concurrent read queries execute without SQLITE_BUSY contention", async () => {
    const reads = Array.from({ length: 20 }, (_, i) =>
      db.tenant.findMany({
        take: 5,
        include: { campaignCategories: true, servicePackages: true },
      })
    );
    const results = await Promise.all(reads);
    harness.assert(results.length === 20, "Dispatched 20 concurrent read queries");
    harness.assert(results.every((r) => Array.isArray(r)), "All 20 concurrent reads succeeded without SQLite contention");
  });

  // ============================================================================
  // Feature 4: Rich Multi-Tenant Seed Script (5 Tests)
  // ============================================================================
  await harness.test("T1-F04-01: Flagship Studio 1 (lumina-cine, HYBRID, USD) exists with linked models", async () => {
    const lumina = await db.tenant.findUnique({
      where: { slug: "lumina-cine" },
      include: {
        campaignCategories: true,
        servicePackages: true,
        bookingSlots: true,
        proposals: true,
        projects: true,
      },
    });

    harness.assert(lumina !== null, "Studio lumina-cine exists");
    harness.assert(lumina?.discipline === "HYBRID", "Lumina discipline is HYBRID");
    harness.assert(lumina?.currency === "USD", "Lumina currency is USD");
    harness.assert((lumina?.campaignCategories.length ?? 0) >= 2, "Lumina has linked categories");
    harness.assert((lumina?.servicePackages.length ?? 0) >= 1, "Lumina has linked packages");
    harness.assert((lumina?.bookingSlots.length ?? 0) >= 1, "Lumina has linked slots");
  });

  await harness.test("T1-F04-02: Flagship Studio 2 (apex-media, PHOTOGRAPHY, MYR) exists with linked models", async () => {
    const apex = await db.tenant.findUnique({
      where: { slug: "apex-media" },
      include: {
        campaignCategories: true,
        servicePackages: true,
        bookingSlots: true,
        proposals: true,
        projects: true,
      },
    });

    harness.assert(apex !== null, "Studio apex-media exists");
    harness.assert(apex?.discipline === "PHOTOGRAPHY", "Apex discipline is PHOTOGRAPHY");
    harness.assert(apex?.currency === "MYR", "Apex currency is MYR");
    harness.assert((apex?.campaignCategories.length ?? 0) >= 2, "Apex has linked categories");
    harness.assert((apex?.servicePackages.length ?? 0) >= 1, "Apex has linked packages");
  });

  await harness.test("T1-F04-03: Global Super Admin user exists with role SUPER_ADMIN", async () => {
    const superAdmin = await db.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    harness.assert(superAdmin !== null, "Super admin user exists");
    harness.assert(superAdmin?.email === "superadmin@cineflow.app", "Super admin email is superadmin@cineflow.app");
    harness.assert(typeof superAdmin?.passwordHash === "string" && superAdmin.passwordHash.length > 20, "Super admin has hashed password");
  });

  await harness.test("T1-F04-04: Non-zero records exist across all 24 models in baseline seed state", async () => {
    const models = [
      "tenant", "campaignCategory", "proposalAddOnTemplate", "bookingSlot",
      "frameDesign", "printSize", "user", "proposal", "proposalAddOn",
      "milestoneInvoice", "project", "callSheet", "shotItem", "digitalRelease",
      "clientDeliverable", "deliverableItem", "inventoryItem", "kitBundle",
      "kitBundleItem", "equipmentReservation", "inspectionLog", "clientBooking",
      "servicePackage", "showcaseItem"
    ];

    for (const model of models) {
      const count = await (db as any)[model].count();
      harness.assert(count > 0, `Model '${model}' has ${count} records (non-zero)`);
    }
  });

  await harness.test("T1-F04-05: Seed script stability: existing records maintain key integrity", async () => {
    const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
    const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
    harness.assert(lumina?.id === "ten_lumina", "Lumina maintains deterministic primary key ten_lumina");
    harness.assert(apex?.id === "ten_apex", "Apex maintains deterministic primary key ten_apex");
    const luminaProject = await db.project.findFirst({ where: { tenantId: "ten_lumina" } });
    harness.assert(luminaProject !== null, "Lumina project exists with foreign key linked to ten_lumina");
  });

  // ============================================================================
  // Feature 5: Local Media Storage Infrastructure (5 Tests)
  // ============================================================================
  await harness.test("T1-F05-01: Local upload storage directories exist on disk", async () => {
    const uploadRoot = path.join(rootDir, "public", "uploads");
    const folders = ["logos", "qrcodes", "receipts", "deliverables", "frames", "showcase", "signatures", "general"];

    for (const folder of folders) {
      const folderPath = path.join(uploadRoot, folder);
      const stat = await fs.stat(folderPath).catch(() => null);
      harness.assert(stat !== null && stat.isDirectory(), `Storage directory public/uploads/${folder} exists`);
    }
  });

  await harness.test("T1-F05-02: POST /api/upload accepts valid image/jpeg and returns HTTP 201 with public URL", async () => {
    const sampleBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]); // JPEG header
    const formData = new FormData();
    const file = new File([sampleBytes], "test_banner.jpg", { type: "image/jpeg" });
    formData.append("file", file);
    formData.append("folder", "general");

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req);
    harness.assert(res.status === 201, `Upload status is 201 Created (got ${res.status})`);
    const data = await res.json();
    harness.assert(data.success === true, "Upload response reports success: true");
    harness.assert(typeof data.url === "string" && data.url.startsWith("/uploads/general/"), `Upload returns valid URL: ${data.url}`);

    // Register cleanup
    if (data.url) {
      const filePath = path.join(rootDir, "public", data.url.replace(/^\//, ""));
      harness.registerTeardown(async () => {
        await fs.unlink(filePath).catch(() => null);
      });
    }
  });

  await harness.test("T1-F05-03: POST /api/upload rejects unauthorized MIME types with HTTP 400", async () => {
    const formData = new FormData();
    const file = new File(["echo 'hack'"], "script.sh", { type: "text/x-sh" });
    formData.append("file", file);
    formData.append("folder", "general");

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req);
    harness.assert(res.status === 400, `Upload rejected forbidden MIME type with 400 Bad Request (got ${res.status})`);
    const data = await res.json();
    harness.assert(data.error === "Unsupported file type", "Error reports 'Unsupported file type'");
  });

  await harness.test("T1-F05-04: POST /api/upload rejects request missing file payload with HTTP 400", async () => {
    const formData = new FormData();
    formData.append("folder", "general");

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req);
    harness.assert(res.status === 400, `Missing file returns 400 Bad Request (got ${res.status})`);
    const data = await res.json();
    harness.assert(data.error === "No file provided", "Error reports 'No file provided'");
  });

  await harness.test("T1-F05-05: Uploaded file is physically written to disk with matching byte length", async () => {
    const randomBytes = Buffer.from(`TEST_BINARY_DATA_${Date.now()}_${Math.random()}`);
    const formData = new FormData();
    const file = new File([randomBytes], "verify_write.png", { type: "image/png" });
    formData.append("file", file);
    formData.append("folder", "general");

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req);
    harness.assert(res.status === 201, "Upload succeeded with 201 Created");
    const data = await res.json();
    const writtenPath = path.join(rootDir, "public", data.url.replace(/^\//, ""));
    const diskStat = await fs.stat(writtenPath).catch(() => null);

    harness.assert(diskStat !== null, "File physically exists on disk");
    harness.assert(diskStat?.size === randomBytes.length, `File size on disk (${diskStat?.size}) matches uploaded byte length (${randomBytes.length})`);

    // Clean up
    await fs.unlink(writtenPath).catch(() => null);
  });
}
