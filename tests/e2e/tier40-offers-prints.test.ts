/**
 * Tier 40: a studio that sells no framed prints can switch them off (Settings → Photo delivery),
 * on a plan with wall art. Clients then see no Wall Art, print ordering or included prints.
 */

import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { readFile } from "node:fs/promises";
import { withSession } from "./mocks/session";
import { PRINTS_OFF_MESSAGE, hasFeature, printsOffered, requirePrintsOffered } from "@/lib/billing/guard";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { placePrintOrder, quotePrintOrder } from "@/lib/actions/print-orders";
import { onboardStudio } from "@/lib/actions/onboarding";
import { snapshotIncludedPrints } from "@/lib/prints/entitlements";
import { OnboardStudioSchema } from "@/lib/validations/onboarding";

const DAY_MS = 86_400_000;
const M = "t40-missing-id";

export async function runTier40OffersPrintsTests(harness: TestHarness) {
  harness.setSuite("Tier 40", "Studios that sell no framed prints");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed owner is required");
  const owner = { id: ownerRow.id, email: ownerRow.email, name: ownerRow.name, role: ownerRow.role, tenantId: ownerRow.tenantId, tenantSlug: "lumina-cine" };
  const saved = {
    subscriptionTier: lumina.subscriptionTier,
    subscriptionStatus: lumina.subscriptionStatus,
    trialEndsAt: lumina.trialEndsAt,
    paidUntil: lumina.paidUntil,
    pausedAt: lumina.pausedAt,
    offersPrints: lumina.offersPrints,
  };
  const restore = async () => {
    await db.tenant.update({ where: { id: lumina.id }, data: saved });
  };
  harness.registerTeardown(restore);
  const setPlan = (tier: string) =>
    db.tenant.update({
      where: { id: lumina.id },
      data: { subscriptionTier: tier, subscriptionStatus: "ACTIVE", paidUntil: new Date(Date.now() + 30 * DAY_MS), trialEndsAt: null, pausedAt: null },
    });
  const ids = { tenantId: lumina.id, tenantSlug: "lumina-cine" };
  const paidLine = { kind: "PAID", deliverableItemId: M, orientation: "PORTRAIT", printSizeId: M, frameDesignId: M, matBoardType: "NONE" };
  const includedLine = { kind: "INCLUDED", bookingIncludedPrintId: M, deliverableItemId: M, orientation: "PORTRAIT", printSizeId: M, frameDesignId: M, matBoardType: "NONE" };
  const read = (rel: string) => readFile(rel, "utf8");

  await harness.test("T40-RULE-01: prints are offered only with wall art on the plan AND the switch on", async () => {
    try {
      await setPlan("STUDIO_UNLIMITED");
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: true } });
      harness.assertEqual(await printsOffered(lumina.id), true, "Wall-art plan, switch on: offered");
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: false } });
      harness.assertEqual(await printsOffered(lumina.id), false, "Wall-art plan, switch off: not offered");
      harness.assertEqual(await hasFeature(lumina.id, "wallArt"), true, "…but the plan still has wall art");
      await setPlan("PRO");
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: true } });
      harness.assertEqual(await printsOffered(lumina.id), false, "A plan without wall art: not offered, whatever the switch says");
    } finally {
      await restore();
    }
  });

  await harness.test("T40-RULE-02: with the switch off new print orders are refused, and a quote too", async () => {
    try {
      await setPlan("STUDIO_UNLIMITED");
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: false } });
      const paid = (await withSession(null, () => placePrintOrder({ ...ids, projectId: M, items: [paidLine], fulfilment: "PICKUP" } as never))) as { success: boolean; error?: string; message?: string };
      harness.assert(paid.success === false && paid.error === "PRINTS_OFF" && paid.message === PRINTS_OFF_MESSAGE, "A paid order is refused with the studio's own words", JSON.stringify(paid));
      const quote = (await withSession(null, () => quotePrintOrder({ ...ids, projectId: M, items: [paidLine], fulfilment: "PICKUP" } as never))) as { success: boolean; error?: string };
      harness.assert(quote.success === false && quote.error === "PRINTS_OFF", "A quote is refused too", JSON.stringify(quote));
      const included = (await withSession(null, () => placePrintOrder({ ...ids, projectId: M, items: [includedLine], fulfilment: "PICKUP" } as never))) as { error?: string };
      harness.assert(included.error !== "PRINTS_OFF", "Redeeming a print the studio already promised is not stopped by the switch", JSON.stringify(included));
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: true } });
      const again = (await withSession(null, () => placePrintOrder({ ...ids, projectId: M, items: [paidLine], fulfilment: "PICKUP" } as never))) as { error?: string };
      harness.assert(again.error !== "PRINTS_OFF", "Switched back on, the order gets past the switch (and fails later, on made-up ids)", JSON.stringify(again));
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: false } });
      await requirePrintsOffered(lumina.id, { role: "SUPER_ADMIN" });
      harness.assert(true, "A platform super-admin is never blocked");
    } finally {
      await restore();
    }
  });

  await harness.test("T40-SETTINGS-01: the owner switches prints off and on from Settings, only on a plan with wall art", async () => {
    try {
      await setPlan("STUDIO_UNLIMITED");
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: true } });
      const off = (await withSession(owner, () => updateStudioSettings({ ...ids, offersPrints: false }))) as { success: boolean };
      harness.assert(off.success === true, "Switched off", JSON.stringify(off));
      harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.offersPrints, false, "Saved");
      const other = (await withSession(owner, () => updateStudioSettings({ ...ids, tagline: "T40 tagline" }))) as { success: boolean };
      harness.assert(other.success === true, "Another tab's save leaves the switch alone", JSON.stringify(other));
      harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.offersPrints, false, "Still off");
      const on = (await withSession(owner, () => updateStudioSettings({ ...ids, offersPrints: true }))) as { success: boolean };
      harness.assert(on.success === true, "Switched back on", JSON.stringify(on));
      harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.offersPrints, true, "Saved");

      await setPlan("PRO");
      const refused = (await withSession(owner, () => updateStudioSettings({ ...ids, offersPrints: false }))) as { success: boolean; message?: string; error?: string };
      harness.assert(refused.success === false, "A plan without wall art can't change the switch", JSON.stringify(refused));
      harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.offersPrints, true, "Unchanged");
    } finally {
      await db.tenant.update({ where: { id: lumina.id }, data: { tagline: lumina.tagline } });
      await restore();
    }
  });

  await harness.test("T40-SIGNUP-01: a new studio can skip print setup; by default it gets frames and sizes", async () => {
    const savedCode = process.env.STUDIO_SIGNUP_CODE;
    const slugs = [`t40-with-${Date.now().toString(36)}`, `t40-none-${Date.now().toString(36)}`];
    try {
      delete process.env.STUDIO_SIGNUP_CODE;
      const input = (slug: string) => ({ name: `T40 ${slug}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T40 Owner", ownerEmail: `${slug}@studio.test`, password: "StrongPassword123!" });
      harness.assertEqual(OnboardStudioSchema.parse(input("t40-default")).offersPrints, true, "The default is to sell prints");
      const withPrints = (await withSession(null, () => onboardStudio(input(slugs[0]!) as never))) as { success?: boolean };
      const noPrints = (await withSession(null, () => onboardStudio({ ...input(slugs[1]!), offersPrints: false } as never))) as { success?: boolean };
      harness.assert(withPrints.success === true && noPrints.success === true, "Both created", JSON.stringify([withPrints, noPrints]));
      const a = await db.tenant.findUnique({ where: { slug: slugs[0]! }, include: { _count: { select: { frameDesigns: true, printSizes: true } } } });
      const b = await db.tenant.findUnique({ where: { slug: slugs[1]! }, include: { _count: { select: { frameDesigns: true, printSizes: true } } } });
      harness.assert(a?.offersPrints === true && a._count.frameDesigns === 3 && a._count.printSizes === 3, "Default: 3 frames, 3 sizes, prints on");
      harness.assert(b?.offersPrints === false && b._count.frameDesigns === 0 && b._count.printSizes === 0, "Skipped: no frames, no sizes, prints off");
      harness.assertEqual(await printsOffered(b!.id), false, "A skipped studio is not offering prints, even in its trial");
      harness.assertEqual(await printsOffered(a!.id), true, "A default studio is, in its trial");
    } finally {
      if (savedCode === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = savedCode;
      for (const slug of slugs) {
        const t = await db.tenant.findUnique({ where: { slug } });
        if (!t) continue;
        await db.user.deleteMany({ where: { tenantId: t.id } });
        await db.tenant.delete({ where: { id: t.id } }).catch(() => {});
      }
    }
  });

  await harness.test("T40-BOOKING-01: a booking made while prints are off is promised none", async () => {
    try {
      await db.tenant.update({ where: { id: lumina.id }, data: { offersPrints: false } });
      const made = await db.$transaction((tx) => snapshotIncludedPrints(tx, { id: "t40-booking", tenantId: lumina.id, packageId: "t40-package" }, "PACKAGE"));
      harness.assertEqual(made, 0, "No included prints are copied onto it");
    } finally {
      await restore();
    }
  });

  await harness.test("T40-CLIENT-01: every page a client sees asks whether prints are offered", async () => {
    const page = await read("app/[tenantSlug]/page.tsx");
    harness.assert(/const sellsPrints = await printsOffered\(tenant\.id\)/.test(page) && /showWallArt=\{sellsPrints\}/.test(page), "The website bar shows Wall Art only when offered");
    harness.assert(/sellsPrints \? includedPrintCount\(includedPrints\) : 0/.test(page), "Packages on the website list no included prints when off");
    harness.assert(/showWallArt=\{await printsOffered\(tenant\.id\)\}/.test(await read("components/layout/studio-page-header.tsx")), "The shared header does the same");
    harness.assert(/!\(await printsOffered\(tenant\.id\)\)/.test(await read("app/[tenantSlug]/visualizer/page.tsx")), "The Wall Art page is closed when off");
    harness.assert(/const showFramedPrints = sellsPrints &&/.test(await read("app/[tenantSlug]/vault/[projectId]/page.tsx")), "A gallery shows no framed prints box when off");
    harness.assert(/sellsPrints \? await loadFramedPrints/.test(await read("app/[tenantSlug]/account/page.tsx")), "The account page's galleries show none when off");
    harness.assert(/includedPrints: sellsPrints \? printsWithRemaining : \[\]/.test(await read("app/[tenantSlug]/account/bookings/[bookingId]/page.tsx")), "A booking page lists no included prints when off");
    harness.assert(/showPrints=\{await printsOffered\(tenant\.id\)\}/.test(await read("app/[tenantSlug]/admin/services/page.tsx")), "The package form hides included prints when off");
  });

  await harness.test("T40-UI-01: the switch is in Settings → Photo delivery, only for a plan with wall art; sign-up has the checkbox", async () => {
    const tab = await read("components/admin/settings/delivery-tab.tsx");
    harness.assert(/tenant\.hasWallArt && <FramedPrintsSwitch/.test(tab), "The switch shows only when the plan has wall art");
    harness.assert(/save\(\{ offersPrints: offers \}\)/.test(tab), "It saves on its own");
    harness.assert(/hasWallArt: await hasFeature\(tenant\.id, "wallArt"\)/.test(await read("app/[tenantSlug]/admin/settings/page.tsx")), "The settings page tells it the plan");
    const signup = await read("app/(saas)/create-studio/page.tsx");
    harness.assert(/I don&apos;t sell framed prints/.test(signup) && /offersPrints: !e\.target\.checked/.test(signup), "Sign-up offers the choice");
    harness.assert(/subscriptionTier === "STUDIO_UNLIMITED" && \(\s*<label/.test(signup), "…only when the plan with wall art is chosen");
    harness.assert(/offersPrints: tier\.id === "STUDIO_UNLIMITED" \? prev\.offersPrints : true/.test(signup), "…and choosing another plan puts prints back on");
    const manual = (await read("app/[tenantSlug]/admin/manual/prints/page.tsx")) + (await read("app/[tenantSlug]/admin/manual/settings-and-team/page.tsx"));
    harness.assert(/No, we don&apos;t offer prints/.test(manual), "The manual describes it");
  });
}
