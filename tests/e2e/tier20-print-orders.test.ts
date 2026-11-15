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
import { processBookingCheckout } from "@/lib/actions/checkout";
import { snapshotIncludedPrints, loadProjectEntitlements, remainingForLines } from "@/lib/prints/entitlements";
import { grantIncludedPrint, removeIncludedPrint } from "@/lib/actions/admin-included-prints";
import { backfillIncludedPrints } from "../../prisma/backfill-included-prints";
import { deleteFrameDesign, deletePrintSize, togglePrintSizeAvailability, updateMatBoardPrice } from "@/lib/actions/admin-frames";

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
}
