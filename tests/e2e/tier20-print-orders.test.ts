/**
 * Tier 20: Wall art print orders (foundation)
 * - Framed print pricing and the upgrade amount over an included print
 * - Shipping zones: which zone a Malaysian state falls in
 * - Seeded zones and package-included print line
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { framedPrice, upgradeAmount } from "@/lib/prints/pricing";
import { zoneForState, parseZoneStates } from "@/lib/prints/zones";
import { MY_STATES } from "@/lib/prints/states";
import { includedPrintCount } from "@/lib/prints/pricing";
import { createServicePackage, updateServicePackage } from "@/lib/actions/admin-services";
import { withSession } from "./mocks/session";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import { snapshotIncludedPrints, loadProjectEntitlements, remainingForLines } from "@/lib/prints/entitlements";
import { grantIncludedPrint, removeIncludedPrint } from "@/lib/actions/admin-included-prints";
import { backfillIncludedPrints } from "../../prisma/backfill-included-prints";
import { saveShippingZones } from "@/lib/actions/admin-shipping";
import { deleteFrameDesign, deletePrintSize, togglePrintSizeAvailability, updateMatBoardPrice } from "@/lib/actions/admin-frames";
import { cancelPrintOrder, placePrintOrder, quotePrintOrder, updatePrintOrderStatus } from "@/lib/actions/print-orders";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { voidInvoice } from "@/lib/actions/admin-invoices";
import { settleToyyibpayBill } from "@/lib/payments/settle";
import { markPrintOrderPaid } from "@/lib/prints/orders";
import { InvoiceNotPayableError, updatePayableInvoice } from "@/lib/bookings/billing";
import { encryptSecret } from "../../lib/crypto/secret-box";
import type { PlaceOrderInput, UpdateOrderStatusInput } from "@/lib/validations/print-orders";
import { findProp, provideReactGlobal } from "./react-tree";
import VisualizerPage from "@/app/[tenantSlug]/visualizer/page";
import ProjectVaultPage from "@/app/[tenantSlug]/vault/[projectId]/page";
import AdminProjectPrintsPage from "@/app/[tenantSlug]/admin/projects/[projectId]/prints/page";
import nodemailer, { type Transporter } from "nodemailer";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { orientationFor, orientPhotoSize, parseResolution, printDimensionsFor } from "@/lib/prints/orientation";
import { loadPrintOrderPreviews } from "@/lib/prints/order-preview";
import { loadFramedPrints } from "@/lib/prints/gallery";
import { deleteDeliverableFiles, storeDeliverablePhoto } from "@/lib/deliverables/storage";
import sharp from "sharp";
import { deleteDeliverableItem } from "@/lib/actions/admin-projects";
import AdminVerificationPage from "@/app/[tenantSlug]/admin/verification/page";

export async function runTier20PrintOrderTests(harness: TestHarness) {
  harness.setSuite("Tier 20", "Wall Art Print Orders: Schema, Pricing & Zones");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant is required for Tier 20");

  await harness.test("T20-PRICE-01: framed price adds frame and (optional) mat", async () => {
    harness.assertEqual(framedPrice({ sizePrice: 40, framePrice: 15, mat: "NONE", matBoardPrice: 25 }), 55, "No mat");
    harness.assertEqual(framedPrice({ sizePrice: 40, framePrice: 15, mat: "WHITE_2INCH", matBoardPrice: 25 }), 80, "With mat");
  });

  await harness.test("T20-PRICE-02: upgrade amount is the extra over the included print, never negative", async () => {
    harness.assertEqual(upgradeAmount(80, 55), 25, "Pays the difference");
    harness.assertEqual(upgradeAmount(40, 55), 0, "Cheaper choice costs nothing");
    harness.assertEqual(upgradeAmount(55.1, 55), 0.1, "Rounded to cents");
  });

  await harness.test("T20-ORIENT-01: a photo's orientation follows its shape, a square is portrait", async () => {
    harness.assertEqual(orientationFor(4000, 6000), "PORTRAIT", "Tall photo");
    harness.assertEqual(orientationFor(6000, 4000), "LANDSCAPE", "Wide photo");
    harness.assertEqual(orientationFor(3000, 3000), "PORTRAIT", "Square photo");
  });

  await harness.test("T20-RATIO-01: the print keeps the size's short side and follows the photo's shape", async () => {
    const r8 = { widthInches: 8, heightInches: 10 };
    harness.assertEqual(JSON.stringify(printDimensionsFor(r8, { width: 6000, height: 4000 })), JSON.stringify({ widthInches: 12, heightInches: 8, orientation: "LANDSCAPE" }), "3:2 wide on 8R");
    harness.assertEqual(JSON.stringify(printDimensionsFor(r8, { width: 4000, height: 5000 })), JSON.stringify({ widthInches: 8, heightInches: 10, orientation: "PORTRAIT" }), "4:5 tall on 8R");
    harness.assertEqual(JSON.stringify(printDimensionsFor(r8, { width: 3000, height: 3000 })), JSON.stringify({ widthInches: 8, heightInches: 8, orientation: "PORTRAIT" }), "Square on 8R");
  });

  await harness.test("T20-RATIO-02: a stored size that disagrees with the item's orientation is turned to match", async () => {
    const r8 = { widthInches: 8, heightInches: 10 };
    const stored = parseResolution("600 × 400")!;
    const portrait = printDimensionsFor(r8, orientPhotoSize(stored, "PORTRAIT"));
    harness.assertEqual(JSON.stringify(portrait), JSON.stringify({ widthInches: 8, heightInches: 12, orientation: "PORTRAIT" }), "Portrait item prints 8 × 12");
    harness.assertEqual(JSON.stringify(orientPhotoSize(stored, "LANDSCAPE")), JSON.stringify({ width: 600, height: 400 }), "Landscape item keeps it");
    harness.assertEqual(JSON.stringify(orientPhotoSize({ width: 400, height: 600 }, "LANDSCAPE")), JSON.stringify({ width: 600, height: 400 }), "Tall size on a landscape item turns");
    harness.assertEqual(JSON.stringify(orientPhotoSize({ width: 500, height: 500 }, "LANDSCAPE")), JSON.stringify({ width: 500, height: 500 }), "Square unchanged");
  });

  await harness.test("T20-RATIO-03: an uploaded photo with EXIF orientation 6 stores its size as seen (portrait)", async () => {
    const data = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#888888" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const stored = await storeDeliverablePhoto({ tenantId: lumina.id, projectId: "t20-exif", data, ext: ".jpg", watermark: "T20" });
    try {
      harness.assertEqual(stored.resolution, "400 × 600", "Width and height swapped for a rotated photo");
    } finally {
      await deleteDeliverableFiles(stored);
    }
  });

  const zones = await db.shippingZone.findMany({ where: { tenantId: lumina.id }, orderBy: { sortOrder: "asc" } });

  await harness.test("T20-ZONE-01: a state maps to its shipping zone, unknown states to none", async () => {
    harness.assertEqual(zones.length, 3, "Three seeded zones");
    harness.assertEqual(JSON.stringify(zoneForState(zones, "Sarawak")), JSON.stringify({ name: "Local", fee: 10 }), "Sarawak");
    harness.assertEqual(JSON.stringify(zoneForState(zones, "Labuan")), JSON.stringify({ name: "Sabah", fee: 20 }), "Labuan");
    harness.assertEqual(JSON.stringify(zoneForState(zones, "Selangor")), JSON.stringify({ name: "Peninsular", fee: 30 }), "Selangor");
    harness.assertEqual(zoneForState(zones, "Narnia"), null, "Unknown");
  });

  await harness.test("T20-ZONE-02: every Malaysian state is covered by exactly one seeded zone", async () => {
    harness.assertEqual(MY_STATES.length, 16, "16 states");
    for (const s of MY_STATES) {
      const hits = zones.filter((z) => parseZoneStates(z.statesJson).includes(s)).length;
      harness.assertEqual(hits, 1, `${s} in one zone`);
    }
    harness.assertEqual(JSON.stringify(parseZoneStates("not json")), "[]", "Bad JSON is empty");
  });

  await harness.test("T20-SEED-01: the commercial package includes one smallest-size print with the first frame", async () => {
    const lines = await db.packageIncludedPrint.findMany({ where: { packageId: "pkg_lumina_comm" } });
    harness.assertEqual(lines.length, 1, "One included line");
    harness.assertEqual(lines[0]?.quantity, 1, "Quantity 1");
    harness.assertEqual(lines[0]?.printSizeId, "psz_lum_8r", "Smallest size");
    harness.assertEqual(lines[0]?.frameDesignId, "frm_lum_black", "First frame");
    harness.assertEqual(lumina.matBoardPrice, 25, "Mat price default");
  });

  // ---- Package included prints (admin) and delete-protection ----
  const pkgBase = {
    tenantId: lumina.id,
    tenantSlug: "lumina-cine",
    name: "T20 Print Pkg",
    category: "COMMERCIAL",
    discipline: "PHOTOGRAPHY" as const,
    price: 500,
    depositPrice: 100,
    turnaround: "5 days",
    description: "Test package for prints",
    deliverables: "10 stills",
    isFeatured: false,
  };
  const t20Frame = await db.frameDesign.create({
    data: { tenantId: lumina.id, name: "T20 Frame", material: "Wood", moldingWidth: 1, frameColor: "#000000", previewAsset: "/x.png", priceOffset: 0 },
  });
  const t20Size = await db.printSize.create({
    data: { tenantId: lumina.id, code: "T20S", name: "T20 Size", widthInches: 5, heightInches: 7, basePrice: 10 },
  });
  const t20PkgIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.servicePackage.deleteMany({ where: { name: "T20 Print Pkg" } });
    await db.frameDesign.deleteMany({ where: { id: t20Frame.id } });
    await db.printSize.deleteMany({ where: { id: t20Size.id } });
    await db.tenant.update({ where: { id: lumina.id }, data: { matBoardPrice: 25 } });
  });

  await harness.test("T20-PKG-01: a package saves its included print lines and counts the prints", async () => {
    const created = await createServicePackage({ ...pkgBase, includedPrints: [] });
    if (!created.success || !created.package) throw new Error("create failed");
    t20PkgIds.push(created.package.id);
    const res = await updateServicePackage({
      ...pkgBase,
      id: created.package.id,
      includedPrints: [
        { printSizeId: "psz_lum_8r", frameDesignId: "frm_lum_black", quantity: 1 },
        { printSizeId: t20Size.id, frameDesignId: t20Frame.id, quantity: 2 },
      ],
    });
    harness.assertEqual(res.success, true, "Update succeeds");
    const lines = await db.packageIncludedPrint.findMany({ where: { packageId: created.package.id } });
    harness.assertEqual(lines.length, 2, "Two lines");
    harness.assertEqual(includedPrintCount(lines), 3, "Three prints");
    await updateServicePackage({ ...pkgBase, id: created.package.id, includedPrints: [{ printSizeId: "psz_lum_8r", frameDesignId: "frm_lum_black", quantity: 4 }] });
    const after = await db.packageIncludedPrint.findMany({ where: { packageId: created.package.id } });
    harness.assertEqual(after.length, 1, "Lines are replaced, not appended");
    harness.assertEqual(includedPrintCount(after), 4, "Now four");
  });

  await harness.test("T20-PKG-02: another studio's print size or frame is rejected", async () => {
    const created = await createServicePackage({ ...pkgBase, includedPrints: [] });
    if (!created.success || !created.package) throw new Error("create failed");
    t20PkgIds.push(created.package.id);
    const badSize = await updateServicePackage({
      ...pkgBase,
      id: created.package.id,
      includedPrints: [{ printSizeId: "psz_apx_8r", frameDesignId: "frm_lum_black", quantity: 1 }],
    });
    harness.assertEqual(badSize.success, false, "Foreign size rejected");
    const badFrame = await createServicePackage({
      ...pkgBase,
      includedPrints: [{ printSizeId: "psz_lum_8r", frameDesignId: "frm_apx_black", quantity: 1 }],
    });
    harness.assertEqual(badFrame.success, false, "Foreign frame rejected on create");
    const none = await db.packageIncludedPrint.count({ where: { packageId: created.package.id } });
    harness.assertEqual(none, 0, "Nothing saved");
  });

  await harness.test("T20-PKG-03: a frame or size used by a package line cannot be deleted", async () => {
    const created = await createServicePackage({
      ...pkgBase,
      includedPrints: [{ printSizeId: t20Size.id, frameDesignId: t20Frame.id, quantity: 1 }],
    });
    if (!created.success || !created.package) throw new Error("create failed");
    t20PkgIds.push(created.package.id);
    const f = await deleteFrameDesign({ id: t20Frame.id, tenantId: lumina.id, tenantSlug: "lumina-cine" });
    harness.assertEqual(f.success, false, "Frame delete refused");
    harness.assertEqual("error" in f ? f.error : "", "IN_USE", "Frame IN_USE");
    harness.assertEqual("message" in f ? f.message : "", "This is used by a package or an order. Hide it instead.", "Frame message");
    const s = await deletePrintSize({ id: t20Size.id, tenantId: lumina.id, tenantSlug: "lumina-cine" });
    harness.assertEqual("error" in s ? s.error : "", "IN_USE", "Size IN_USE");
    harness.assertEqual(await db.frameDesign.count({ where: { id: t20Frame.id } }), 1, "Frame still exists");
    harness.assertEqual(await db.printSize.count({ where: { id: t20Size.id } }), 1, "Size still exists");
  });

  await harness.test("T20-PKG-05: a size can be hidden and shown again", async () => {
    const hide = await togglePrintSizeAvailability({ id: t20Size.id, tenantId: lumina.id, tenantSlug: "lumina-cine", isAvailable: false });
    harness.assertEqual(hide.success, true, "Hide ok");
    harness.assertEqual((await db.printSize.findUnique({ where: { id: t20Size.id } }))?.isAvailable, false, "Hidden");
    const refused = await updateServicePackage({
      ...pkgBase,
      id: t20PkgIds[0]!,
      includedPrints: [{ printSizeId: t20Size.id, frameDesignId: "frm_lum_black", quantity: 1 }],
    });
    harness.assertEqual(refused.success, false, "A hidden size can't be added to a package");
    await togglePrintSizeAvailability({ id: t20Size.id, tenantId: lumina.id, tenantSlug: "lumina-cine", isAvailable: true });
  });

  await harness.test("T20-PKG-04: the studio's mat board price can be changed", async () => {
    const res = await updateMatBoardPrice({ tenantId: lumina.id, tenantSlug: "lumina-cine", price: 30 });
    harness.assertEqual(res.success, true, "Saved");
    harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.matBoardPrice, 30, "Tenant has 30");
    const bad = await updateMatBoardPrice({ tenantId: lumina.id, tenantSlug: "lumina-cine", price: -1 });
    harness.assertEqual(bad.success, false, "Negative price refused");
  });

  await harness.test("T20-PKG-06: a package keeps a since-hidden line when edited, but cannot add a new hidden one", async () => {
    const hiddenFrame = await db.frameDesign.create({
      data: { tenantId: lumina.id, name: "T20 Hidden Frame", material: "Wood", moldingWidth: 1, frameColor: "#111111", previewAsset: "/x.png", priceOffset: 0 },
    });
    harness.registerTeardown(async () => {
      await db.servicePackage.deleteMany({ where: { name: "T20 Print Pkg" } });
      await db.frameDesign.deleteMany({ where: { id: hiddenFrame.id } });
    });
    const line = { printSizeId: "psz_lum_8r", frameDesignId: hiddenFrame.id, quantity: 2 };
    const created = await createServicePackage({ ...pkgBase, includedPrints: [line] });
    if (!created.success || !created.package) throw new Error("create failed");
    await db.frameDesign.update({ where: { id: hiddenFrame.id }, data: { isAvailable: false } });
    const edited = await updateServicePackage({ ...pkgBase, id: created.package.id, price: 600, includedPrints: [line] });
    harness.assertEqual(edited.success, true, "Edit with the hidden line succeeds");
    harness.assertEqual((await db.servicePackage.findUnique({ where: { id: created.package.id } }))?.price, 600, "Price changed");
    const kept = await db.packageIncludedPrint.findMany({ where: { packageId: created.package.id } });
    harness.assertEqual(kept.length, 1, "Line kept");
    const added = await updateServicePackage({
      ...pkgBase,
      id: created.package.id,
      includedPrints: [line, { printSizeId: "psz_lum_12r", frameDesignId: hiddenFrame.id, quantity: 1 }],
    });
    harness.assertEqual(added.success, false, "A new line with a hidden frame is refused");
    const createHidden = await createServicePackage({ ...pkgBase, includedPrints: [line] });
    harness.assertEqual(createHidden.success, false, "Create requires everything available");
  });

  // ---- Booking snapshot, backfill and manual grants ----
  const DAY_MS = 86_400_000;
  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  const owner = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!owner) throw new Error("Seed owner required");
  const ownerSession = { id: owner.id, email: owner.email, name: owner.name, role: owner.role, tenantId: owner.tenantId, tenantSlug: "lumina-cine" };
  harness.registerTeardown(async () => {
    await db.project.deleteMany({ where: { client: { email: { startsWith: "t20-" } } } });
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t20-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t20-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t20-" } } });
  });
  let seq = 0;
  const bookT20 = async () => {
    seq += 1;
    const slot = await db.bookingSlot.create({
      data: { tenantId: lumina.id, category: "commercial", date: new Date(Date.now() + (200 + seq) * DAY_MS), startTime: "10:00 AM", endTime: "11:00 AM", status: "AVAILABLE", price: 0, depositRequired: 100 },
    });
    slotIds.push(slot.id);
    const clientEmail = `t20-${run}-${seq}@example.test`;
    const res = await withSession(null, () =>
      processBookingCheckout({
        tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, sessionId: `t20-${run}-${seq}`,
        clientName: "Print Client", clientEmail, clientPhone: "0123456789", paymentMethod: "CASH", packageId: "pkg_lumina_comm",
      })
    );
    if (!res.success) throw new Error("checkout failed: " + JSON.stringify(res));
    const booking = await db.clientBooking.findFirstOrThrow({ where: { trackingCode: res.trackingCode! } });
    const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, email: clientEmail } });
    return { booking, client };
  };
  const snapBooking = await bookT20();

  await harness.test("T20-SNAP-01: a package booking snapshots its included prints", async () => {
    const rows = await db.bookingIncludedPrint.findMany({ where: { bookingId: snapBooking.booking.id } });
    harness.assertEqual(rows.length, 1, "One line");
    harness.assertEqual(rows[0]?.source, "PACKAGE", "Source PACKAGE");
    harness.assertEqual(rows[0]?.quantity, 1, "Quantity 1");
    const frame = await db.frameDesign.findUniqueOrThrow({ where: { id: "frm_lum_black" } });
    harness.assertEqual(rows[0]?.frameName, frame.name, "Frame name snapshotted");
    harness.assertEqual(rows[0]?.printSizeId, "psz_lum_8r", "Size id");
    harness.assertEqual((rows[0]?.sizeCode.length ?? 0) > 0, true, "Size code snapshotted");
    const again = await db.$transaction((tx) => snapshotIncludedPrints(tx, snapBooking.booking, "PACKAGE"));
    harness.assertEqual(again, 0, "No-op when rows already exist");
  });

  await harness.test("T20-SNAP-02: changing the package later leaves the booking's prints alone", async () => {
    const pkg = await db.servicePackage.findUniqueOrThrow({ where: { id: "pkg_lumina_comm" } });
    const original = await db.packageIncludedPrint.findMany({ where: { packageId: pkg.id } });
    try {
      const res = await updateServicePackage({
        tenantId: lumina.id, tenantSlug: "lumina-cine", id: pkg.id, name: pkg.name, category: pkg.category,
        discipline: pkg.discipline as "PHOTOGRAPHY", price: pkg.price, depositPrice: pkg.depositPrice, turnaround: pkg.turnaround,
        description: pkg.description, deliverables: pkg.deliverables, isFeatured: pkg.isFeatured,
        includedPrints: [{ printSizeId: "psz_lum_12r", frameDesignId: "frm_lum_black", quantity: 5 }],
      });
      harness.assertEqual(res.success, true, "Package updated");
      const rows = await db.bookingIncludedPrint.findMany({ where: { bookingId: snapBooking.booking.id } });
      harness.assertEqual(rows.length, 1, "Still one line");
      harness.assertEqual(rows[0]?.printSizeId, "psz_lum_8r", "Still the old size");
      harness.assertEqual(rows[0]?.quantity, 1, "Still quantity 1");
    } finally {
      await db.packageIncludedPrint.deleteMany({ where: { packageId: pkg.id } });
      await db.packageIncludedPrint.createMany({ data: original.map(({ packageId, printSizeId, frameDesignId, quantity }) => ({ packageId, printSizeId, frameDesignId, quantity })) });
    }
  });

  await harness.test("T20-SNAP-03: hiding the frame does not remove the line from the entitlements", async () => {
    const project = await db.project.create({
      data: {
        tenantId: lumina.id, projectNumber: `T20-${run}-${Math.random().toString(36).slice(2, 6)}`, title: "T20 Project",
        clientId: snapBooking.client.id, studioLeadId: owner.id, discipline: "PHOTOGRAPHY", bookingId: snapBooking.booking.id, budget: 100,
      },
    });
    await db.frameDesign.update({ where: { id: "frm_lum_black" }, data: { isAvailable: false } });
    try {
      const ent = await loadProjectEntitlements(project.id);
      harness.assertEqual(ent.lines.length, 1, "Line still listed");
      harness.assertEqual(ent.lines[0]?.remaining, 1, "Remaining 1");
      harness.assertEqual(ent.unlocked, false, "Not unlocked");
      harness.assertEqual(ent.hasPhotos, false, "No photos");
      const map = await remainingForLines(db, [ent.lines[0]!.id]);
      harness.assertEqual(map.get(ent.lines[0]!.id), 1, "remainingForLines");
    } finally {
      await db.frameDesign.update({ where: { id: "frm_lum_black" }, data: { isAvailable: true } });
    }
  });

  await harness.test("T20-BACKFILL-01: backfill recreates missing lines once", async () => {
    const b = await bookT20();
    await db.bookingIncludedPrint.deleteMany({ where: { bookingId: b.booking.id } });
    const first = await backfillIncludedPrints();
    harness.assertEqual(first.bookings >= 1, true, "At least this booking");
    const rows = await db.bookingIncludedPrint.findMany({ where: { bookingId: b.booking.id } });
    harness.assertEqual(rows.length, 1, "Line recreated");
    harness.assertEqual(rows[0]?.source, "BACKFILL", "Source BACKFILL");
    const second = await backfillIncludedPrints();
    harness.assertEqual(second.lines, 0, "Second run creates nothing");
    harness.assertEqual(await db.bookingIncludedPrint.count({ where: { bookingId: b.booking.id } }), 1, "Still one line");
  });

  await harness.test("T20-BACKFILL-02: a manual grant made first doesn't stop the backfill adding the package's prints", async () => {
    const b = await bookT20();
    await db.bookingIncludedPrint.deleteMany({ where: { bookingId: b.booking.id } });
    const granted = await withSession(ownerSession, () =>
      grantIncludedPrint({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: b.booking.id, printSizeId: "psz_lum_12r", frameDesignId: "frm_lum_black", quantity: 1 })
    );
    harness.assertEqual(granted.success, true, "Manual line granted");
    await backfillIncludedPrints();
    const rows = await db.bookingIncludedPrint.findMany({ where: { bookingId: b.booking.id } });
    harness.assertEqual(JSON.stringify(rows.map((r) => r.source).sort()), JSON.stringify(["BACKFILL", "MANUAL"]), "Package prints backfilled beside the manual line");
    await backfillIncludedPrints();
    harness.assertEqual(await db.bookingIncludedPrint.count({ where: { bookingId: b.booking.id } }), 2, "Running again adds nothing");
    const again = await db.$transaction((tx) => snapshotIncludedPrints(tx, b.booking, "PACKAGE"));
    harness.assertEqual(again, 0, "Snapshot is a no-op once package prints exist");
  });

  await harness.test("T20-GRANT-01: staff can grant and remove a manual included print", async () => {
    const base = { tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: snapBooking.booking.id };
    const res = await withSession(ownerSession, () =>
      grantIncludedPrint({ ...base, printSizeId: "psz_lum_12r", frameDesignId: "frm_lum_black", quantity: 2, note: "Goodwill" })
    );
    harness.assertEqual(res.success, true, "Granted");
    const line = await db.bookingIncludedPrint.findFirstOrThrow({ where: { bookingId: base.bookingId, source: "MANUAL" } });
    harness.assertEqual(line.quantity, 2, "Quantity 2");
    harness.assertEqual(line.grantedById, owner.id, "Granted by staff");
    harness.assertEqual(line.note, "Goodwill", "Note");
    const map = await remainingForLines(db, [line.id]);
    harness.assertEqual(map.get(line.id), 2, "Remaining 2");
    const bad = await withSession(ownerSession, () =>
      grantIncludedPrint({ ...base, printSizeId: "psz_apx_8r", frameDesignId: "frm_lum_black", quantity: 1 })
    );
    harness.assertEqual(bad.success, false, "Another studio's size refused");
    const rm = await withSession(ownerSession, () => removeIncludedPrint({ tenantId: lumina.id, tenantSlug: "lumina-cine", lineId: line.id }));
    harness.assertEqual(rm.success, true, "Removed");
    harness.assertEqual(await db.bookingIncludedPrint.count({ where: { id: line.id } }), 0, "Gone");
    const pkgLine = await db.bookingIncludedPrint.findFirstOrThrow({ where: { bookingId: base.bookingId, source: "PACKAGE" } });
    const rmPkg = await withSession(ownerSession, () => removeIncludedPrint({ tenantId: lumina.id, tenantSlug: "lumina-cine", lineId: pkgLine.id }));
    harness.assertEqual(rmPkg.success, false, "Package lines cannot be removed");
  });

  await harness.test("T20-GRANT-02: a client cannot grant included prints", async () => {
    const before = await db.bookingIncludedPrint.count({ where: { bookingId: snapBooking.booking.id } });
    const clientSession = { id: snapBooking.client.id, email: snapBooking.client.email, name: snapBooking.client.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" };
    const res = await withSession(clientSession, () =>
      grantIncludedPrint({ tenantId: lumina.id, tenantSlug: "lumina-cine", bookingId: snapBooking.booking.id, printSizeId: "psz_lum_8r", frameDesignId: "frm_lum_black", quantity: 1 })
    );
    harness.assertEqual(res.success, false, "Refused");
    harness.assertEqual(await db.bookingIncludedPrint.count({ where: { bookingId: snapBooking.booking.id } }), before, "Nothing added");
  });

  await harness.test("T20-PKG-07: a frame used only by a booking's included print cannot be deleted", async () => {
    const f = await db.frameDesign.create({
      data: { tenantId: lumina.id, name: "T20 Booking Frame", material: "Wood", moldingWidth: 1, frameColor: "#222222", previewAsset: "/x.png", priceOffset: 0 },
    });
    harness.registerTeardown(async () => {
      await db.bookingIncludedPrint.deleteMany({ where: { frameDesignId: f.id } });
      await db.frameDesign.deleteMany({ where: { id: f.id } });
    });
    await db.bookingIncludedPrint.create({
      data: {
        tenantId: lumina.id, bookingId: snapBooking.booking.id, printSizeId: "psz_lum_8r", frameDesignId: f.id, quantity: 1,
        sizeCode: "8R", sizeName: "8R", widthInches: 8, heightInches: 10, frameName: f.name, source: "MANUAL",
      },
    });
    const res = await deleteFrameDesign({ id: f.id, tenantId: lumina.id, tenantSlug: "lumina-cine" });
    harness.assertEqual("error" in res ? res.error : "", "IN_USE", "IN_USE");
    harness.assertEqual(await db.frameDesign.count({ where: { id: f.id } }), 1, "Frame kept");
  });
  // ---- Shipping zones (admin) ----
  const seedZones = zones.map((z) => ({ name: z.name, fee: z.fee, states: parseZoneStates(z.statesJson) }));
  harness.registerTeardown(async () => {
    await withSession(ownerSession, () => saveShippingZones({ tenantId: lumina.id, tenantSlug: "lumina-cine", zones: seedZones }));
  });
  const zoneBase = { tenantId: lumina.id, tenantSlug: "lumina-cine" };

  await harness.test("T20-ZONES-01: saving zones replaces the tenant's zones and zoneForState follows", async () => {
    const res = await withSession(ownerSession, () =>
      saveShippingZones({ ...zoneBase, zones: [
        { name: "East", fee: 12.5, states: ["Sarawak", "Sabah"] },
        { name: "West", fee: 25, states: ["Selangor"] },
      ] })
    );
    harness.assertEqual(res.success, true, "Saved");
    const rows = await db.shippingZone.findMany({ where: { tenantId: lumina.id }, orderBy: { sortOrder: "asc" } });
    harness.assertEqual(rows.length, 2, "Old zones replaced");
    harness.assertEqual(JSON.stringify(zoneForState(rows, "Sabah")), JSON.stringify({ name: "East", fee: 12.5 }), "Sabah");
    harness.assertEqual(JSON.stringify(zoneForState(rows, "Selangor")), JSON.stringify({ name: "West", fee: 25 }), "Selangor");
    harness.assertEqual(zoneForState(rows, "Johor"), null, "Uncovered state");
    const none = await withSession(ownerSession, () => saveShippingZones({ ...zoneBase, zones: [] }));
    harness.assertEqual(none.success, true, "Zero zones allowed");
    harness.assertEqual(await db.shippingZone.count({ where: { tenantId: lumina.id } }), 0, "Pickup only");
  });

  await harness.test("T20-ZONES-02: a state in two zones is rejected and nothing changes", async () => {
    await withSession(ownerSession, () => saveShippingZones({ ...zoneBase, zones: seedZones }));
    const res = await withSession(ownerSession, () =>
      saveShippingZones({ ...zoneBase, zones: [
        { name: "A", fee: 10, states: ["Sabah", "Sarawak"] },
        { name: "B", fee: 20, states: ["Sabah"] },
      ] })
    );
    harness.assertEqual(res.success, false, "Rejected");
    harness.assertEqual("message" in res ? res.message : "", "Sabah is in two zones.", "Message");
    harness.assertEqual(await db.shippingZone.count({ where: { tenantId: lumina.id } }), 3, "Seed zones kept");
    const bad = await withSession(ownerSession, () =>
      saveShippingZones({ ...zoneBase, zones: [{ name: "A", fee: 10, states: ["Narnia"] }] })
    );
    harness.assertEqual(bad.success, false, "Unknown state rejected");
  });

  await harness.test("T20-ZONES-03: a zero fee or empty name is rejected", async () => {
    const free = await withSession(ownerSession, () =>
      saveShippingZones({ ...zoneBase, zones: [{ name: "Free", fee: 0, states: ["Sabah"] }] })
    );
    harness.assertEqual(free.success, false, "Rejected");
    harness.assertEqual("message" in free ? free.message : "", "Shipping fee must be more than 0.", "Message");
    const noName = await withSession(ownerSession, () =>
      saveShippingZones({ ...zoneBase, zones: [{ name: "  ", fee: 5, states: ["Sabah"] }] })
    );
    harness.assertEqual(noName.success, false, "Empty name rejected");
    harness.assertEqual(await db.shippingZone.count({ where: { tenantId: lumina.id } }), 3, "Zones untouched");
  });

  await harness.test("T20-ZONES-04: a client and another tenant's staff cannot save zones", async () => {
    const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
    const apexOwner = apex && (await db.user.findFirst({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } }));
    if (!apex || !apexOwner) throw new Error("apex-media owner required");
    const payload = { ...zoneBase, zones: [{ name: "Hack", fee: 1, states: ["Sabah"] }] };
    const clientSession = { id: snapBooking.client.id, email: snapBooking.client.email, name: snapBooking.client.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" };
    const apexSession = { id: apexOwner.id, email: apexOwner.email, name: apexOwner.name, role: apexOwner.role, tenantId: apex.id, tenantSlug: "apex-media" };
    harness.assertEqual((await withSession(clientSession, () => saveShippingZones(payload))).success, false, "Client refused");
    harness.assertEqual((await withSession(apexSession, () => saveShippingZones(payload))).success, false, "Other tenant refused");
    harness.assertEqual(await db.shippingZone.count({ where: { tenantId: lumina.id } }), 3, "Zones untouched");
  });

  // ---- Placing an order ----
  harness.registerTeardown(async () => {
    await db.printOrder.deleteMany({ where: { client: { email: { startsWith: "t20-" } } } });
  });
  const sessionOf = (u: { id: string; email: string; name: string }) => ({
    id: u.id, email: u.email, name: u.name, role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine",
  });
  /** A booking from the seed package (one included 8R + black frame) with its gallery holding one photo. */
  const makeOrderProject = async (paid: boolean) => {
    const { booking, client } = await bookT20();
    const project = await db.project.create({
      data: {
        tenantId: lumina.id, projectNumber: `T20O-${run}-${Math.random().toString(36).slice(2, 8)}`, title: "T20 Order Project",
        clientId: client.id, studioLeadId: owner.id, discipline: "PHOTOGRAPHY", bookingId: booking.id, budget: 100, isFinalBalancePaid: paid,
      },
    });
    const deliverable = await db.clientDeliverable.create({
      data: {
        projectId: project.id, title: "T20 Gallery", discipline: "PHOTOGRAPHY",
        items: { create: [
          { itemType: "PHOTO", title: "Photo One", previewUrl: "/t20/p1-preview.jpg", downloadUrl: "/t20/p1-master.jpg" },
          { itemType: "VIDEO", title: "Film", previewUrl: "/t20/v.mp4", downloadUrl: "/t20/v.mp4" },
        ] },
      },
      include: { items: true },
    });
    const photo = deliverable.items.find((i) => i.itemType === "PHOTO")!;
    const video = deliverable.items.find((i) => i.itemType === "VIDEO")!;
    const line = await db.bookingIncludedPrint.findFirstOrThrow({ where: { bookingId: booking.id } });
    return { project, client, session: sessionOf(client), photo, video, line };
  };
  type OrderProject = Awaited<ReturnType<typeof makeOrderProject>>;
  const orderBase = { tenantId: lumina.id, tenantSlug: "lumina-cine" };
  const includedItem = (p: OrderProject) => ({
    kind: "INCLUDED" as const, bookingIncludedPrintId: p.line.id, deliverableItemId: p.photo.id, orientation: "PORTRAIT" as const,
    printSizeId: "psz_lum_8r", frameDesignId: "frm_lum_black", matBoardType: "NONE" as const,
  });
  const paidItem = (p: OrderProject, printSizeId = "psz_lum_12r", frameDesignId = "frm_lum_walnut") => ({
    kind: "PAID" as const, deliverableItemId: p.photo.id, orientation: "LANDSCAPE" as const,
    printSizeId, frameDesignId, matBoardType: "NONE" as const,
  });
  const address = (state: (typeof MY_STATES)[number]) => ({
    recipientName: "Print Client", recipientPhone: "0123456789", line1: "1 Jalan Test", postcode: "93000", city: "Kuching", state,
  });
  const errOf = (r: { success: boolean }) => ("error" in r ? (r as { error: string }).error : "");
  const msgOf = (r: { success: boolean }) => ("message" in r ? (r as { message: string }).message : "");

  const unpaid = await makeOrderProject(false);
  const paidA = await makeOrderProject(true);

  await harness.test("T20-ORDER-01: an unpaid project is locked for the client and for staff", async () => {
    const input: PlaceOrderInput = { ...orderBase, projectId: unpaid.project.id, items: [includedItem(unpaid)], fulfilment: "PICKUP" };
    const asClient = await withSession(unpaid.session, () => placePrintOrder(input));
    harness.assertEqual(errOf(asClient), "LOCKED", "Client LOCKED");
    harness.assertEqual(msgOf(asClient), "Framed prints unlock when your balance is paid.", "Message");
    const asStaff = await withSession(ownerSession, () => placePrintOrder(input));
    harness.assertEqual(errOf(asStaff), "LOCKED", "Staff LOCKED too");
    harness.assertEqual(await db.printOrder.count({ where: { projectId: unpaid.project.id } }), 0, "No order");
  });

  let order02Id = "";
  await harness.test("T20-ORDER-02: a free included pickup order is NEW with no invoice and uses up the line", async () => {
    const res = await withSession(paidA.session, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [includedItem(paidA)], fulfilment: "PICKUP" })
    );
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    order02Id = res.orderId;
    harness.assertEqual(res.checkoutUrl, null, "No checkout");
    harness.assertEqual(/^PO-\d{4}-\d{4}$/.test(res.orderNumber), true, "Order number format");
    const order = await db.printOrder.findUniqueOrThrow({ where: { id: res.orderId }, include: { items: true } });
    harness.assertEqual(order.status, "NEW", "Status NEW");
    harness.assertEqual(order.invoiceId, null, "No invoice");
    harness.assertEqual(order.totalAmount, 0, "Total 0");
    harness.assertEqual(order.clientId, paidA.client.id, "Client");
    harness.assertEqual(order.placedById, paidA.client.id, "Placed by client");
    harness.assertEqual(order.items.length, 1, "One item");
    harness.assertEqual(order.items[0]?.kind, "INCLUDED", "Included item");
    harness.assertEqual(order.items[0]?.photoTitle, "Photo One", "Photo snapshotted");
    harness.assertEqual(order.items[0]?.sizeCode, "8R", "Size snapshotted");
    const map = await remainingForLines(db, [paidA.line.id]);
    harness.assertEqual(map.get(paidA.line.id), 0, "Remaining 0");
  });

  await harness.test("T20-ORDER-03: the same included line again is refused", async () => {
    const res = await withSession(paidA.session, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [includedItem(paidA)], fulfilment: "PICKUP" })
    );
    harness.assertEqual(errOf(res), "NONE_LEFT", "NONE_LEFT");
    harness.assertEqual(msgOf(res), "You've already claimed all of these prints.", "Message");
    const twice = await withSession(ownerSession, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [includedItem(paidA), includedItem(paidA)], fulfilment: "PICKUP" })
    );
    harness.assertEqual(errOf(twice), "NONE_LEFT", "Two in one cart for one unit refused");
  });

  await harness.test("T20-ORDER-04: two orders racing for the last included print, exactly one wins", async () => {
    await db.printOrder.update({ where: { id: order02Id }, data: { status: "CANCELLED" } });
    harness.assertEqual((await remainingForLines(db, [paidA.line.id])).get(paidA.line.id), 1, "Cancel returns the print");
    const input: PlaceOrderInput = { ...orderBase, projectId: paidA.project.id, items: [includedItem(paidA)], fulfilment: "PICKUP" };
    const results = await withSession(paidA.session, () => Promise.all([placePrintOrder(input), placePrintOrder(input)]));
    harness.assertEqual(results.filter((r) => r.success).length, 1, "Exactly one success");
    harness.assertEqual(
      await db.printOrderItem.count({ where: { bookingIncludedPrintId: paidA.line.id, order: { status: { not: "CANCELLED" } } } }),
      1,
      "One live claim"
    );
    harness.assertEqual((await remainingForLines(db, [paidA.line.id])).get(paidA.line.id), 0, "Remaining 0");
  });

  await harness.test("T20-ORDER-05: an upgraded included print shipped to Sarawak pays the upgrade plus the zone fee", async () => {
    const p = await makeOrderProject(true);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });
    const [s8, s12, black] = await Promise.all([
      db.printSize.findUniqueOrThrow({ where: { id: "psz_lum_8r" } }),
      db.printSize.findUniqueOrThrow({ where: { id: "psz_lum_12r" } }),
      db.frameDesign.findUniqueOrThrow({ where: { id: "frm_lum_black" } }),
    ]);
    const expected = upgradeAmount(
      framedPrice({ sizePrice: s12.basePrice, framePrice: black.priceOffset, mat: "WHITE_2INCH", matBoardPrice: tenant.matBoardPrice }),
      framedPrice({ sizePrice: s8.basePrice, framePrice: black.priceOffset, mat: "NONE", matBoardPrice: tenant.matBoardPrice })
    );
    harness.assertEqual(expected > 0, true, "A real upgrade");
    const input: PlaceOrderInput = {
      ...orderBase, projectId: p.project.id, fulfilment: "SHIP", address: address("Sarawak"),
      items: [{ ...includedItem(p), printSizeId: "psz_lum_12r", matBoardType: "WHITE_2INCH" }],
    };
    const quote = await withSession(p.session, () => quotePrintOrder(input));
    if (!quote.success) throw new Error("quote failed: " + JSON.stringify(quote));
    harness.assertEqual(quote.items[0]?.upgradeAmount, expected, "Quoted upgrade");
    harness.assertEqual(quote.shippingFee, 10, "Quoted fee");
    harness.assertEqual(quote.total, expected + 10, "Quoted total");
    harness.assertEqual(await db.printOrder.count({ where: { projectId: p.project.id } }), 0, "A quote places nothing");
    const res = await withSession(p.session, () => placePrintOrder(input));
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    const order = await db.printOrder.findUniqueOrThrow({ where: { id: res.orderId }, include: { items: true, invoice: true } });
    harness.assertEqual(order.items[0]?.upgradeAmount, expected, "Upgrade amount");
    harness.assertEqual(order.items[0]?.lineAmount, expected, "Line amount is the upgrade");
    harness.assertEqual(order.shippingFee, 10, "Fee 10");
    harness.assertEqual(order.shippingZoneName, "Local", "Zone snapshotted");
    harness.assertEqual(order.state, "Sarawak", "Address snapshotted");
    harness.assertEqual(order.status, "AWAITING_PAYMENT", "Awaiting payment");
    harness.assertEqual(order.invoice?.amount, expected + 10, "Invoice amount");
    harness.assertEqual(order.invoice?.milestoneType, "PRINT_FRAME_ORDER", "Invoice type");
    harness.assertEqual(order.invoice?.status, "PENDING", "Invoice pending");
    harness.assertEqual(order.invoice?.clientId, p.client.id, "Invoice client");
    harness.assertEqual(order.invoice?.projectId, p.project.id, "Invoice project");
    harness.assertEqual(order.invoice?.description, `Framed prints ${order.orderNumber}`, "Invoice description");
    harness.assertEqual(res.checkoutUrl, `/lumina-cine/checkout?invoiceId=${order.invoiceId}`, "Checkout URL");
  });

  await harness.test("T20-ORDER-06: two paid prints and one included print ship as one order with one fee and one invoice", async () => {
    const p = await makeOrderProject(true);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });
    const [s12, s16, walnut, gold] = await Promise.all([
      db.printSize.findUniqueOrThrow({ where: { id: "psz_lum_12r" } }),
      db.printSize.findUniqueOrThrow({ where: { id: "psz_lum_16r" } }),
      db.frameDesign.findUniqueOrThrow({ where: { id: "frm_lum_walnut" } }),
      db.frameDesign.findUniqueOrThrow({ where: { id: "frm_lum_gold" } }),
    ]);
    const paid1 = framedPrice({ sizePrice: s12.basePrice, framePrice: walnut.priceOffset, mat: "NONE", matBoardPrice: tenant.matBoardPrice });
    const paid2 = framedPrice({ sizePrice: s16.basePrice, framePrice: gold.priceOffset, mat: "OFFWHITE_2INCH", matBoardPrice: tenant.matBoardPrice });
    const res = await withSession(ownerSession, () =>
      placePrintOrder({
        ...orderBase, projectId: p.project.id, fulfilment: "SHIP", address: address("Selangor"),
        items: [paidItem(p), { ...paidItem(p, "psz_lum_16r", "frm_lum_gold"), matBoardType: "OFFWHITE_2INCH" }, includedItem(p)],
      })
    );
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    const orders = await db.printOrder.findMany({ where: { projectId: p.project.id }, include: { items: true, invoice: true } });
    harness.assertEqual(orders.length, 1, "One order");
    const order = orders[0]!;
    harness.assertEqual(order.items.length, 3, "Three items");
    harness.assertEqual(order.shippingFee, 30, "One fee 30");
    harness.assertEqual(order.itemsTotal, paid1 + paid2, "Items total = paid prints, included free");
    harness.assertEqual(order.totalAmount, paid1 + paid2 + 30, "Total");
    harness.assertEqual(order.invoice?.amount, paid1 + paid2 + 30, "Invoice amount");
    harness.assertEqual(await db.milestoneInvoice.count({ where: { projectId: p.project.id, milestoneType: "PRINT_FRAME_ORDER" } }), 1, "One invoice");
    harness.assertEqual(order.placedById, owner.id, "Placed by staff");
    harness.assertEqual(order.clientId, p.client.id, "For the project's client");
  });

  await harness.test("T20-ORDER-07: shipping to a state no zone covers is refused", async () => {
    await withSession(ownerSession, () => saveShippingZones({ ...zoneBase, zones: seedZones.filter((z) => z.name !== "Peninsular") }));
    try {
      const res = await withSession(paidA.session, () =>
        placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [paidItem(paidA)], fulfilment: "SHIP", address: address("Johor") })
      );
      harness.assertEqual(errOf(res), "NO_SHIPPING", "NO_SHIPPING");
      harness.assertEqual(msgOf(res), "We don't ship to Johor yet. Choose pickup.", "Message");
      const noAddress = await withSession(paidA.session, () =>
        placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [paidItem(paidA)], fulfilment: "SHIP" })
      );
      harness.assertEqual(noAddress.success, false, "Ship without an address refused");
    } finally {
      await withSession(ownerSession, () => saveShippingZones({ ...zoneBase, zones: seedZones }));
    }
  });

  await harness.test("T20-ORDER-08: another client, a foreign photo or a video is refused", async () => {
    const before = await db.printOrder.count({ where: { projectId: paidA.project.id } });
    const asOther = await withSession(unpaid.session, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [paidItem(paidA)], fulfilment: "PICKUP" })
    );
    harness.assertEqual(asOther.success, false, "Another client refused");
    const foreignPhoto = await withSession(paidA.session, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [{ ...paidItem(paidA), deliverableItemId: unpaid.photo.id }], fulfilment: "PICKUP" })
    );
    harness.assertEqual(foreignPhoto.success, false, "Photo from another project refused");
    const video = await withSession(paidA.session, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [{ ...paidItem(paidA), deliverableItemId: paidA.video.id }], fulfilment: "PICKUP" })
    );
    harness.assertEqual(video.success, false, "A video can't be printed");
    const foreignLine = await withSession(ownerSession, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [{ ...includedItem(paidA), bookingIncludedPrintId: unpaid.line.id }], fulfilment: "PICKUP" })
    );
    harness.assertEqual(foreignLine.success, false, "Another booking's included print refused");
    const signedOut = await withSession(null, () =>
      placePrintOrder({ ...orderBase, projectId: paidA.project.id, items: [paidItem(paidA)], fulfilment: "PICKUP" })
    );
    harness.assertEqual(signedOut.success, false, "Signed out refused");
    harness.assertEqual(await db.printOrder.count({ where: { projectId: paidA.project.id } }), before, "Nothing placed");
  });

  await harness.test("T20-ORDER-09: saveAddress stores the delivery address on the client", async () => {
    const res = await withSession(paidA.session, () =>
      placePrintOrder({
        ...orderBase, projectId: paidA.project.id, items: [paidItem(paidA)], fulfilment: "SHIP",
        address: { ...address("Sabah"), line2: "Taman Uji", city: "Kota Kinabalu", postcode: "88000" }, saveAddress: true,
      })
    );
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    const u = await db.user.findUniqueOrThrow({ where: { id: paidA.client.id } });
    harness.assertEqual(u.shipRecipient, "Print Client", "Recipient");
    harness.assertEqual(u.shipPhone, "0123456789", "Phone");
    harness.assertEqual(u.shipLine1, "1 Jalan Test", "Line 1");
    harness.assertEqual(u.shipLine2, "Taman Uji", "Line 2");
    harness.assertEqual(u.shipPostcode, "88000", "Postcode");
    harness.assertEqual(u.shipCity, "Kota Kinabalu", "City");
    harness.assertEqual(u.shipState, "Sabah", "State");
    const order = await db.printOrder.findUniqueOrThrow({ where: { id: res.orderId } });
    harness.assertEqual(order.shippingFee, 20, "Sabah zone fee");
  });

  // ---- Payment, cancel and void ----
  /** An order from ORDER-05's cart: upgraded included print shipped to Sarawak, so it awaits payment. */
  const placeAwaiting = async () => {
    const p = await makeOrderProject(true);
    const res = await withSession(p.session, () =>
      placePrintOrder({
        ...orderBase, projectId: p.project.id, fulfilment: "SHIP", address: address("Sarawak"),
        items: [{ ...includedItem(p), printSizeId: "psz_lum_12r", matBoardType: "WHITE_2INCH" }],
      })
    );
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    const order = await db.printOrder.findUniqueOrThrow({ where: { id: res.orderId }, include: { invoice: true } });
    if (order.status !== "AWAITING_PAYMENT" || !order.invoice) throw new Error("expected an order awaiting payment");
    return { p, orderId: order.id, invoice: order.invoice };
  };
  type Awaiting = Awaited<ReturnType<typeof placeAwaiting>>;
  const orderStatus = async (id: string) => (await db.printOrder.findUniqueOrThrow({ where: { id } })).status;
  const invoiceStatus = async (id: string) => (await db.milestoneInvoice.findUniqueOrThrow({ where: { id } })).status;
  const remainingOf = async (p: OrderProject) => (await remainingForLines(db, [p.line.id])).get(p.line.id);
  const payByCard = async (a: Awaiting) => {
    const prev = process.env.ALLOW_SIMULATED_CARD_PAYMENTS;
    process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "true";
    try {
      return await withSession(a.p.session, () =>
        processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "CARD" })
      );
    } finally {
      process.env.ALLOW_SIMULATED_CARD_PAYMENTS = prev;
    }
  };

  await harness.test("T20-PAY-01: paying the order's invoice by card moves the order to NEW", async () => {
    const a = await placeAwaiting();
    const res = await payByCard(a);
    harness.assertEqual(res.success, true, "Card payment succeeds");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "Invoice PAID");
    harness.assertEqual(await orderStatus(a.orderId), "NEW", "Order NEW");
    await db.$transaction((tx) => markPrintOrderPaid(tx, a.invoice.id));
    harness.assertEqual(await orderStatus(a.orderId), "NEW", "Marking paid again changes nothing");
    harness.assertEqual(await remainingOf(a.p), 0, "Included print still claimed");
  });

  await harness.test("T20-PAY-02: a QR slip approved by the studio moves the order to NEW", async () => {
    const a = await placeAwaiting();
    const slip = await withSession(a.p.session, () =>
      processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "QR_CODE", paymentProofUrl: "/t20/slip.jpg" })
    );
    harness.assertEqual(slip.success, true, "Slip sent");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PENDING_VERIFICATION", "Invoice awaiting verification");
    harness.assertEqual(await orderStatus(a.orderId), "AWAITING_PAYMENT", "Order still awaiting payment");
    const approved = await withSession(ownerSession, () =>
      approvePaymentVerification({ invoiceId: a.invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assertEqual(approved.success, true, "Approved");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "Invoice PAID");
    harness.assertEqual(await orderStatus(a.orderId), "NEW", "Order NEW");
  });

  await harness.test("T20-PAY-03: a Toyyibpay payment settled for the invoice moves the order to NEW", async () => {
    const a = await placeAwaiting();
    const saved = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });
    const realFetch = globalThis.fetch;
    const billCode = `t20bill${run}`;
    await db.tenant.update({ where: { id: lumina.id }, data: { toyyibpaySecretEnc: encryptSecret("sk-t20"), toyyibpayCategoryCode: "cat-t20" } });
    await db.milestoneInvoice.update({ where: { id: a.invoice.id }, data: { gatewayBillCode: billCode, paymentMethod: "CARD" } });
    // The gateway's getBillTransactions answer: one successful payment of exactly this invoice.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { billpaymentStatus: "1", billpaymentAmount: a.invoice.amount.toFixed(2), billpaymentInvoiceNo: "TP-T20", billExternalReferenceNo: a.invoice.invoiceNumber },
        ]),
        { status: 200 }
      )) as typeof fetch;
    try {
      const out = await settleToyyibpayBill(billCode);
      harness.assertEqual(out.status, "PAID", "Settled");
      harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "Invoice PAID");
      harness.assertEqual(await orderStatus(a.orderId), "NEW", "Order NEW");
      const again = await settleToyyibpayBill(billCode);
      harness.assertEqual(again.status === "PAID" && again.alreadySettled, true, "Second settle is a no-op");
      harness.assertEqual(await orderStatus(a.orderId), "NEW", "Still NEW");
    } finally {
      globalThis.fetch = realFetch;
      await db.tenant.update({ where: { id: lumina.id }, data: { toyyibpaySecretEnc: saved.toyyibpaySecretEnc, toyyibpayCategoryCode: saved.toyyibpayCategoryCode } });
    }
  });

  await harness.test("T20-CANCEL-01: the client cancels an unpaid order: CANCELLED, invoice VOID, the print is back", async () => {
    const a = await placeAwaiting();
    harness.assertEqual(await remainingOf(a.p), 0, "Print claimed");
    const other = await withSession(unpaid.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(other), "NOT_FOUND", "Another client can't cancel it");
    const signedOut = await withSession(null, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(signedOut), "UNAUTHENTICATED", "Signed out refused");
    harness.assertEqual(await orderStatus(a.orderId), "AWAITING_PAYMENT", "Untouched by refused callers");

    const res = await withSession(a.p.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(res.success, true, "Cancelled");
    harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order CANCELLED");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Invoice VOID");
    harness.assertEqual(await remainingOf(a.p), 1, "Included print returned");
    const twice = await withSession(a.p.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(twice), "ALREADY_CANCELLED", "Second cancel refused");
    const pay = await payByCard(a);
    harness.assertEqual(errOf(pay), "INVOICE_VOID", "The voided invoice can't be paid");
  });

  await harness.test("T20-CANCEL-02: a paid order can't be cancelled by the client; staff can until it ships", async () => {
    const a = await placeAwaiting();
    harness.assertEqual((await payByCard(a)).success, true, "Paid");
    const res = await withSession(a.p.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(res), "NOT_CANCELLABLE", "Client refused");
    harness.assertEqual(msgOf(res), "This order is paid. Contact the studio to change it.", "Message");
    harness.assertEqual(await orderStatus(a.orderId), "NEW", "Order still NEW");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "Invoice still PAID");

    await db.printOrder.update({ where: { id: a.orderId }, data: { status: "SHIPPED" } });
    const shipped = await withSession(ownerSession, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(shipped), "NOT_CANCELLABLE", "Staff can't cancel a shipped order");
    harness.assertEqual(await orderStatus(a.orderId), "SHIPPED", "Still SHIPPED");

    await db.printOrder.update({ where: { id: a.orderId }, data: { status: "IN_PRODUCTION" } });
    const paidBy = (await db.milestoneInvoice.findUniqueOrThrow({ where: { id: a.invoice.id } })).verifiedBy;
    const staff = await withSession(ownerSession, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(staff.success, true, "Staff cancel before shipping");
    harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order CANCELLED");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "A paid invoice is never voided");
    harness.assertEqual(await remainingOf(a.p), 1, "Included print returned");
    const order = await db.printOrder.findUniqueOrThrow({ where: { id: a.orderId } });
    const inv = await db.milestoneInvoice.findUniqueOrThrow({ where: { id: a.invoice.id } });
    const note = `Refund owed: order ${order.orderNumber} cancelled by ${owner.name}`;
    harness.assertEqual(order.notes?.startsWith(note), true, "Refund owed noted on the order");
    // The invoice's verifiedBy prints on the client's receipt ("Received by"), so the internal note stays off it.
    harness.assertEqual(inv.verifiedBy, paidBy, "Client receipt unchanged: no internal refund note on the invoice");
  });

  const photographerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "PHOTOGRAPHER" } });
  const photographerSession = {
    id: photographerRow?.id ?? "t20-photographer", email: photographerRow?.email ?? "t20-photographer@example.test",
    name: photographerRow?.name ?? "T20 Photographer", role: "PHOTOGRAPHER", tenantId: lumina.id, tenantSlug: "lumina-cine",
  };

  await harness.test("T20-CANCEL-05: only the owner cancels an order with an invoice; other staff can cancel free orders", async () => {
    const a = await placeAwaiting();
    const unpaidRes = await withSession(photographerSession, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(unpaidRes), "OWNER_ONLY", "Photographer can't void the unpaid invoice");
    harness.assertEqual(msgOf(unpaidRes), "Only the studio owner can cancel an order that has a payment.", "Message");
    harness.assertEqual(await orderStatus(a.orderId), "AWAITING_PAYMENT", "Order unchanged");
    harness.assertEqual(await invoiceStatus(a.invoice.id), a.invoice.status, "Invoice unchanged");

    const b = await placeAwaiting();
    harness.assertEqual((await payByCard(b)).success, true, "Paid");
    const paidRes = await withSession(photographerSession, () => cancelPrintOrder({ ...orderBase, orderId: b.orderId }));
    harness.assertEqual(errOf(paidRes), "OWNER_ONLY", "Photographer can't cancel a paid order");
    harness.assertEqual(await orderStatus(b.orderId), "NEW", "Paid order unchanged");

    const asOwner = await withSession(ownerSession, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(asOwner.success, true, "Owner cancels");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Invoice VOID");

    const free = await makeOrderProject(true);
    const placed = await withSession(free.session, () =>
      placePrintOrder({ ...orderBase, projectId: free.project.id, items: [includedItem(free)], fulfilment: "PICKUP" })
    );
    if (!placed.success) throw new Error("place failed: " + JSON.stringify(placed));
    const freeRes = await withSession(photographerSession, () => cancelPrintOrder({ ...orderBase, orderId: placed.orderId }));
    harness.assertEqual(freeRes.success, true, "Photographer cancels a free order");
    harness.assertEqual(await orderStatus(placed.orderId), "CANCELLED", "Free order CANCELLED");
  });

  await harness.test("T20-VOID-01: voiding the order's invoice cancels the order and returns the print", async () => {
    const a = await placeAwaiting();
    const res = await withSession(ownerSession, () =>
      voidInvoice({ ...orderBase, invoiceId: a.invoice.id, reason: "Client changed their mind" })
    );
    harness.assertEqual(res.success, true, "Voided");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Invoice VOID");
    harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order CANCELLED");
    harness.assertEqual(await remainingOf(a.p), 1, "Included print returned");
  });

  await harness.test("T20-VOID-02: a paid invoice can't be voided and its order is unchanged", async () => {
    const a = await placeAwaiting();
    harness.assertEqual((await payByCard(a)).success, true, "Paid");
    const res = await withSession(ownerSession, () =>
      voidInvoice({ ...orderBase, invoiceId: a.invoice.id, reason: "Should not work" })
    );
    harness.assertEqual(errOf(res), "NOT_UNPAID", "NOT_UNPAID");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PAID", "Invoice still PAID");
    harness.assertEqual(await orderStatus(a.orderId), "NEW", "Order still NEW");
    harness.assertEqual(await remainingOf(a.p), 0, "Print still claimed");
  });

  await harness.test("T20-CANCEL-03: a bill paid after the client cancelled leaves the invoice VOID and flags a refund", async () => {
    const a = await placeAwaiting();
    const saved = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });
    const realFetch = globalThis.fetch;
    // Toyyibpay only charges in ringgit, so the studio runs as MYR with a gateway for this test.
    await db.tenant.update({
      where: { id: lumina.id },
      data: { currency: "MYR", toyyibpaySecretEnc: encryptSecret("sk-t20"), toyyibpayCategoryCode: "cat-t20" },
    });
    let txns: Record<string, string>[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/createBill")) return new Response(JSON.stringify([{ BillCode: `t20late${run}` }]), { status: 200 });
      return new Response(JSON.stringify(txns), { status: 200 });
    }) as typeof fetch;
    try {
      const pay = await withSession(a.p.session, () =>
        processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "CARD" })
      );
      harness.assertEqual(pay.success === true && typeof pay.paymentUrl === "string", true, "Bill created, client sent to the gateway");
      const billCode = (await db.milestoneInvoice.findUniqueOrThrow({ where: { id: a.invoice.id } })).gatewayBillCode;
      harness.assertEqual(billCode, `t20late${run}`, "Bill code stored");

      const cancel = await withSession(a.p.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
      harness.assertEqual(cancel.success, true, "Client cancels before paying");

      txns = [{ billpaymentStatus: "1", billpaymentAmount: a.invoice.amount.toFixed(2), billpaymentInvoiceNo: "TP-LATE", billExternalReferenceNo: a.invoice.invoiceNumber }];
      const quiet = console.error;
      console.error = () => undefined;
      const out = await settleToyyibpayBill(billCode!).finally(() => (console.error = quiet));
      harness.assertEqual(out.status, "PAID", "Money received");
      harness.assertEqual(out.status === "PAID" && out.refundRequired, true, "Refund required");
      harness.assertEqual(out.status === "PAID" ? out.refundReason : "", "INVOICE_CANCELLED", "Refund reason");
      const inv = await db.milestoneInvoice.findUniqueOrThrow({ where: { id: a.invoice.id } });
      harness.assertEqual(inv.status, "VOID", "Invoice still VOID");
      harness.assertEqual(inv.paymentReference, "TOYYIBPAY-TP-LATE", "Gateway reference recorded");
      const cancelledOrder = await db.printOrder.findUniqueOrThrow({ where: { id: a.orderId } });
      harness.assertEqual(
        inv.verifiedBy,
        `Cancelled with print order ${cancelledOrder.orderNumber} by ${a.p.client.name}\nToyyibpay - REFUND REQUIRED (paid after the invoice was cancelled)`,
        "Refund noted after who cancelled it"
      );
      harness.assertEqual(inv.paidAt, null, "Not marked paid");
      harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order still CANCELLED");
      const again = await settleToyyibpayBill(billCode!);
      harness.assertEqual(again.status === "PAID" && again.refundRequired && again.alreadySettled, true, "Settling again reports the same, once");
      harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Still VOID");
    } finally {
      globalThis.fetch = realFetch;
      await db.tenant.update({
        where: { id: lumina.id },
        data: { currency: saved.currency, toyyibpaySecretEnc: saved.toyyibpaySecretEnc, toyyibpayCategoryCode: saved.toyyibpayCategoryCode },
      });
    }
  });

  await harness.test("T20-CANCEL-04: a client can't cancel while their payment slip is being checked; staff can", async () => {
    const a = await placeAwaiting();
    const slip = await withSession(a.p.session, () =>
      processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "QR_CODE", paymentProofUrl: "/t20/slip.jpg" })
    );
    harness.assertEqual(slip.success, true, "Slip sent");
    const res = await withSession(a.p.session, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(errOf(res), "PAYMENT_UNDER_REVIEW", "PAYMENT_UNDER_REVIEW");
    harness.assertEqual(msgOf(res), "Your payment is being checked. Contact the studio to cancel.", "Message");
    harness.assertEqual(await orderStatus(a.orderId), "AWAITING_PAYMENT", "Order unchanged");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "PENDING_VERIFICATION", "Invoice unchanged");
    harness.assertEqual(await remainingOf(a.p), 0, "Print still claimed");

    const staff = await withSession(ownerSession, () => cancelPrintOrder({ ...orderBase, orderId: a.orderId }));
    harness.assertEqual(staff.success, true, "Staff cancel");
    harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order CANCELLED");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Invoice VOID");
    harness.assertEqual(await remainingOf(a.p), 1, "Included print returned");
  });

  await harness.test("T20-VOID-03: an invoice cancelled before approval can't be approved or paid", async () => {
    const a = await placeAwaiting();
    await withSession(a.p.session, () =>
      processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "QR_CODE", paymentProofUrl: "/t20/slip.jpg" })
    );
    const voided = await withSession(ownerSession, () => voidInvoice({ ...orderBase, invoiceId: a.invoice.id, reason: "Duplicate order" }));
    harness.assertEqual(voided.success, true, "Voided");
    const approved = await withSession(ownerSession, () =>
      approvePaymentVerification({ invoiceId: a.invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assertEqual(errOf(approved), "INVOICE_VOID", "Approval refused");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Invoice stays VOID");
    harness.assertEqual(await orderStatus(a.orderId), "CANCELLED", "Order stays CANCELLED");

    // The check inside the payment transaction itself: a cancel landing after the caller's
    // pre-check still stops the write and rolls the transaction back.
    let thrown: unknown = null;
    try {
      await db.$transaction((tx) => updatePayableInvoice(tx, a.invoice.id, { status: "PAID", paidAt: new Date() }));
    } catch (e) {
      thrown = e;
    }
    harness.assertEqual(thrown instanceof InvoiceNotPayableError && thrown.status, "VOID", "In-transaction guard refuses a VOID invoice");
    harness.assertEqual(await invoiceStatus(a.invoice.id), "VOID", "Still VOID");
    const unvoid = await withSession(ownerSession, () => voidInvoice({ ...orderBase, invoiceId: a.invoice.id, reason: "Again" }));
    harness.assertEqual(errOf(unvoid), "NOT_UNPAID", "Voiding twice refused");
  });

  // ---- Client pages (render level) ----
  await provideReactGlobal();
  const visualizer = (projectId?: string, claim?: string) =>
    VisualizerPage({
      params: Promise.resolve({ tenantSlug: "lumina-cine" }),
      searchParams: Promise.resolve({ ...(projectId ? { projectId } : {}), ...(claim ? { claim } : {}) }),
    });

  await harness.test("T20-UI-01: Wall Art opened from a gallery offers only that project's photos", async () => {
    const p = await makeOrderProject(true);
    const tree = await withSession(p.session, () => visualizer(p.project.id, p.line.id));
    const photos = findProp<{ id: string; url: string }[]>(tree, "initialPhotos") ?? [];
    harness.assertEqual(JSON.stringify(photos.map((x) => x.id)), JSON.stringify([p.photo.id]), "Only the project's PHOTO item");
    harness.assertEqual(photos[0]?.url, "/t20/p1-preview.jpg", "Shows the preview, not the master");
    harness.assertEqual(findProp<boolean>(tree, "canOrder"), true, "A paid project with photos can order");
    const ordering = findProp<{ claimLineId: string | null; matBoardPrice: number }>(tree, "ordering");
    harness.assertEqual(ordering?.claimLineId, p.line.id, "claim preselects the included line");
    const current = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id }, select: { matBoardPrice: true } });
    harness.assertEqual(findProp<number>(tree, "matBoardPrice"), current.matBoardPrice, "Studio's current mat price");
  });

  await harness.test("T20-UI-02: Wall Art without a project is a preview with no ordering", async () => {
    const tree = await withSession(null, () => visualizer());
    harness.assertEqual(findProp<boolean>(tree, "canOrder"), false, "canOrder false");
    harness.assertEqual(findProp(tree, "ordering"), null, "No ordering context");
    const photos = findProp<{ id: string }[]>(tree, "initialPhotos") ?? [];
    harness.assertEqual(photos.every((x) => x.id.startsWith("showcase_")), true, "Showcase covers only");
  });

  await harness.test("T20-UI-03: an unpaid project's vault shows the framed prints section locked", async () => {
    const tree = await withSession(unpaid.session, () =>
      ProjectVaultPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: unpaid.project.id }) })
    );
    harness.assertEqual(findProp<boolean>(tree, "unlocked"), false, "Section rendered, locked");
    const lines = findProp<{ quantity: number; remaining: number }[]>(tree, "lines") ?? [];
    harness.assertEqual(lines.length, 1, "Lists the included line");
    harness.assertEqual(lines[0]?.remaining, 1, "Nothing claimed yet");
  });
  await harness.test("T20-UI-04: the studio's print ordering page opens only a paid project with photos for ordering", async () => {
    const adminPrints = (projectId: string) =>
      withSession(ownerSession, () => AdminProjectPrintsPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId }) }));
    const locked = await adminPrints(unpaid.project.id);
    harness.assertEqual(findProp<boolean>(locked, "canOrder"), false, "Unpaid project can't order");
    const p = await makeOrderProject(true);
    const tree = await adminPrints(p.project.id);
    harness.assertEqual(findProp<boolean>(tree, "canOrder"), true, "Paid project with photos can order");
    const photos = findProp<{ id: string; url: string }[]>(tree, "initialPhotos") ?? [];
    harness.assertEqual(JSON.stringify(photos.map((x) => x.id)), JSON.stringify([p.photo.id]), "Only the project's PHOTO item");
    const ordering = findProp<{ galleryHref: string; staffOrdersHref?: string }>(tree, "ordering");
    harness.assertEqual(ordering?.galleryHref, `/lumina-cine/admin/projects/${p.project.id}`, "Back to the admin gallery");
    harness.assertEqual(ordering?.staffOrdersHref, "/lumina-cine/admin/print-orders", "Placed orders open in the admin console");
  });

  await harness.test("T20-UI-05: a released project shows clean photo_view copies in Wall Art and order thumbnails, never proofs or masters", async () => {
    const p = await makeOrderProject(true);
    await db.deliverableItem.update({ where: { id: p.photo.id }, data: { viewUrl: "/t20/p1-view.jpg" } });
    const clean = `/api/download?projectId=${p.project.id}&type=photo_view&assetId=${p.photo.id}`;
    const asClient = await withSession(p.session, () => visualizer(p.project.id));
    harness.assertEqual((findProp<{ url: string }[]>(asClient, "initialPhotos") ?? [])[0]?.url, clean, "Client's Wall Art shows the clean copy");
    const asStaff = await withSession(ownerSession, () =>
      AdminProjectPrintsPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: p.project.id }) })
    );
    harness.assertEqual((findProp<{ url: string }[]>(asStaff, "initialPhotos") ?? [])[0]?.url, clean, "Studio's print page shows the clean copy");

    const placed = await withSession(p.session, () =>
      placePrintOrder({ ...orderBase, projectId: p.project.id, items: [includedItem(p)], fulfilment: "PICKUP" })
    );
    if (!placed.success) throw new Error("place failed: " + JSON.stringify(placed));
    const framed = await loadFramedPrints(p.project.id);
    harness.assertEqual(JSON.stringify(framed.orders[0]?.thumbnails), JSON.stringify([clean]), "Order thumbnail is the clean copy");

    const locked = await makeOrderProject(false);
    await db.deliverableItem.update({ where: { id: locked.photo.id }, data: { viewUrl: "/t20/p1-view.jpg" } });
    const lockedTree = await withSession(ownerSession, () =>
      AdminProjectPrintsPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: locked.project.id }) })
    );
    harness.assertEqual((findProp<{ url: string }[]>(lockedTree, "initialPhotos") ?? [])[0]?.url, "/t20/p1-preview.jpg", "Unreleased: still the proof");
  });

  await harness.test("T20-UI-06: staff in the vault order framed prints from the studio's page; clients from Wall Art", async () => {
    const p = await makeOrderProject(true);
    const vault = (session: Parameters<typeof withSession>[0]) =>
      withSession(session, () => ProjectVaultPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: p.project.id }) }));
    harness.assertEqual(findProp<string>(await vault(ownerSession), "staffOrderHref"), `/lumina-cine/admin/projects/${p.project.id}/prints`, "Staff link");
    harness.assertEqual(findProp<string>(await vault(p.session), "staffOrderHref"), undefined, "Client has no staff link");
  });

  // ---- Studio: print order status, tracking and client emails ----
  type Mail = { to: string; subject: string; html: string; text: string };
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;
  /** Runs `fn` with SMTP pointed at a capturing transport (or one that fails), then puts SMTP back. */
  const withInbox = async (fn: (inbox: Mail[]) => Promise<void>, fail = false) => {
    const saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    const inbox: Mail[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({
      sendMail: async (mail: Mail) => {
        if (fail) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        inbox.push(mail);
        return json.sendMail(mail);
      },
    } as unknown as Transporter);
    const quiet = console.error;
    if (fail) console.error = () => undefined;
    try {
      await fn(inbox);
    } finally {
      console.error = quiet;
      // A late email (e.g. a booking confirmation still in flight) lands nowhere instead of a real server.
      setSmtpTransportForTests(json);
      for (const k of SMTP_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
  type AnySession = Parameters<typeof withSession>[0];
  const move = (orderId: string, status: UpdateOrderStatusInput["status"], extra: { courier?: string; trackingNumber?: string } = {}, session: AnySession = ownerSession) =>
    withSession(session, () => updatePrintOrderStatus({ ...orderBase, orderId, status, ...extra }));
  const placePickup = async () => {
    const p = await makeOrderProject(true);
    const res = await withSession(p.session, () =>
      placePrintOrder({ ...orderBase, projectId: p.project.id, items: [includedItem(p)], fulfilment: "PICKUP" })
    );
    if (!res.success) throw new Error("place failed: " + JSON.stringify(res));
    return { p, orderId: res.orderId };
  };

  await harness.test("T20-ADMIN-01: a shipped order needs a courier and tracking number, then the client gets one shipped email", async () => {
    await withInbox(async (all) => {
      // Only this order's print emails: setting up the booking sends its own confirmation, possibly late.
      const mine = () => all.filter((m) => /framed prints/i.test(m.subject));
      const a = await placeAwaiting();
      const early = await move(a.orderId, "IN_PRODUCTION");
      harness.assertEqual(errOf(early), "BAD_TRANSITION", "An unpaid order can't go into production");
      harness.assertEqual(await orderStatus(a.orderId), "AWAITING_PAYMENT", "Still awaiting payment");
      harness.assertEqual((await payByCard(a)).success, true, "Paid");

      harness.assertEqual((await move(a.orderId, "IN_PRODUCTION")).success, true, "NEW -> IN_PRODUCTION");
      harness.assertEqual(await orderStatus(a.orderId), "IN_PRODUCTION", "In production");
      harness.assertEqual(mine().length, 0, "No email for going into production");

      const bare = await move(a.orderId, "SHIPPED");
      harness.assertEqual(errOf(bare), "TRACKING_REQUIRED", "No courier or tracking refused");
      const half = await move(a.orderId, "SHIPPED", { courier: "J&T Express", trackingNumber: "   " });
      harness.assertEqual(errOf(half), "TRACKING_REQUIRED", "Blank tracking refused");
      harness.assertEqual(await orderStatus(a.orderId), "IN_PRODUCTION", "Still in production");
      harness.assertEqual(mine().length, 0, "No email for a refused move");

      const shipped = await move(a.orderId, "SHIPPED", { courier: "J&T Express", trackingNumber: "JT1234567" });
      harness.assertEqual(shipped.success, true, "IN_PRODUCTION -> SHIPPED");
      const order = await db.printOrder.findUniqueOrThrow({ where: { id: a.orderId } });
      harness.assertEqual(order.status, "SHIPPED", "SHIPPED");
      harness.assertEqual(order.courier, "J&T Express", "Courier stored");
      harness.assertEqual(order.trackingNumber, "JT1234567", "Tracking stored");
      harness.assertEqual(mine().length, 1, "One shipped email");
      harness.assertEqual(mine()[0]?.to, a.p.client.email, "Sent to the client");
      harness.assertEqual(/shipped/i.test(mine()[0]?.subject ?? ""), true, "Subject says shipped");
      harness.assertEqual(
        (mine()[0]?.html ?? "").includes("JT1234567") && (mine()[0]?.html ?? "").includes(order.orderNumber),
        true,
        "Tracking and order number in the email"
      );

      const back = await move(a.orderId, "IN_PRODUCTION");
      harness.assertEqual(errOf(back), "BAD_TRANSITION", "Can't move a shipped order back");
      const collected = await move(a.orderId, "COLLECTED");
      harness.assertEqual(errOf(collected), "BAD_TRANSITION", "A shipped order is delivered, not collected");
      harness.assertEqual((await move(a.orderId, "DELIVERED")).success, true, "SHIPPED -> DELIVERED");
      harness.assertEqual(await orderStatus(a.orderId), "DELIVERED", "DELIVERED");
      harness.assertEqual(mine().length, 1, "Still one email");
    });
  });

  await harness.test("T20-ADMIN-02: a pickup order can't be shipped; ready for pickup sends one ready email", async () => {
    await withInbox(async (all) => {
      // Only this order's print emails: setting up the booking sends its own confirmation, possibly late.
      const mine = () => all.filter((m) => /framed prints/i.test(m.subject));
      const { p, orderId } = await placePickup();
      harness.assertEqual(await orderStatus(orderId), "NEW", "Free pickup order is NEW");
      const skip = await move(orderId, "READY_FOR_PICKUP");
      harness.assertEqual(errOf(skip), "BAD_TRANSITION", "NEW can't skip production");
      harness.assertEqual((await move(orderId, "IN_PRODUCTION")).success, true, "NEW -> IN_PRODUCTION");
      const ship = await move(orderId, "SHIPPED", { courier: "Pos Laju", trackingNumber: "PL1" });
      harness.assertEqual(errOf(ship), "BAD_TRANSITION", "A pickup order can't be shipped");
      harness.assertEqual(await orderStatus(orderId), "IN_PRODUCTION", "Still in production");

      harness.assertEqual((await move(orderId, "READY_FOR_PICKUP")).success, true, "IN_PRODUCTION -> READY_FOR_PICKUP");
      harness.assertEqual(await orderStatus(orderId), "READY_FOR_PICKUP", "Ready for pickup");
      harness.assertEqual(mine().length, 1, "One ready email");
      harness.assertEqual(mine()[0]?.to, p.client.email, "Sent to the client");
      harness.assertEqual(/ready/i.test(mine()[0]?.subject ?? ""), true, "Subject says ready");
      harness.assertEqual((await move(orderId, "COLLECTED")).success, true, "READY_FOR_PICKUP -> COLLECTED");
      harness.assertEqual(await orderStatus(orderId), "COLLECTED", "COLLECTED");
      harness.assertEqual(mine().length, 1, "Still one email");
    });
  });

  await harness.test("T20-ADMIN-03: a client, or nobody signed in, can't change an order's status", async () => {
    const { p, orderId } = await placePickup();
    const asClient = await move(orderId, "IN_PRODUCTION", {}, p.session);
    harness.assertEqual(errOf(asClient), "FORBIDDEN", "Client refused");
    const signedOut = await move(orderId, "IN_PRODUCTION", {}, null);
    harness.assertEqual(errOf(signedOut), "UNAUTHENTICATED", "Signed out refused");
    harness.assertEqual(await orderStatus(orderId), "NEW", "Order unchanged");
  });

  await harness.test("T20-ADMIN-04: another studio's staff can't change an order's status", async () => {
    const apex = await db.tenant.findUniqueOrThrow({ where: { slug: "apex-media" } });
    const apexOwner = await db.user.findFirstOrThrow({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } });
    const apexSession = { id: apexOwner.id, email: apexOwner.email, name: apexOwner.name, role: apexOwner.role, tenantId: apex.id, tenantSlug: "apex-media" };
    const { orderId } = await placePickup();
    const res = await move(orderId, "IN_PRODUCTION", {}, apexSession);
    harness.assertEqual(errOf(res), "FORBIDDEN", "Other tenant's staff refused");
    const ownTenant = await withSession(apexSession, () =>
      updatePrintOrderStatus({ tenantId: apex.id, tenantSlug: "apex-media", orderId, status: "IN_PRODUCTION" })
    );
    harness.assertEqual(errOf(ownTenant), "NOT_FOUND", "Not found under their own studio");
    harness.assertEqual(await orderStatus(orderId), "NEW", "Order unchanged");
  });

  await harness.test("T20-ADMIN-05: a failed email doesn't undo the status change", async () => {
    await withInbox(async () => {
      const { orderId } = await placePickup();
      await move(orderId, "IN_PRODUCTION");
      const res = await move(orderId, "READY_FOR_PICKUP");
      harness.assertEqual(res.success, true, "Status change succeeds");
      harness.assertEqual(await orderStatus(orderId), "READY_FOR_PICKUP", "Ready for pickup");
    }, true);
  });
  // ---- Verification: framed preview of a print order's invoice ----
  await harness.test("T20-VERIFY-01: the verification page passes the print order for a print invoice awaiting verification, nothing for others", async () => {
    const a = await placeAwaiting();
    await db.deliverableItem.update({ where: { id: a.p.photo.id }, data: { resolution: "4000 × 6000" } });
    const slip = await withSession(a.p.session, () =>
      processInvoicePayment({ ...orderBase, invoiceId: a.invoice.id, paymentMethod: "QR_CODE", paymentProofUrl: "/t20/slip.jpg" })
    );
    harness.assertEqual(slip.success, true, "Slip sent");
    const other = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id, invoiceNumber: `T20V-${run}-${Math.random().toString(36).slice(2, 8)}`, clientId: a.p.client.id,
        milestoneType: "CUSTOM", description: "T20 other", amount: 5, status: "PENDING_VERIFICATION", paymentMethod: "CASH", dueDate: new Date(),
      },
    });
    try {
      const tree = await withSession(ownerSession, () => AdminVerificationPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }) }));
      type Pending = { id: string; printOrder: null | { id: string; orderNumber: string; items: { previewUrl: string | null; photoWidth: number | null; photoHeight: number | null }[] } };
      const pending = findProp<Pending[]>(tree, "pendingInvoices") ?? [];
      const mine = pending.find((i) => i.id === a.invoice.id);
      const order = await db.printOrder.findUniqueOrThrow({ where: { id: a.orderId } });
      harness.assertEqual(mine?.printOrder?.id, a.orderId, "Print invoice carries its order");
      harness.assertEqual(mine?.printOrder?.orderNumber, order.orderNumber, "Order number");
      harness.assertEqual(mine?.printOrder?.items.length, 1, "With its items");
      harness.assertEqual(mine?.printOrder?.items[0]?.previewUrl, "/t20/p1-preview.jpg", "Item preview, not the master");
      harness.assertEqual(mine?.printOrder?.items[0]?.photoWidth, 4000, "Photo width from its resolution");
      harness.assertEqual(mine?.printOrder?.items[0]?.photoHeight, 6000, "Photo height from its resolution");
      harness.assertEqual(pending.find((i) => i.id === other.id)?.printOrder, null, "Other invoice types carry nothing");
    } finally {
      await db.milestoneInvoice.delete({ where: { id: other.id } });
    }
  });

  await harness.test("T20-VERIFY-02: an older photo stored as 600 × 400 on a portrait item previews portrait (8 × 12 on 8R)", async () => {
    const a = await placeAwaiting();
    await db.deliverableItem.update({ where: { id: a.p.photo.id }, data: { resolution: "600 × 400" } });
    const preview = (await loadPrintOrderPreviews(lumina.id, [a.invoice.id])).get(a.invoice.id);
    const item = preview?.items[0];
    harness.assertEqual(item?.orientation, "PORTRAIT", "Portrait item");
    harness.assertEqual(`${item?.photoWidth}x${item?.photoHeight}`, "400x600", "Size turned to the item's orientation");
    const r8 = { widthInches: 8, heightInches: 10 };
    const dims = printDimensionsFor(r8, { width: item?.photoWidth ?? 0, height: item?.photoHeight ?? 0 });
    harness.assertEqual(JSON.stringify(dims), JSON.stringify({ widthInches: 8, heightInches: 12, orientation: "PORTRAIT" }), "Print at 8 × 12");
  });

  // ---- A photo in a print order can't be deleted ----
  await harness.test("T20-PROTECT-01: a photo in an open print order can't be deleted until the order is cancelled", async () => {
    const { p, orderId } = await placePickup();
    const refused = await withSession(ownerSession, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: p.photo.id }));
    harness.assertEqual(errOf(refused), "IN_PRINT_ORDER", "Refused while the order is NEW");
    harness.assertEqual(msgOf(refused), "This photo is in a print order. Cancel or finish that order first.", "Message");
    harness.assertEqual(await db.deliverableItem.count({ where: { id: p.photo.id } }), 1, "Photo still there");
    const cancelled = await withSession(ownerSession, () => cancelPrintOrder({ ...orderBase, orderId }));
    harness.assertEqual(cancelled.success, true, "Order cancelled");
    const deleted = await withSession(ownerSession, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: p.photo.id }));
    harness.assertEqual(deleted.success, true, "Delete succeeds after cancelling");
    harness.assertEqual(await db.deliverableItem.count({ where: { id: p.photo.id } }), 0, "Photo gone");
  });
}
