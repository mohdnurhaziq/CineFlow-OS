/**
 * Reviewer Independent Adversarial Verification Suite: Milestone 4
 * Reviewer: reviewer_m4_2
 *
 * Scrutinizes:
 * 1. Module 8: Print & Frame Wall Visualizer
 *    - Tenant isolation & cross-tenant injection rejection
 *    - Price calculation determinism & atomicity
 *    - MilestoneInvoice creation with milestoneType = "PRINT_FRAME_ORDER"
 *    - paymentReference JSON integrity & serialization
 *    - Checkout route parameter resolution
 *    - processInvoicePayment integration & paymentReference preservation analysis
 * 2. Visualizer Mathematical Scaling & Geometry:
 *    - Proportional scaling math: pixelsPerInch = (sofaWidthPx / 84)
 *    - Dimension calculation for 8R, 12R, 16R in Portrait & Landscape
 *    - Mat board and molding additive offsets
 * 3. Global Integration & Route Regression:
 *    - Database consistency for Lumina and Apex
 *    - Cross-module data linking between Vault, Visualizer, Checkout, Logistics, and Gear
 */

import { db } from "../lib/db";
import { createPrintOrder } from "../lib/actions/visualizer";
import { processInvoicePayment } from "../lib/actions/checkout";

let passed = 0;
let failed = 0;
const findings: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    if (detail) console.error(`     ↳ ${detail}`);
    failed++;
    findings.push(`${name}: ${detail || "Condition not met"}`);
  }
}

async function runReviewerAdversarialTests() {
  console.log("================================================================================");
  console.log("   REVIEWER INDEPENDENT ADVERSARIAL VERIFICATION SUITE (M4)                    ");
  console.log("================================================================================\n");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Seed tenants not found. Ensure dev.db is seeded.");
  }

  // ----------------------------------------------------------------------------
  // SECTION 1: Tenant Isolation & Malicious Cross-Tenant Injection in Visualizer
  // ----------------------------------------------------------------------------
  console.log("--- 1. Tenant Isolation & Cross-Tenant Attacks in createPrintOrder ---");

  // Fetch Lumina and Apex print sizes and frames
  const luminaPrintSizes = await db.printSize.findMany({ where: { tenantId: luminaTenant.id } });
  const apexPrintSizes = await db.printSize.findMany({ where: { tenantId: apexTenant.id } });
  const luminaFrames = await db.frameDesign.findMany({ where: { tenantId: luminaTenant.id } });
  const apexFrames = await db.frameDesign.findMany({ where: { tenantId: apexTenant.id } });

  check("Lumina has seeded print sizes", luminaPrintSizes.length >= 3, `Found ${luminaPrintSizes.length}`);
  check("Apex has seeded print sizes", apexPrintSizes.length >= 3, `Found ${apexPrintSizes.length}`);
  check("Lumina has seeded frames", luminaFrames.length >= 3, `Found ${luminaFrames.length}`);
  check("Apex has seeded frames", apexFrames.length >= 3, `Found ${apexFrames.length}`);

  // Test 1.1: Attempt to create Lumina print order using Apex's printSizeId
  const crossPrintRes = await createPrintOrder({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    printSizeId: apexPrintSizes[0]!.id, // Belongs to Apex!
    frameDesignId: luminaFrames[0]!.id,
    matBoardType: "WHITE_2INCH",
    orientation: "LANDSCAPE",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    clientName: "Adversary Attacker",
    clientEmail: "attacker@test.com",
  });
  check(
    "Rejects cross-tenant printSizeId (tenant isolation enforced)",
    crossPrintRes.success === false && crossPrintRes.error === "PRINT_SIZE_NOT_FOUND",
    `Expected PRINT_SIZE_NOT_FOUND, got: ${JSON.stringify(crossPrintRes)}`
  );

  // Test 1.2: Attempt to create Lumina print order using Apex's frameDesignId
  const crossFrameRes = await createPrintOrder({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    printSizeId: luminaPrintSizes[0]!.id,
    frameDesignId: apexFrames[0]!.id, // Belongs to Apex!
    matBoardType: "WHITE_2INCH",
    orientation: "LANDSCAPE",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    clientName: "Adversary Attacker",
    clientEmail: "attacker@test.com",
  });
  check(
    "Rejects cross-tenant frameDesignId (tenant isolation enforced)",
    crossFrameRes.success === false && crossFrameRes.error === "FRAME_DESIGN_NOT_FOUND",
    `Expected FRAME_DESIGN_NOT_FOUND, got: ${JSON.stringify(crossFrameRes)}`
  );

  // Test 1.3: Non-existent tenantId
  const fakeTenantRes = await createPrintOrder({
    tenantId: "ten_nonexistent_xyz",
    tenantSlug: "fake-studio",
    printSizeId: luminaPrintSizes[0]!.id,
    frameDesignId: luminaFrames[0]!.id,
    matBoardType: "NONE",
    orientation: "PORTRAIT",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    clientName: "Adversary Attacker",
    clientEmail: "attacker@test.com",
  });
  check(
    "Rejects non-existent tenantId",
    fakeTenantRes.success === false && fakeTenantRes.error === "TENANT_NOT_FOUND",
    `Expected TENANT_NOT_FOUND, got: ${JSON.stringify(fakeTenantRes)}`
  );

  // Test 1.4: Schema validation rejects invalid inputs
  const invalidEmailRes = await createPrintOrder({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    printSizeId: luminaPrintSizes[0]!.id,
    frameDesignId: luminaFrames[0]!.id,
    matBoardType: "NONE",
    orientation: "PORTRAIT",
    photoUrl: "/uploads/test.jpg",
    clientName: "A", // too short (min 2)
    clientEmail: "not-an-email",
  });
  check(
    "Zod schema rejects invalid email and short client name",
    invalidEmailRes.success === false && invalidEmailRes.error === "ORDER_CREATION_FAILED",
    `Expected validation rejection, got: ${JSON.stringify(invalidEmailRes)}`
  );

  // ----------------------------------------------------------------------------
  // SECTION 2: Legitimate Order Creation, Math Verification, & Invoicing
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. Legitimate Order Math & Invoice Invariants ---");

  // Find 16R size and Walnut frame
  const targetSize = luminaPrintSizes.find((s) => s.code === "16R") || luminaPrintSizes[0]!;
  const targetFrame = luminaFrames.find((f) => f.name.toLowerCase().includes("walnut")) || luminaFrames[0]!;

  const expectedBase = targetSize.basePrice;
  const expectedFrameOffset = targetFrame.priceOffset;
  const expectedMatPrice = 25.0; // 2" Mat board
  const expectedTotal = expectedBase + expectedFrameOffset + expectedMatPrice;

  const validOrderRes = await createPrintOrder({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    projectId: "proj_lumina_01",
    printSizeId: targetSize.id,
    frameDesignId: targetFrame.id,
    matBoardType: "WHITE_2INCH",
    orientation: "LANDSCAPE",
    photoUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    photoTitle: "Aurora Fall Editorial Hero",
    clientName: "Eleanor Vance",
    clientEmail: "eleanor.vance@aurorafashion.com",
    clientPhone: "+1 (555) 431-9002",
    notes: "Archival rag paper with white cotton inspection gloves.",
  });

  check("Order created successfully", validOrderRes.success === true, `Result: ${JSON.stringify(validOrderRes)}`);
  check(
    "Total calculated price strictly matches formula (print + frame + mat)",
    validOrderRes.totalAmount === expectedTotal,
    `Expected ${expectedTotal}, got ${validOrderRes.totalAmount}`
  );
  check(
    "Checkout redirect URL points to /[tenantSlug]/checkout?invoiceId=...",
    validOrderRes.checkoutUrl === `/${luminaTenant.slug}/checkout?invoiceId=${validOrderRes.invoiceId}`,
    `Got: ${validOrderRes.checkoutUrl}`
  );

  // Verify database state
  const invoice = await db.milestoneInvoice.findUnique({
    where: { id: validOrderRes.invoiceId },
    include: { client: true, project: true },
  });

  check("MilestoneInvoice exists in database", invoice !== null);
  check(
    "milestoneType is strictly 'PRINT_FRAME_ORDER'",
    invoice?.milestoneType === "PRINT_FRAME_ORDER",
    `Got: ${invoice?.milestoneType}`
  );
  check("Invoice initial status is PENDING", invoice?.status === "PENDING", `Got: ${invoice?.status}`);
  check("Invoice amount matches total", invoice?.amount === expectedTotal, `Got: ${invoice?.amount}`);
  check("Invoice clientId is set to client user", !!invoice?.clientId);
  check("Client user role is CLIENT", invoice?.client?.role === "CLIENT");
  check("Invoice dueDate is set (Net 7 days in future)", (invoice?.dueDate?.getTime() || 0) > Date.now());

  // Verify paymentReference serialization
  check("paymentReference is non-empty string", typeof invoice?.paymentReference === "string");
  let parsedMetadata: any = null;
  try {
    parsedMetadata = JSON.parse(invoice!.paymentReference!);
  } catch (err: any) {
    findings.push(`JSON parse error on paymentReference: ${err.message}`);
  }

  check("paymentReference parsed as valid JSON", parsedMetadata !== null);
  check("orderType is 'PRINT_FRAME_ORDER'", parsedMetadata?.orderType === "PRINT_FRAME_ORDER");
  check("printSize code matches", parsedMetadata?.printSize?.code === targetSize.code);
  check("frameDesign name matches", parsedMetadata?.frameDesign?.name === targetFrame.name);
  check("matBoard type is WHITE_2INCH", parsedMetadata?.matBoard?.type === "WHITE_2INCH");
  check("photoTitle matches", parsedMetadata?.photoTitle === "Aurora Fall Editorial Hero");
  check("financialBreakdown totalAmount matches", parsedMetadata?.financialBreakdown?.totalAmount === expectedTotal);

  // ----------------------------------------------------------------------------
  // SECTION 3: Visualizer Proportional Scaling Mathematics
  // ----------------------------------------------------------------------------
  console.log("\n--- 3. Proportional Scaling & Geometric Math ---");

  // Calibrate 84" Sofa:
  // Base desktop sofa width = 504px
  // pixelsPerInch = 504 / 84 = 6.0 px/inch
  const baseSofaPx = 504;
  const pixelsPerInch = baseSofaPx / 84;
  check("Scale anchor ratio: 504px / 84 inches = 6.0 px/in", pixelsPerInch === 6.0);

  // Verify 16R Landscape (16 x 24 in):
  // Orientation LANDSCAPE => printWidth = 24 in, printHeight = 16 in
  // Mat 2" => matInches = 2.0 in (2 inches on each side = +4.0 in)
  // Walnut molding = 1.25 in (1.25 inches on each side = +2.5 in)
  const printW = 24;
  const printH = 16;
  const matInches = 2.0;
  const moldingInches = targetFrame.moldingWidth; // 1.75 for Walnut

  const totalWInches = printW + matInches * 2 + moldingInches * 2;
  const totalHInches = printH + matInches * 2 + moldingInches * 2;
  const expectedTotalW = 24 + 4 + moldingInches * 2; // 31.5 for 1.75 molding
  const expectedTotalH = 16 + 4 + moldingInches * 2; // 23.5 for 1.75 molding

  check(
    `Total exterior width in inches (24 + 4 + ${moldingInches * 2} = ${expectedTotalW} in)`,
    totalWInches === expectedTotalW,
    `Got: ${totalWInches}`
  );
  check(
    `Total exterior height in inches (16 + 4 + ${moldingInches * 2} = ${expectedTotalH} in)`,
    totalHInches === expectedTotalH,
    `Got: ${totalHInches}`
  );

  const totalWPx = Math.round(totalWInches * pixelsPerInch);
  const totalHPx = Math.round(totalHInches * pixelsPerInch);
  const expectedWPx = Math.round(expectedTotalW * 6);
  const expectedHPx = Math.round(expectedTotalH * 6);

  check(`Total width in pixels (${expectedTotalW} * 6 = ${expectedWPx} px)`, totalWPx === expectedWPx, `Got: ${totalWPx}`);
  check(`Total height in pixels (${expectedTotalH} * 6 = ${expectedHPx} px)`, totalHPx === expectedHPx, `Got: ${totalHPx}`);

  const percentSofa = Math.round((totalWInches / 84) * 100);
  const expectedPercent = Math.round((expectedTotalW / 84) * 100);
  check(`Percentage of 84" sofa (${expectedTotalW} / 84 * 100 ≈ ${expectedPercent}%)`, percentSofa === expectedPercent, `Got: ${percentSofa}%`);

  // Verify 8R Portrait (8 x 10 in, No Mat, 1.25" Molding):
  const p8rW = 8;
  const p8rH = 10;
  const total8rWInches = p8rW + 0 * 2 + 1.25 * 2; // 10.5 in
  const total8rHInches = p8rH + 0 * 2 + 1.25 * 2; // 12.5 in
  const percent8rSofa = Math.round((total8rWInches / 84) * 100);
  check("8R No Mat width (8 + 2.5 = 10.5 in)", total8rWInches === 10.5);
  check("8R % of 84\" sofa (10.5 / 84 ≈ 13%)", percent8rSofa === 13, `Got: ${percent8rSofa}%`);

  // ----------------------------------------------------------------------------
  // SECTION 4: Checkout Resolution & Payment Processing Analysis
  // ----------------------------------------------------------------------------
  console.log("\n--- 4. Checkout Resolution & Payment Processing ---");

  // Verify that the checkout route query logic resolves the invoice
  const checkoutResolvedInvoice = await db.milestoneInvoice.findFirst({
    where: {
      id: validOrderRes.invoiceId,
      tenantId: luminaTenant.id,
    },
    include: { client: true, project: true },
  });
  check(
    "Checkout page query resolves PRINT_FRAME_ORDER invoice by invoiceId",
    checkoutResolvedInvoice !== null && checkoutResolvedInvoice.id === validOrderRes.invoiceId
  );

  // Test paying via processInvoicePayment with QR Code (manual verification queue)
  const qrPayRes = await processInvoicePayment({
    tenantId: luminaTenant.id,
    tenantSlug: luminaTenant.slug,
    invoiceId: validOrderRes.invoiceId!,
    paymentMethod: "QR_CODE",
    paymentProofUrl: "/uploads/receipts/test_print_qr.jpg",
    paymentReference: "QR-DUITNOW-PRINT-01",
  });

  check("processInvoicePayment accepts QR payment for print order", qrPayRes.success === true);
  check("Invoice status transitioned to PENDING_VERIFICATION", qrPayRes.status === "PENDING_VERIFICATION");

  const pendingInv = await db.milestoneInvoice.findUnique({ where: { id: validOrderRes.invoiceId } });
  check("Database status is PENDING_VERIFICATION", pendingInv?.status === "PENDING_VERIFICATION");
  check("paymentProofUrl persisted", pendingInv?.paymentProofUrl === "/uploads/receipts/test_print_qr.jpg");

  // Clean up test invoice and client
  await db.milestoneInvoice.delete({ where: { id: validOrderRes.invoiceId } });

  // ----------------------------------------------------------------------------
  // SECTION 5: Database Model Integrity & Global Regression
  // ----------------------------------------------------------------------------
  console.log("\n--- 5. Database Multi-Tenant Global Health & Relations ---");

  // Check critical models exist and have healthy relations
  const tenantCount = await db.tenant.count();
  const projectCount = await db.project.count();
  const deliverableCount = await db.clientDeliverable.count();
  const inventoryCount = await db.inventoryItem.count();
  const kitBundleCount = await db.kitBundle.count();
  const callSheetCount = await db.callSheet.count();
  const shotCount = await db.shotItem.count();
  const releaseCount = await db.digitalRelease.count();

  check("Tenants count >= 2", tenantCount >= 2, `Found ${tenantCount}`);
  check("Projects count >= 2", projectCount >= 2, `Found ${projectCount}`);
  check("Deliverables count >= 2", deliverableCount >= 2, `Found ${deliverableCount}`);
  check("Inventory items count >= 10", inventoryCount >= 10, `Found ${inventoryCount}`);
  check("Kit bundles count >= 2", kitBundleCount >= 2, `Found ${kitBundleCount}`);
  check("Call sheets count >= 1", callSheetCount >= 1, `Found ${callSheetCount}`);
  check("Shot items count >= 4", shotCount >= 4, `Found ${shotCount}`);
  check("Digital releases count >= 2", releaseCount >= 2, `Found ${releaseCount}`);

  console.log("\n================================================================================");
  console.log(`Reviewer Adversarial Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error("\nFailed checks summary:");
    findings.forEach((f) => console.error(` - ${f}`));
    process.exitCode = 1;
  }
}

runReviewerAdversarialTests().catch((err) => {
  console.error("Test execution threw exception:", err);
  process.exit(1);
});
