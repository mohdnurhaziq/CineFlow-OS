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
}
