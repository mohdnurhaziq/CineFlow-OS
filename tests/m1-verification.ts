import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as enums from "@/lib/types/enums";
import fs from "node:fs/promises";
import path from "node:path";

async function runM1Verification() {
  console.log("=== CineFlow OS Milestone 1 Verification Suite ===");
  let passedAssertions = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`❌ ASSERTION FAILED: ${message}`);
      process.exit(1);
    }
    console.log(`✓ ${message}`);
    passedAssertions++;
  }

  // 1. Env validation
  assert(env.DATABASE_URL.includes("dev.db"), "env.DATABASE_URL points to dev.db");
  assert(env.AUTH_SECRET.length >= 32, "env.AUTH_SECRET is at least 32 chars");

  // 2. All 24 models have records
  const modelKeys = [
    "tenant", "campaignCategory", "proposalAddOnTemplate", "bookingSlot",
    "frameDesign", "printSize", "user", "proposal", "proposalAddOn",
    "milestoneInvoice", "project", "callSheet", "shotItem", "digitalRelease",
    "clientDeliverable", "deliverableItem", "inventoryItem", "kitBundle",
    "kitBundleItem", "equipmentReservation", "inspectionLog", "clientBooking",
    "servicePackage", "showcaseItem"
  ] as const;

  for (const key of modelKeys) {
    // @ts-ignore
    const count = await db[key].count();
    assert(count > 0, `Model '${key}' has ${count} records (non-zero)`);
  }

  // 3. Multi-tenancy isolation
  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  assert(luminaTenant !== null, "Lumina CineWorks tenant exists");
  assert(apexTenant !== null, "Apex Photo & Motion tenant exists");

  const luminaCategories = await db.campaignCategory.findMany({ where: { tenantId: luminaTenant!.id } });
  const apexCategories = await db.campaignCategory.findMany({ where: { tenantId: apexTenant!.id } });
  assert(luminaCategories.length === 3, "Lumina has exactly 3 categories");
  assert(apexCategories.length === 4, "Apex has exactly 4 categories");

  // Verify no category cross-leakage
  const luminaCategorySlugs = new Set(luminaCategories.map(c => c.slug));
  assert(luminaCategorySlugs.has("commercial") && !luminaCategorySlugs.has("convocation"), "Lumina has commercial but not convocation");

  // 4. Paywall gating verification
  const luminaProject = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
  assert(luminaProject !== null, "Lumina commercial project exists");
  assert(luminaProject!.isFinalBalancePaid === false, "Lumina project has isFinalBalancePaid === false (paywall active)");

  const apexProject = await db.project.findUnique({ where: { id: "proj_apex_01" } });
  assert(apexProject !== null, "Apex convocation project exists");
  assert(apexProject!.isFinalBalancePaid === true, "Apex project has isFinalBalancePaid === true (paywall settled / unlocked)");

  // 5. Booking slot hold and countdown timer verification
  const heldSlot = await db.bookingSlot.findUnique({ where: { id: "slt_lum_2" } });
  assert(heldSlot !== null, "Held slot slt_lum_2 exists");
  assert(heldSlot!.status === enums.SlotStatus.HELD, "Held slot status is HELD");
  assert(heldSlot!.heldUntil !== null && heldSlot!.heldUntil > new Date(), "Held slot expiration is in the future for active countdown");

  // 6. Manual Verification Console queue
  const pendingInvoices = await db.milestoneInvoice.findMany({
    where: { status: enums.InvoiceStatus.PENDING_VERIFICATION },
  });
  assert(pendingInvoices.length >= 2, `Found ${pendingInvoices.length} invoices pending staff verification`);

  for (const inv of pendingInvoices) {
    assert(inv.paymentProofUrl !== null, `Invoice ${inv.invoiceNumber} has paymentProofUrl`);
    const filePath = path.join(process.cwd(), "public", inv.paymentProofUrl!);
    const exists = await fs.stat(filePath).then(() => true).catch(() => false);
    assert(exists, `Receipt proof file exists on disk at ${inv.paymentProofUrl}`);
  }

  // 7. Deliverable assets disk existence
  const deliverableItems = await db.deliverableItem.findMany();
  assert(deliverableItems.length >= 5, "At least 5 deliverable items exist");
  for (const item of deliverableItems) {
    const previewPath = path.join(process.cwd(), "public", item.previewUrl);
    const downloadPath = path.join(process.cwd(), "public", item.downloadUrl);
    const prevExists = await fs.stat(previewPath).then(() => true).catch(() => false);
    const dlExists = await fs.stat(downloadPath).then(() => true).catch(() => false);
    assert(prevExists, `Deliverable preview exists: ${item.previewUrl}`);
    assert(dlExists, `Deliverable master exists: ${item.downloadUrl}`);
  }

  console.log(`\n🎉 ALL ${passedAssertions} VERIFICATION ASSERTIONS PASSED WITH ZERO ERRORS!`);
}

runM1Verification()
  .catch((e) => {
    console.error("Verification suite failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
