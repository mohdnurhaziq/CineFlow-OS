import { db } from "@/lib/db";
import { POST as uploadHandler } from "@/app/api/upload/route";
import { NextRequest } from "next/server";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

interface ChallengeResult {
  suiteName: string;
  passed: boolean;
  assertionsPassed: number;
  failures: string[];
}

const modelKeys = [
  "tenant", "campaignCategory", "proposalAddOnTemplate", "bookingSlot",
  "frameDesign", "printSize", "user", "proposal", "proposalAddOn",
  "milestoneInvoice", "project", "callSheet", "shotItem", "digitalRelease",
  "clientDeliverable", "deliverableItem", "inventoryItem", "kitBundle",
  "kitBundleItem", "equipmentReservation", "inspectionLog", "clientBooking",
  "servicePackage", "showcaseItem"
] as const;

async function getModelCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const key of modelKeys) {
    // @ts-ignore
    counts[key] = await db[key].count();
  }
  return counts;
}

async function challengeSeedIdempotency(): Promise<ChallengeResult> {
  const result: ChallengeResult = {
    suiteName: "Seed Script Idempotency Challenge",
    passed: true,
    assertionsPassed: 0,
    failures: [],
  };

  function assert(condition: boolean, msg: string) {
    if (condition) {
      result.assertionsPassed++;
      console.log(`  ✓ ${msg}`);
    } else {
      result.passed = false;
      result.failures.push(msg);
      console.error(`  ❌ FAIL: ${msg}`);
    }
  }

  console.log("\n--- [CHALLENGE 1]: Repeated Back-to-Back Seed Runs (Idempotency) ---");

  try {
    // Run 1: Initial check
    console.log("  Running seed run #1...");
    execSync("npx tsx prisma/seed.ts", { stdio: "pipe" });
    const counts1 = await getModelCounts();
    assert(Object.keys(counts1).length === 24, "Run 1: All 24 models queried");

    // Run 2: Re-run seed
    console.log("  Running seed run #2 (immediate repeat)...");
    execSync("npx tsx prisma/seed.ts", { stdio: "pipe" });
    const counts2 = await getModelCounts();

    // Run 3: Third re-run seed
    console.log("  Running seed run #3 (consecutive repeat)...");
    execSync("npx tsx prisma/seed.ts", { stdio: "pipe" });
    const counts3 = await getModelCounts();

    // Verify all counts are identical across Run 1, 2, and 3
    for (const key of modelKeys) {
      const c1 = counts1[key] ?? 0;
      const c2 = counts2[key] ?? 0;
      const c3 = counts3[key] ?? 0;
      assert(c1 > 0, `Model '${key}' has > 0 rows (${c1})`);
      assert(c1 === c2 && c2 === c3, `Model '${key}' record count is strictly idempotent (Run 1: ${c1}, Run 2: ${c2}, Run 3: ${c3})`);
    }

    // Verify critical deterministic IDs persist across idempotent re-runs
    const lumina = await db.tenant.findUnique({ where: { id: "ten_lumina" } });
    const apex = await db.tenant.findUnique({ where: { id: "ten_apex" } });
    assert(lumina !== null && lumina.slug === "lumina-cine", "Lumina tenant ID ten_lumina intact");
    assert(apex !== null && apex.slug === "apex-media", "Apex tenant ID ten_apex intact");

    const projLumina = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
    const projApex = await db.project.findUnique({ where: { id: "proj_apex_01" } });
    assert(projLumina !== null && projLumina.tenantId === "ten_lumina", "Project proj_lumina_01 preserved");
    assert(projApex !== null && projApex.tenantId === "ten_apex", "Project proj_apex_01 preserved");
  } catch (err: any) {
    result.passed = false;
    result.failures.push(`Seed execution error: ${err.message}`);
    console.error(`  ❌ SEED RUNTIME EXCEPTION:`, err);
  }

  return result;
}

async function challengeMultiTenantIsolation(): Promise<ChallengeResult> {
  const result: ChallengeResult = {
    suiteName: "Multi-Tenant Isolation & Zero Leakage Challenge",
    passed: true,
    assertionsPassed: 0,
    failures: [],
  };

  function assert(condition: boolean, msg: string) {
    if (condition) {
      result.assertionsPassed++;
      console.log(`  ✓ ${msg}`);
    } else {
      result.passed = false;
      result.failures.push(msg);
      console.error(`  ❌ FAIL: ${msg}`);
    }
  }

  console.log("\n--- [CHALLENGE 2]: 100% Multi-Tenant Data Separation Verification ---");

  try {
    const tenants = await db.tenant.findMany();
    assert(tenants.length === 2, `Exactly 2 tenants exist (found: ${tenants.length})`);
    const tenantIds = new Set(tenants.map(t => t.id));
    assert(tenantIds.has("ten_lumina") && tenantIds.has("ten_apex"), "ten_lumina and ten_apex exist");

    // 1. Users
    const users = await db.user.findMany();
    for (const u of users) {
      if (u.role === "SUPER_ADMIN") {
        assert(u.tenantId === null, `SuperAdmin ${u.email} has tenantId null`);
      } else {
        assert(u.tenantId === "ten_lumina" || u.tenantId === "ten_apex", `User ${u.email} scoped to valid tenant (${u.tenantId})`);
      }
    }

    // 2. Campaign Categories
    const categories = await db.campaignCategory.findMany();
    for (const cat of categories) {
      assert(tenantIds.has(cat.tenantId), `CampaignCategory ${cat.name} (${cat.slug}) has valid tenantId ${cat.tenantId}`);
    }
    const luminaCatSlugs = new Set(categories.filter(c => c.tenantId === "ten_lumina").map(c => c.slug));
    const apexCatSlugs = new Set(categories.filter(c => c.tenantId === "ten_apex").map(c => c.slug));
    assert(luminaCatSlugs.has("weddings") && !apexCatSlugs.has("weddings"), "Weddings category exclusive to Lumina");
    assert(apexCatSlugs.has("convocation") && !luminaCatSlugs.has("convocation"), "Convocation category exclusive to Apex");
    assert(apexCatSlugs.has("hari-raya") && !luminaCatSlugs.has("hari-raya"), "Hari Raya category exclusive to Apex");

    // 3. Service Packages
    const packages = await db.servicePackage.findMany();
    for (const pkg of packages) {
      assert(tenantIds.has(pkg.tenantId), `Package ${pkg.name} has valid tenantId ${pkg.tenantId}`);
    }

    // 4. Showcase Items & Package References
    const showcaseItems = await db.showcaseItem.findMany({ include: { servicePackage: true } });
    for (const item of showcaseItems) {
      assert(tenantIds.has(item.tenantId), `ShowcaseItem ${item.title} has valid tenantId`);
      if (item.servicePackage) {
        assert(item.tenantId === item.servicePackage.tenantId, `ShowcaseItem ${item.title} matches linked servicePackage tenantId`);
      }
    }

    // 5. Booking Slots & Client Bookings
    const slots = await db.bookingSlot.findMany({ include: { booking: true } });
    for (const slot of slots) {
      assert(tenantIds.has(slot.tenantId), `Slot ${slot.id} has valid tenantId`);
      if (slot.booking) {
        assert(slot.tenantId === slot.booking.tenantId, `Booking slot ${slot.id} tenantId matches client booking tenantId`);
      }
    }

    const bookings = await db.clientBooking.findMany({ include: { user: true, slot: true } });
    for (const bk of bookings) {
      assert(tenantIds.has(bk.tenantId), `ClientBooking ${bk.trackingCode} has valid tenantId`);
      if (bk.user && bk.user.tenantId) {
        assert(bk.tenantId === bk.user.tenantId, `ClientBooking ${bk.trackingCode} tenantId matches user tenantId`);
      }
      if (bk.slot) {
        assert(bk.tenantId === bk.slot.tenantId, `ClientBooking ${bk.trackingCode} tenantId matches slot tenantId`);
      }
    }

    // 6. Proposals & AddOns
    const proposals = await db.proposal.findMany({ include: { client: true, studio: true, addOns: true } });
    for (const prop of proposals) {
      assert(tenantIds.has(prop.tenantId), `Proposal ${prop.proposalNumber} has valid tenantId`);
      assert(prop.tenantId === prop.client.tenantId, `Proposal ${prop.proposalNumber} tenant matches client user tenant`);
      assert(prop.tenantId === prop.studio.tenantId, `Proposal ${prop.proposalNumber} tenant matches studio user tenant`);
      for (const addon of prop.addOns) {
        // ProposalAddOn belongs to proposal which belongs to prop.tenantId
        assert(addon.proposalId === prop.id, `ProposalAddOn ${addon.name} correctly belongs to proposal ${prop.id}`);
      }
    }

    // 7. Projects & Deep Relations
    const projects = await db.project.findMany({
      include: {
        client: true,
        studioLead: true,
        proposal: true,
        callSheets: true,
        shotItems: true,
        digitalReleases: true,
        deliverables: { include: { items: true } },
        invoices: true,
        reservations: { include: { item: true, inspection: true } },
      },
    });

    for (const proj of projects) {
      assert(tenantIds.has(proj.tenantId), `Project ${proj.projectNumber} has valid tenantId`);
      assert(proj.tenantId === proj.client.tenantId, `Project ${proj.projectNumber} tenant matches client tenant`);
      assert(proj.tenantId === proj.studioLead.tenantId, `Project ${proj.projectNumber} tenant matches studioLead tenant`);
      if (proj.proposal) {
        assert(proj.tenantId === proj.proposal.tenantId, `Project ${proj.projectNumber} tenant matches proposal tenant`);
      }

      // Check invoices
      for (const inv of proj.invoices) {
        assert(inv.tenantId === proj.tenantId, `Project ${proj.projectNumber} invoice ${inv.invoiceNumber} tenant matches project tenant`);
      }

      // Check equipment reservations (ADVERSARIAL CHECK: No cross-tenant gear sharing!)
      for (const res of proj.reservations) {
        assert(res.item.tenantId === proj.tenantId, `Equipment reservation ${res.id} gear item ${res.item.name} (${res.item.tenantId}) strictly matches project tenant (${proj.tenantId})`);
      }
    }

    // 8. Kit Bundles (ADVERSARIAL CHECK: No cross-tenant items in kit bundles!)
    const bundles = await db.kitBundle.findMany({ include: { items: { include: { item: true } } } });
    for (const bundle of bundles) {
      assert(tenantIds.has(bundle.tenantId), `KitBundle ${bundle.name} has valid tenantId`);
      for (const bItem of bundle.items) {
        assert(
          bItem.item.tenantId === bundle.tenantId,
          `KitBundleItem in bundle ${bundle.name} (${bundle.tenantId}) contains gear ${bItem.item.name} (${bItem.item.tenantId}) belonging strictly to the SAME tenant`
        );
      }
    }

    // 9. Frame Designs & Print Sizes
    const frames = await db.frameDesign.findMany();
    for (const f of frames) {
      assert(tenantIds.has(f.tenantId), `Frame ${f.name} has valid tenantId`);
    }

    const printSizes = await db.printSize.findMany();
    for (const ps of printSizes) {
      assert(tenantIds.has(ps.tenantId), `PrintSize ${ps.name} has valid tenantId`);
    }

    // 10. Milestone Invoices overall
    const allInvoices = await db.milestoneInvoice.findMany({ include: { client: true, project: true, proposal: true } });
    for (const inv of allInvoices) {
      assert(tenantIds.has(inv.tenantId), `MilestoneInvoice ${inv.invoiceNumber} has valid tenantId`);
      assert(inv.tenantId === inv.client.tenantId, `Invoice ${inv.invoiceNumber} tenant matches client tenant`);
      if (inv.project) {
        assert(inv.tenantId === inv.project.tenantId, `Invoice ${inv.invoiceNumber} tenant matches project tenant`);
      }
      if (inv.proposal) {
        assert(inv.tenantId === inv.proposal.tenantId, `Invoice ${inv.invoiceNumber} tenant matches proposal tenant`);
      }
    }
  } catch (err: any) {
    result.passed = false;
    result.failures.push(`Multi-tenant isolation exception: ${err.message}`);
    console.error(`  ❌ MULTI-TENANT ISOLATION EXCEPTION:`, err);
  }

  return result;
}

async function challengeUploadApi(): Promise<ChallengeResult> {
  const result: ChallengeResult = {
    suiteName: "Local Media Upload API Route Empirical Challenge",
    passed: true,
    assertionsPassed: 0,
    failures: [],
  };

  const createdFiles: string[] = [];

  function assert(condition: boolean, msg: string) {
    if (condition) {
      result.assertionsPassed++;
      console.log(`  ✓ ${msg}`);
    } else {
      result.passed = false;
      result.failures.push(msg);
      console.error(`  ❌ FAIL: ${msg}`);
    }
  }

  console.log("\n--- [CHALLENGE 3]: Local Media Upload API Route Empirical Verification ---");

  try {
    // 1. Valid Image (JPEG) to receipts
    {
      const jpegContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const formData = new FormData();
      formData.append("file", new Blob([jpegContent], { type: "image/jpeg" }), "sample-receipt.jpg");
      formData.append("folder", "receipts");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, `JPEG upload returns HTTP 201 (got ${res.status})`);
      const body = await res.json();
      assert(body.success === true, "JPEG upload body.success is true");
      assert(body.mimeType === "image/jpeg", "JPEG upload body.mimeType is image/jpeg");
      assert(body.url.startsWith("/uploads/receipts/"), `JPEG upload URL in /uploads/receipts/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null && fileStat.isFile(), `JPEG file created on disk at ${diskPath}`);
      assert(fileStat !== null && fileStat.size === jpegContent.length, `JPEG file size matches upload payload (${jpegContent.length} bytes)`);
    }

    // 2. Valid Image (PNG) to logos
    {
      const pngContent = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      const formData = new FormData();
      formData.append("file", new Blob([pngContent], { type: "image/png" }), "logo-test.png");
      formData.append("folder", "logos");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, `PNG logo upload returns HTTP 201 (got ${res.status})`);
      const body = await res.json();
      assert(body.url.startsWith("/uploads/logos/"), `PNG logo URL in /uploads/logos/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null && fileStat.size === pngContent.length, "PNG logo file exists on disk with matching size");
    }

    // 3. Valid Video (MP4) to deliverables
    {
      const mp4Content = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAsbZGF0", "base64");
      const formData = new FormData();
      formData.append("file", new Blob([mp4Content], { type: "video/mp4" }), "trailer.mp4");
      formData.append("folder", "deliverables");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, `MP4 upload returns HTTP 201 (got ${res.status})`);
      const body = await res.json();
      assert(body.url.startsWith("/uploads/deliverables/"), `MP4 deliverable URL in /uploads/deliverables/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null && fileStat.size === mp4Content.length, "MP4 deliverable exists on disk with matching size");
    }

    // 4. Valid PDF to general
    {
      const pdfContent = Buffer.from("%PDF-1.4 minimal test pdf content %%EOF");
      const formData = new FormData();
      formData.append("file", new Blob([pdfContent], { type: "application/pdf" }), "contract.pdf");
      formData.append("folder", "general");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, `PDF upload returns HTTP 201 (got ${res.status})`);
      const body = await res.json();
      assert(body.url.startsWith("/uploads/general/"), `PDF URL in /uploads/general/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null && fileStat.size === pdfContent.length, "PDF contract exists on disk with matching size");
    }

    // 5. Adversarial: Missing File
    {
      const formData = new FormData();
      formData.append("folder", "receipts");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 400, `Missing file returns HTTP 400 (got ${res.status})`);
      const body = await res.json();
      assert(body.error === "No file provided", "Error message confirms 'No file provided'");
    }

    // 6. Adversarial: Disallowed / Malicious MIME Types
    const rejectedTypes = [
      { name: "executable script", mime: "application/x-sh", filename: "exploit.sh" },
      { name: "javascript", mime: "application/javascript", filename: "payload.js" },
      { name: "html", mime: "text/html", filename: "phish.html" },
      { name: "gif", mime: "image/gif", filename: "animation.gif" },
      { name: "bitmap", mime: "image/bmp", filename: "raw.bmp" },
    ];

    for (const item of rejectedTypes) {
      const formData = new FormData();
      formData.append("file", new Blob(["malicious payload"], { type: item.mime }), item.filename);
      formData.append("folder", "receipts");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 400, `Rejected MIME type '${item.mime}' returns HTTP 400 (got ${res.status})`);
      const body = await res.json();
      assert(body.error === "Unsupported file type", `Error message for '${item.mime}' is 'Unsupported file type'`);
    }

    // 7. Adversarial: Directory Traversal via folder parameter
    {
      const jpegContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const formData = new FormData();
      formData.append("file", new Blob([jpegContent], { type: "image/jpeg" }), "traversal.jpg");
      formData.append("folder", "../../sensitive-dir");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, "Upload with directory traversal attempt returns 201 by falling back to safe folder");
      const body = await res.json();
      assert(body.url.startsWith("/uploads/general/"), `Path traversal fell back safely to /uploads/general/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null, "File safely isolated inside public/uploads/general/");
    }

    // 8. Adversarial: Unrecognized folder name
    {
      const jpegContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const formData = new FormData();
      formData.append("file", new Blob([jpegContent], { type: "image/jpeg" }), "unrecognized.jpg");
      formData.append("folder", "unauthorized_custom_directory");

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: formData });
      const res = await uploadHandler(req);
      assert(res.status === 201, "Upload with unknown folder returns 201 with fallback");
      const body = await res.json();
      assert(body.url.startsWith("/uploads/general/"), `Unknown folder fell back safely to /uploads/general/ (${body.url})`);

      const diskPath = path.join(process.cwd(), "public", body.url);
      createdFiles.push(diskPath);
      const fileStat = await fs.stat(diskPath).catch(() => null);
      assert(fileStat !== null, "File stored in general folder");
    }

  } catch (err: any) {
    result.passed = false;
    result.failures.push(`Upload API exception: ${err.message}`);
    console.error(`  ❌ UPLOAD API EXCEPTION:`, err);
  } finally {
    // Clean up temporary test files
    for (const f of createdFiles) {
      try {
        await fs.unlink(f);
      } catch {}
    }
    console.log(`  ✓ Cleaned up ${createdFiles.length} temporary test upload files`);
  }

  return result;
}

async function challengeBusinessInvariants(): Promise<ChallengeResult> {
  const result: ChallengeResult = {
    suiteName: "Milestone 1 Business Invariants & Disk Assets",
    passed: true,
    assertionsPassed: 0,
    failures: [],
  };

  function assert(condition: boolean, msg: string) {
    if (condition) {
      result.assertionsPassed++;
      console.log(`  ✓ ${msg}`);
    } else {
      result.passed = false;
      result.failures.push(msg);
      console.error(`  ❌ FAIL: ${msg}`);
    }
  }

  console.log("\n--- [CHALLENGE 4]: Seed Data Business Invariants & Storage Assets ---");

  try {
    // 1. Paywall Gating Invariants
    const luminaProject = await db.project.findUnique({
      where: { id: "proj_lumina_01" },
      include: { invoices: true, deliverables: { include: { items: true } } },
    });
    assert(luminaProject !== null, "Lumina project exists");
    assert(luminaProject!.isFinalBalancePaid === false, "Lumina project paywall is ACTIVE (isFinalBalancePaid: false)");

    const pendingFinalInv = luminaProject!.invoices.find(i => i.milestoneType === "FINAL_BALANCE_50");
    assert(pendingFinalInv !== undefined && pendingFinalInv.status === "PENDING", "Lumina has FINAL_BALANCE_50 invoice in PENDING status");

    const apexProject = await db.project.findUnique({
      where: { id: "proj_apex_01" },
      include: { invoices: true, deliverables: { include: { items: true } } },
    });
    assert(apexProject !== null, "Apex project exists");
    assert(apexProject!.isFinalBalancePaid === true, "Apex project paywall is CLEARED (isFinalBalancePaid: true)");

    const paidFinalInv = apexProject!.invoices.find(i => i.milestoneType === "FINAL_BALANCE_50");
    assert(paidFinalInv !== undefined && paidFinalInv.status === "PAID", "Apex has FINAL_BALANCE_50 invoice in PAID status");

    // 2. Booking Slot Hold Invariants
    const heldSlots = await db.bookingSlot.findMany({ where: { status: "HELD" } });
    assert(heldSlots.length >= 2, `At least 2 HELD slots seeded for countdown timer testing (found ${heldSlots.length})`);
    for (const hs of heldSlots) {
      assert(hs.heldUntil !== null && hs.heldUntil > new Date(), `HELD slot ${hs.id} has future heldUntil for active timer countdown`);
      assert(typeof hs.heldBySessionId === "string" && hs.heldBySessionId.length > 0, `HELD slot ${hs.id} has heldBySessionId`);
    }

    // 3. Manual Verification Queue Invariants
    const pendingVerificationInvoices = await db.milestoneInvoice.findMany({
      where: { status: "PENDING_VERIFICATION" },
    });
    assert(pendingVerificationInvoices.length >= 2, `Found ${pendingVerificationInvoices.length} invoices awaiting manual verification`);
    for (const pvi of pendingVerificationInvoices) {
      assert(pvi.paymentMethod === "QR_CODE", `Invoice ${pvi.invoiceNumber} uses QR_CODE paymentMethod`);
      assert(typeof pvi.paymentProofUrl === "string" && pvi.paymentProofUrl.length > 0, `Invoice ${pvi.invoiceNumber} has paymentProofUrl`);
      const diskPath = path.join(process.cwd(), "public", pvi.paymentProofUrl!);
      const stat = await fs.stat(diskPath).catch(() => null);
      assert(stat !== null && stat.size > 0, `Receipt slip asset exists on disk at ${pvi.paymentProofUrl}`);
    }

    // 4. Physical Disk Assets Verification (All assets seeded in setupPlaceholderAssets)
    const assetChecks = [
      "public/uploads/logos/lumina-logo.svg",
      "public/uploads/logos/apex-logo.svg",
      "public/uploads/qrcodes/lumina_qr.png",
      "public/uploads/qrcodes/apex_duitnow_qr.png",
      "public/uploads/receipts/receipt_sample_qr.jpg",
      "public/uploads/receipts/duitnow_receipt_farah.jpg",
      "public/uploads/receipts/duitnow_slip_kamarudin.jpg",
      "public/uploads/frames/matte-black.png",
      "public/uploads/frames/warm-walnut.png",
      "public/uploads/frames/champagne-gold.png",
      "public/uploads/frames/apex-black.png",
      "public/uploads/frames/apex-gold.png",
      "public/uploads/frames/apex-teak.png",
      "public/uploads/showcase/lumina_showcase_01.jpg",
      "public/uploads/showcase/lumina_showcase_02.jpg",
      "public/uploads/showcase/apex_convo_showcase.jpg",
      "public/uploads/showcase/apex_raya_showcase.jpg",
      "public/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
      "public/uploads/deliverables/previews/aurora_hero_02_watermarked.jpg",
      "public/uploads/deliverables/previews/aurora_60s_stream_proxy.mp4",
      "public/uploads/deliverables/previews/farah_convo_01_preview.jpg",
      "public/uploads/deliverables/previews/farah_family_02_preview.jpg",
      "public/uploads/deliverables/masters/aurora_hero_01_master.jpg",
      "public/uploads/deliverables/masters/aurora_hero_02_master.jpg",
      "public/uploads/deliverables/masters/aurora_60s_prores422hq_master.mov",
      "public/uploads/deliverables/masters/farah_convo_01_master.jpg",
      "public/uploads/deliverables/masters/farah_family_02_master.jpg",
      "public/uploads/deliverables/thumbnails/aurora_hero_01_thumb.jpg",
      "public/uploads/deliverables/thumbnails/aurora_hero_02_thumb.jpg",
      "public/uploads/deliverables/thumbnails/aurora_video_thumb.jpg",
      "public/uploads/deliverables/thumbnails/farah_convo_01_thumb.jpg",
      "public/uploads/deliverables/thumbnails/farah_family_02_thumb.jpg",
    ];

    for (const relPath of assetChecks) {
      const fullPath = path.join(process.cwd(), relPath);
      const stat = await fs.stat(fullPath).catch(() => null);
      assert(stat !== null && stat.size > 0, `Static mock asset exists on disk and is non-empty: ${relPath}`);
    }

  } catch (err: any) {
    result.passed = false;
    result.failures.push(`Business invariants exception: ${err.message}`);
    console.error(`  ❌ BUSINESS INVARIANTS EXCEPTION:`, err);
  }

  return result;
}

async function runAllEmpiricalChallenges() {
  console.log("================================================================================");
  console.log("🔥 CINEFLOW OS - M1 EMPIRICAL CHALLENGER ADVERSARIAL TEST SUITE 🔥");
  console.log("================================================================================");

  const results: ChallengeResult[] = [];
  results.push(await challengeSeedIdempotency());
  results.push(await challengeMultiTenantIsolation());
  results.push(await challengeUploadApi());
  results.push(await challengeBusinessInvariants());

  console.log("\n================================================================================");
  console.log("📊 CHALLENGE SUMMARY RESULTS");
  console.log("================================================================================");

  let allPassed = true;
  let totalAssertions = 0;

  for (const r of results) {
    totalAssertions += r.assertionsPassed;
    const statusStr = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${statusStr} [${r.suiteName}] — ${r.assertionsPassed} assertions passed`);
    if (!r.passed) {
      allPassed = false;
      for (const f of r.failures) {
        console.error(`    ↳ FAILURE: ${f}`);
      }
    }
  }

  console.log(`\nTOTAL ASSERTIONS PASSED: ${totalAssertions}`);
  if (allPassed) {
    console.log("🏆 OVERALL EMPIRICAL VERDICT: APPROVE (Zero bugs found, all invariants satisfied)");
    process.exit(0);
  } else {
    console.error("💥 OVERALL EMPIRICAL VERDICT: REJECT (Bugs / regressions detected)");
    process.exit(1);
  }
}

runAllEmpiricalChallenges()
  .catch((e) => {
    console.error("Empirical challenge suite crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
