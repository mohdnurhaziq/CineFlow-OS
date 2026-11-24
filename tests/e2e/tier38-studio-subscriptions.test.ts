/**
 * Tier 38: studio subscriptions (docs/superpowers/specs/2026-11-21-studio-subscriptions-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, cheapestPlanWith } from "@/lib/billing/plans";
import { planStatus } from "@/lib/billing/state";
import { type PlanCode, type PlanFeature } from "@/lib/billing/plans";
import { countTeamSeats } from "@/lib/billing/team";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { provideReactGlobal } from "./react-tree";
import { loadAccess } from "@/lib/auth/access";
import { visibleNavItems } from "@/components/admin/admin-nav-items";
import { PlanBanner } from "@/components/billing/plan-banner";
import { PlanPanel } from "@/components/billing/plan-panel";
import { createProposalAddOnTemplate } from "@/lib/actions/admin-proposals";
import { createProposal, sendProposal, createCallSheet } from "@/lib/actions/admin-projects";
import { createFrameDesign, createPrintSize } from "@/lib/actions/admin-frames";
import { createGearItem, createKitBundle, createEquipmentReservation, updateGearItem, deleteGearItem } from "@/lib/actions/gear";
import { createTeamRole, inviteTeamMember, restoreTeamMember } from "@/lib/actions/admin-team";
import { assignTeamMember } from "@/lib/actions/admin-assignments";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { PlanLockedError, bookingsOpen, hasFeature, requireFeature } from "@/lib/billing/guard";
import { holdBookingSlot } from "@/lib/actions/booking";
import { onboardStudio } from "@/lib/actions/onboarding";
import { changeStudioPlan, closeStudio, extendTrial, getPlatformMetrics, getStudioPayments, pauseStudio, recordPlatformPayment, resumeStudio } from "@/lib/actions/super-admin";
import { processInvoicePayment } from "@/lib/actions/checkout";
import { placePrintOrder } from "@/lib/actions/print-orders";
import { db } from "@/lib/db";
import { withSession } from "./mocks/session";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { cleanupExpiredHolds } from "@/lib/actions/admin-calendar";

const myt = (day: string, time = "00:00:00") => new Date(`${day}T${time}+08:00`);

export async function runTier38StudioSubscriptionsTests(harness: TestHarness) {
  harness.setSuite("Tier 38", "Studio subscriptions");
  await provideReactGlobal();

  const base = { subscriptionTier: "STARTER", subscriptionStatus: "ACTIVE", trialEndsAt: null as Date | null, paidUntil: null as Date | null, pausedAt: null as Date | null };

  await harness.test("T38-STATE-01: a trial lasts to its last day, then 7 days' grace, then pause", async () => {
    const t = { ...base, trialEndsAt: myt("2026-12-01") };
    const at = (day: string) => planStatus(t, myt(day, "12:00:00")).state;
    harness.assertEqual(at("2026-12-01"), "TRIAL", "Last trial day");
    harness.assertEqual(at("2026-12-02"), "OVERDUE", "Day after");
    harness.assertEqual(at("2026-12-08"), "OVERDUE", "7th grace day");
    harness.assertEqual(at("2026-12-09"), "PAUSED", "After grace");
    const trial = planStatus(t, myt("2026-11-20"));
    harness.assert(trial.features.has("gear") && trial.features.has("proposals"), "A trial has every feature");
    harness.assertEqual(trial.teamLimit, Infinity, "…and unlimited team");
  });

  await harness.test("T38-STATE-02: a paid period covers its whole last day (Malaysia time)", async () => {
    const t = { ...base, paidUntil: myt("2026-12-01") };
    harness.assertEqual(planStatus(t, new Date("2026-12-01T15:30:00Z")).state, "ACTIVE", "23:30 on the last day");
    harness.assertEqual(planStatus(t, new Date("2026-12-01T16:30:00Z")).state, "OVERDUE", "00:30 the next day");
    harness.assertEqual(planStatus(t, myt("2026-12-09", "12:00:00")).state, "PAUSED", "paidUntil + 8 days");
    const active = planStatus(t, myt("2026-11-25"));
    harness.assert(!active.features.has("proposals"), "Solo has no proposals");
    harness.assertEqual(active.teamLimit, 0, "Solo: no team");
    harness.assertEqual(active.endsOn, "2026-12-01", "Ends on");
    harness.assertEqual(active.graceEndsOn, "2026-12-08", "Grace ends on");
  });

  await harness.test("T38-STATE-03: a manual pause wins; a cancelled studio is closed", async () => {
    harness.assertEqual(planStatus({ ...base, paidUntil: myt("2027-01-01"), pausedAt: myt("2026-11-20") }, myt("2026-11-25")).state, "PAUSED", "Paused by hand");
    harness.assertEqual(planStatus({ ...base, subscriptionStatus: "CANCELLED", paidUntil: myt("2027-01-01") }, myt("2026-11-25")).state, "CLOSED", "Closed");
  });

  await harness.test("T38-STATE-04: the plan catalogue", async () => {
    harness.assertEqual(PLANS.PRO.priceMyr, 249, "Studio RM 249");
    harness.assertEqual(PLANS.STARTER.priceMyr, 99, "Solo RM 99");
    harness.assertEqual(PLANS.STUDIO_UNLIMITED.priceMyr, 599, "Production RM 599");
    harness.assertEqual(PLANS.PRO.teamLimit, 5, "Studio: 5 members");
    harness.assertEqual(cheapestPlanWith("gear"), "STUDIO_UNLIMITED", "Gear");
    harness.assertEqual(cheapestPlanWith("proposals"), "PRO", "Proposals");
  });

  // ── Shared fixtures for the guard / lock tests ──────────────────────────────────────────
  const DAY_MS = 86_400_000;
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  const superRow = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!ownerRow || !superRow) throw new Error("Seed owner and super-admin are required");
  const sess = (u: typeof ownerRow) => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: "lumina-cine" });
  const owner = sess(ownerRow);
  const superAdmin = sess(superRow);
  const savedPlan = {
    subscriptionTier: lumina.subscriptionTier,
    subscriptionStatus: lumina.subscriptionStatus,
    trialEndsAt: lumina.trialEndsAt,
    paidUntil: lumina.paidUntil,
    pausedAt: lumina.pausedAt,
    pauseReason: lumina.pauseReason,
    lastPlanReminder: lumina.lastPlanReminder,
  };
  const restorePlan = async () => {
    await db.tenant.update({ where: { id: lumina.id }, data: savedPlan });
  };
  harness.registerTeardown(restorePlan);
  /** Puts the studio on a plan for a test: paid up for a month (or paused / overdue). */
  const setPlan = (plan: PlanCode, how: "ACTIVE" | "PAUSED" | "TRIAL" = "ACTIVE") =>
    db.tenant.update({
      where: { id: lumina.id },
      data: {
        subscriptionTier: plan,
        subscriptionStatus: "ACTIVE",
        paidUntil: how === "TRIAL" ? null : new Date(Date.now() + 30 * DAY_MS),
        trialEndsAt: how === "TRIAL" ? new Date(Date.now() + 5 * DAY_MS) : null,
        pausedAt: how === "PAUSED" ? new Date() : null,
        pauseReason: how === "PAUSED" ? "MANUAL" : null,
      },
    });

  await harness.test("T38-GUARD-01: a paused studio can't change things, but can settle what clients paid", async () => {
    try {
      // A client's QR deposit waiting for the studio's check, made before the pause.
      const slot = await db.bookingSlot.create({
        data: { tenantId: lumina.id, category: "EDITORIAL", date: new Date(`${new Date(Date.now() + 40 * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`), startTime: "09:15 AM", endTime: "10:00 AM", status: "AVAILABLE", price: 400, depositRequired: 100 },
      });
      const email = `t38-paused-${Date.now().toString(36)}@example.test`;
      await setPlan("PRO");
      const res = await withSession(null, () =>
        processBookingCheckout({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, sessionId: `t38-${Date.now()}`, clientName: "Paused Test", clientEmail: email, clientPhone: "0123456789", paymentMethod: "QR_CODE", paymentProofUrl: "/uploads/receipts/t38.jpg" })
      );
      if (!res.success) throw new Error(`booking failed: ${res.message}`);
      await setPlan("PRO", "PAUSED");

      const refused = await withSession(owner, () => cleanupExpiredHolds(lumina.id, "lumina-cine"));
      harness.assert(refused.success === false && /plan has ended/i.test(String((refused as { message?: string }).message ?? (refused as { error?: string }).error)), "A change is refused with the paused copy", JSON.stringify(refused));
      const approved = await withSession(owner, () => approvePaymentVerification({ invoiceId: res.invoiceId as string, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
      harness.assert(approved.success === true, "Approving a client's slip still works", JSON.stringify(approved));
      const sup = await withSession(superAdmin, () => cleanupExpiredHolds(lumina.id, "lumina-cine"));
      harness.assert(sup.success === true, "A super-admin is never refused", JSON.stringify(sup));

      await db.milestoneInvoice.deleteMany({ where: { client: { email } } });
      await db.project.deleteMany({ where: { client: { email } } });
      await db.clientBooking.deleteMany({ where: { clientEmail: email } });
      await db.bookingSlot.delete({ where: { id: slot.id } });
      await db.user.deleteMany({ where: { email } });
    } finally {
      await restorePlan();
    }
  });

  await harness.test("T38-GUARD-02: a plan without a feature refuses it; trials and super-admins have everything", async () => {
    try {
      await setPlan("STARTER");
      let err: unknown = null;
      try { await requireFeature(lumina.id, "proposals", owner); } catch (e) { err = e; }
      harness.assert(err instanceof PlanLockedError && err.code === "PLAN_UPGRADE_REQUIRED", "Refused");
      harness.assertEqual((err as Error).message, "Proposals is on the Studio plan. Contact us to upgrade.", "With the spec's copy");
      harness.assertEqual((await requireFeature(lumina.id, "proposals", superAdmin)) === undefined, true, "A super-admin passes");
      await setPlan("PRO");
      await requireFeature(lumina.id, "proposals", owner);
      await setPlan("STARTER", "TRIAL");
      await requireFeature(lumina.id, "gear", owner);
      await setPlan("PRO");
      let gear: unknown = null;
      try { await requireFeature(lumina.id, "gear", owner); } catch (e) { gear = e; }
      harness.assertEqual((gear as Error).message, "Gear inventory is on the Production plan. Contact us to upgrade.", "Names the cheapest plan with it");
    } finally {
      await restorePlan();
    }
  });

  await harness.test("T38-GUARD-03: the person sees the plan copy, not 'FORBIDDEN'", async () => {
    try {
      await setPlan("PRO", "PAUSED");
      const res = (await withSession(owner, () => cleanupExpiredHolds(lumina.id, "lumina-cine"))) as { message?: string; error?: string };
      harness.assert(!/FORBIDDEN/.test(`${res.message ?? ""}${res.error ?? ""}`), "No FORBIDDEN prefix", JSON.stringify(res));
      harness.assert(/Contact us to renew/.test(`${res.message ?? ""}${res.error ?? ""}`), "Says how to renew", JSON.stringify(res));
    } finally {
      await restorePlan();
    }
  });

  // ── Task 3: feature locks and the team limit ────────────────────────────────────────────
  const M = "t38-missing-id";
  const t = { tenantId: lumina.id, tenantSlug: "lumina-cine" };
  const msgOf = (r: unknown) => {
    const x = r as { message?: string; error?: string } | null;
    return `${x?.message ?? ""} ${x?.error ?? ""}`;
  };
  const locked = (r: unknown) => /Contact us to upgrade|plan includes|owner only/.test(msgOf(r));
  /** [what, the feature it needs, how to call it]. The ids are made up: a plan check comes first, so an allowed call fails later, for another reason. */
  const LOCKS: Array<[string, PlanFeature, () => Promise<unknown>]> = [
    ["createProposalAddOnTemplate", "proposals", () => createProposalAddOnTemplate({ ...t, name: "T38 add-on", description: "T38 add-on text", price: 1, unit: "fixed", isDefault: false, isActive: true })],
    ["createProposal", "proposals", () => createProposal({ ...t, clientId: M, title: "T38", category: "wedding", discipline: "PHOTOGRAPHY", basePrice: 100, depositPercentage: 50, contractTerms: "T38 terms, long enough to pass the check.", notifyClient: false } as never)],
    ["sendProposal", "proposals", () => sendProposal({ tenantId: lumina.id, proposalId: M, notifyClient: false })],
    ["createCallSheet", "callSheets", () => createCallSheet({ tenantId: lumina.id, projectId: M, title: "T38", shootDate: "2099-01-01", generalCallTime: "07:00 AM", locationName: "Studio", locationAddress: "1 Test Street" })],
    ["createFrameDesign", "wallArt", () => createFrameDesign({ ...t, name: "T38 frame", material: "Oak", moldingWidth: 1, frameColor: "Black", previewAsset: "/uploads/t38.png", priceOffset: 0, isAvailable: true })],
    ["createPrintSize", "wallArt", () => createPrintSize({ ...t, code: "T38", name: "T38 size", widthInches: 1, heightInches: 1, basePrice: 1 })],
    ["createGearItem", "gear", () => createGearItem({ ...t, name: "T38 lens", sku: "T38-SKU", category: "LENS" } as never)],
    ["createKitBundle", "gear", () => createKitBundle({ ...t, name: "T38 kit", description: "T38", discipline: "PHOTOGRAPHY", items: [{ itemId: M, quantity: 1 }] } as never)],
    ["createEquipmentReservation", "gear", () => createEquipmentReservation({ ...t, projectId: M, itemId: M, startDate: "2099-01-01", endDate: "2099-01-02" } as never)],
    ["createTeamRole", "team", () => createTeamRole({ ...t, name: "T38 role", access: { areas: {}, ticks: {} } } as never)],
    ["assignTeamMember", "team", () => assignTeamMember({ ...t, bookingIds: [M], userId: M })],
  ];

  await harness.test("T38-LOCK-01: each creating action is refused without its feature and allowed with it", async () => {
    try {
      for (const [name, feature, call] of LOCKS) {
        const needed = cheapestPlanWith(feature);
        const without: PlanCode = needed === "PRO" ? "STARTER" : "PRO";
        await setPlan(without);
        harness.assert(locked(await withSession(owner, call)), `${name}: refused on ${without}`);
        await setPlan(needed);
        harness.assert(!locked(await withSession(owner, call)), `${name}: not a plan refusal on ${needed}`);
        await setPlan("STARTER", "TRIAL");
        harness.assert(!locked(await withSession(owner, call)), `${name}: open during a trial`);
        await setPlan(without);
        harness.assert(!locked(await withSession(superAdmin, call)), `${name}: a super-admin is never locked`);
      }
    } finally {
      await restorePlan();
    }
  });

  await harness.test("T38-LOCK-02: a downgrade deletes nothing: existing gear can still be changed, signing isn't plan-checked", async () => {
    try {
      const gear = await db.inventoryItem.create({ data: { tenantId: lumina.id, name: "T38 old lens", sku: `T38-${Date.now()}`, category: "LENS" } as never });
      await setPlan("STARTER");
      const res = await withSession(owner, () => updateGearItem({ ...t, id: gear.id, name: "T38 renamed" } as never));
      harness.assert(!locked(res), "An existing gear item can still be edited", JSON.stringify(res));
      const del = await withSession(owner, () => deleteGearItem({ ...t, id: gear.id }));
      harness.assert(!locked(del), "…and deleted", JSON.stringify(del));
      const sign = await readFile("lib/actions/proposals.ts", "utf8");
      harness.assert(!/requireFeature/.test(sign), "A client can still sign a proposal already sent (no plan check there)");
    } finally {
      await restorePlan();
      await db.inventoryItem.deleteMany({ where: { sku: { startsWith: "T38-" } } });
    }
  });

  await harness.test("T38-LOCK-03: the team limit stops invitations and restores; existing members keep access", async () => {
    // Its own studio, so other tiers' team members don't count.
    const slug = `t38-team-${Date.now().toString(36)}`;
    const studio = await db.tenant.create({
      data: { name: "T38 Team Studio", slug, subscriptionTier: "PRO", paidUntil: new Date(Date.now() + 30 * DAY_MS) },
    });
    try {
      const boss = await db.user.create({ data: { tenantId: studio.id, email: `t38-boss-${slug}@example.test`, name: "T38 Boss", role: "STUDIO_OWNER", passwordHash: "x" } });
      const bossSession = { id: boss.id, email: boss.email, name: boss.name, role: boss.role, tenantId: studio.id, tenantSlug: slug };
      const tt = { tenantId: studio.id, tenantSlug: slug };
      const members: string[] = [];
      const fill = async (n: number) => {
        while ((await countTeamSeats(studio.id)) < n) {
          const u = await db.user.create({ data: { tenantId: studio.id, email: `t38-seat-${slug}-${members.length}@example.test`, name: "T38 Seat", role: "TEAM_MEMBER", passwordHash: "x" } });
          members.push(u.id);
        }
      };
      const setTier = (tier: PlanCode) => db.tenant.update({ where: { id: studio.id }, data: { subscriptionTier: tier } });
      const invite = () => withSession(bossSession, () => inviteTeamMember({ ...tt, name: "T38 Invitee", email: `t38-invitee-${Date.now()}@example.test`, roleId: M } as never));
      await setTier("STARTER");
      harness.assert(/owner only/.test(msgOf(await invite())), "Solo: the owner only");
      await setTier("PRO");
      await fill(4);
      harness.assert(!locked(await invite()), "Studio with 4 of 5: may invite");
      await fill(5);
      harness.assert(/plan includes 5 team members/.test(msgOf(await invite())), "Studio with 5 of 5: refused");
      await setTier("STUDIO_UNLIMITED");
      harness.assert(!locked(await invite()), "Production: no limit");
      await setTier("STARTER");
      const stillThere = await db.user.count({ where: { id: { in: members }, deactivatedAt: null } });
      harness.assertEqual(stillThere, members.length, "Members over the limit after a downgrade keep their access");
      await setTier("PRO");
      await db.user.update({ where: { id: members[0]! }, data: { deactivatedAt: new Date() } });
      await fill(5);
      harness.assert(/plan includes 5 team members/.test(msgOf(await withSession(bossSession, () => restoreTeamMember({ ...tt, userId: members[0]! })))), "Restoring past the limit is refused");
    } finally {
      await db.user.deleteMany({ where: { tenantId: studio.id } });
      await db.tenant.delete({ where: { id: studio.id } });
    }
  });

  await harness.test("T38-LOCK-04: a custom domain already set stays; a new one needs the plan", async () => {
    const before = lumina.customDomain;
    try {
      await setPlan("STARTER");
      const res = await withSession(owner, () => updateStudioSettings({ ...t } as never));
      harness.assert(!locked(res), "Saving other settings on Solo works", JSON.stringify(res));
      const set = await withSession(owner, () => updateStudioSettings({ ...t, customDomain: "t38-new.example.test" } as never));
      harness.assert(locked(set), "Setting a new domain on Solo is refused", JSON.stringify(set));
      await setPlan("PRO");
      const ok = await withSession(owner, () => updateStudioSettings({ ...t, customDomain: "t38-new.example.test" } as never));
      harness.assert(!locked(ok), "…and allowed on Studio", JSON.stringify(ok));
    } finally {
      await restorePlan();
      await db.tenant.update({ where: { id: lumina.id }, data: { customDomain: before } });
    }
  });

  // ── Task 4: paused studios close online booking; locked public pages ────────────────────
  await harness.test("T38-PUBLIC-01: a paused studio takes no new online bookings, but a client can still pay one they have", async () => {
    const slots: string[] = [];
    const email = `t38-pub-${Date.now().toString(36)}@example.test`;
    try {
      const mk = async (hour: string, days: number) => {
        const sl = await db.bookingSlot.create({
          data: { tenantId: lumina.id, category: "EDITORIAL", date: new Date(`${new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)}T00:00:00.000Z`), startTime: hour, endTime: "11:59 PM", status: "AVAILABLE", price: 400, depositRequired: 100 },
        });
        slots.push(sl.id);
        return sl;
      };
      const first = await mk("09:05 AM", 41);
      const second = await mk("09:10 AM", 42);
      await setPlan("PRO");
      const book = (slotId: string, who: string) =>
        withSession(null, () =>
          processBookingCheckout({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId, sessionId: `t38-${Date.now()}-${who}`, clientName: "Pub Test", clientEmail: email, clientPhone: "0123456789", paymentMethod: "QR_CODE", paymentProofUrl: "/uploads/receipts/t38.jpg" })
        );
      const made = await book(first.id, "a");
      harness.assert(made.success === true, "A booking made before the pause", JSON.stringify(made));

      await setPlan("PRO", "PAUSED");
      const hold = await withSession(null, () => holdBookingSlot({ tenantId: lumina.id, slotId: second.id, sessionId: `t38-hold-${Date.now()}` } as never));
      harness.assertEqual((hold as { error?: string }).error, "BOOKINGS_CLOSED", "Holding a slot is refused");
      harness.assertEqual((hold as { message?: string }).message, "This studio isn't taking bookings online right now.", "With the copy");
      const refused = await book(second.id, "b");
      harness.assertEqual((refused as { error?: string }).error, "BOOKINGS_CLOSED", "A new booking is refused");
      harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: second.id } }))?.status, "AVAILABLE", "The slot stays open");

      // The client's slip upload for the invoice they already have still works (invoice payment isn't a new booking).
      harness.assertEqual(await bookingsOpen(lumina.id), false, "bookingsOpen is false while paused");
      const inv = await db.milestoneInvoice.findFirst({ where: { client: { email } } });
      const pay = await withSession(
        { id: inv!.clientId, email, name: "Pub Test", role: "CLIENT", tenantId: lumina.id, tenantSlug: "lumina-cine" },
        () => processInvoicePayment({ invoiceId: inv!.id, tenantId: lumina.id, tenantSlug: "lumina-cine", paymentMethod: "QR_CODE", paymentProofUrl: "/uploads/receipts/t38b.jpg" } as never)
      );
      harness.assert(!/isn't taking bookings/.test(JSON.stringify(pay)), "Paying an existing invoice isn't closed", JSON.stringify(pay));
    } finally {
      await restorePlan();
      await db.milestoneInvoice.deleteMany({ where: { client: { email } } });
      await db.project.deleteMany({ where: { client: { email } } });
      await db.clientBooking.deleteMany({ where: { clientEmail: email } });
      await db.bookingSlot.deleteMany({ where: { id: { in: slots } } });
      await db.user.deleteMany({ where: { email } });
    }
  });

  await harness.test("T38-PUBLIC-02: without the Production plan the visualizer isn't offered and print orders are refused", async () => {
    try {
      await setPlan("PRO");
      harness.assertEqual(await hasFeature(lumina.id, "wallArt"), false, "Studio plan: no wall art");
      const refused = await withSession(null, () => placePrintOrder({ ...t, projectId: M, items: [{ kind: "PAID", deliverableItemId: M, orientation: "PORTRAIT", printSizeId: M, frameDesignId: M, matBoardType: "NONE" }], fulfilment: "PICKUP" } as never));
      harness.assert(locked(refused), "Print orders are refused", JSON.stringify(refused));
      await setPlan("STUDIO_UNLIMITED");
      harness.assertEqual(await hasFeature(lumina.id, "wallArt"), true, "Production plan: wall art");
      const page = await readFile("app/[tenantSlug]/visualizer/page.tsx", "utf8");
      harness.assert(/hasFeature\(.*"wallArt"\)/.test(page), "The visualizer page checks the plan");
      const nav = await readFile("components/showcase/showcase-nav.tsx", "utf8");
      harness.assert(/showWallArt|wallArt/.test(nav), "The website bar hides the link without it");
    } finally {
      await restorePlan();
    }
  });

  // ── Task 5: upgrade panels, menu locks and the plan banner ──────────────────────────────
  const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]);

  await harness.test("T38-UI-01: locked pages carry the upgrade panel; plans with the feature, and super-admins, don't see it", async () => {
    try {
      // Each locked page renders <PlanPanel> for its feature (the pages' own client parts can't render here).
      const pages: Array<[string, PlanFeature, PlanCode]> = [
        ["proposals", "proposals", "STARTER"],
        ["inventory", "gear", "PRO"],
        ["frames", "wallArt", "PRO"],
        ["print-orders", "wallArt", "PRO"],
      ];
      for (const [page, feature, lockedOn] of pages) {
        const src = await readFile(`app/[tenantSlug]/admin/${page}/page.tsx`, "utf8");
        harness.assert(src.includes(`<PlanPanel tenantId={tenant.id} feature="${feature}"`), `${page}: the page renders the panel for ${feature}`);
        await setPlan(lockedOn);
        harness.assert(/Contact us to upgrade/.test(html(await PlanPanel({ tenantId: lumina.id, feature, role: "STUDIO_OWNER" }))), `${page}: the panel shows on ${lockedOn}`);
        harness.assertEqual(await PlanPanel({ tenantId: lumina.id, feature, role: "SUPER_ADMIN" }), null, `${page}: a super-admin sees no panel`);
        await setPlan("STUDIO_UNLIMITED");
        harness.assertEqual(await PlanPanel({ tenantId: lumina.id, feature, role: "STUDIO_OWNER" }), null, `${page}: no panel on Production`);
      }
    } finally {
      await restorePlan();
    }
  });

  await harness.test("T38-UI-02: the banner says what the studio needs to know, and the menu marks locked items", async () => {
    const day = (n: number) => new Date(Date.now() + n * DAY_MS);
    const mk = (over: Partial<Parameters<typeof planStatus>[0]>) => planStatus({ subscriptionTier: "PRO", subscriptionStatus: "ACTIVE", trialEndsAt: null, paidUntil: day(30), pausedAt: null, ...over });
    harness.assertEqual(html(PlanBanner({ status: mk({}), contactEmail: "a@b.test" })), "", "Nothing to say while paid up");
    harness.assert(/Your trial ends on/.test(html(PlanBanner({ status: mk({ paidUntil: null, trialEndsAt: day(3) }), contactEmail: null }))), "Last week of a trial");
    harness.assertEqual(html(PlanBanner({ status: mk({ paidUntil: null, trialEndsAt: day(10) }), contactEmail: null })), "", "Early in a trial: nothing");
    harness.assert(/Pay by/.test(html(PlanBanner({ status: mk({ paidUntil: day(-2) }), contactEmail: "a@b.test" }))), "Overdue: pay by the grace date");
    const paused = html(PlanBanner({ status: mk({ pausedAt: day(-1) }), contactEmail: "owner@cineflow.test" }));
    harness.assert(/Contact us to renew/.test(paused) && /owner@cineflow\.test/.test(paused), "Paused: renew, with the contact");
    const entries = visibleNavItems("lumina-cine", await loadAccess({ id: owner.id, role: "STUDIO_OWNER", tenantId: lumina.id }), true);
    const feats = entries.flatMap((e) => (e.kind === "group" ? e.items.map((i) => i.feature) : [])).filter(Boolean);
    harness.assert(feats.includes("gear") && feats.includes("wallArt") && feats.includes("proposals"), "Menu items carry the feature they need", JSON.stringify(feats));
  });

  // ── Task 6: sign-up starts the trial ────────────────────────────────────────────────────
  await harness.test("T38-SIGNUP-01: a new studio starts a 14-day trial on the plan it chose", async () => {
    const saved = process.env.STUDIO_SIGNUP_CODE;
    const slug = `t38-new-${Date.now().toString(36)}`;
    try {
      delete process.env.STUDIO_SIGNUP_CODE;
      const res = await withSession(null, () =>
        onboardStudio({ name: "T38 New Studio", slug, discipline: "HYBRID", currency: "MYR", ownerName: "T38 Owner", ownerEmail: `${slug}@studio.test`, ownerPhone: "+60123456789", password: "StrongPassword123!", subscriptionTier: "STARTER" } as never)
      );
      harness.assert((res as { success?: boolean }).success === true, "Created", JSON.stringify(res));
      const row = await db.tenant.findUnique({ where: { slug } });
      const st = planStatus(row!);
      harness.assertEqual(st.state, "TRIAL", "In a trial");
      harness.assertEqual(row?.subscriptionTier, "STARTER", "Keeps the chosen plan for after the trial");
      const days = Math.round(((row!.trialEndsAt?.getTime() ?? 0) - Date.now()) / DAY_MS);
      harness.assert(days >= 13 && days <= 14, "About 14 days", String(days));
      harness.assert(st.features.has("gear"), "Everything is open during the trial");
    } finally {
      if (saved === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = saved;
      const t = await db.tenant.findUnique({ where: { slug } });
      if (t) {
        await db.user.deleteMany({ where: { tenantId: t.id } });
        await db.tenant.delete({ where: { id: t.id } }).catch(() => {});
      }
    }
  });

  // ── Task 7: super-admin actions ─────────────────────────────────────────────────────────
  const ymd = (n: number) => new Date(Date.now() + n * DAY_MS + 8 * 3_600_000).toISOString().slice(0, 10); // Malaysia date
  const pay = (over: Record<string, unknown> = {}) =>
    withSession(superAdmin, () =>
      recordPlatformPayment({ tenantId: lumina.id, amount: 249, method: "BANK_TRANSFER", plan: "PRO", paidUntil: ymd(30), reference: "T38", ...over } as never)
    );
  const tenantNow = () => db.tenant.findUniqueOrThrow({ where: { id: lumina.id } });

  await harness.test("T38-ADMIN-01: recording a payment sets the plan and the paid-until day, and never shortens it", async () => {
    try {
      await db.tenant.update({ where: { id: lumina.id }, data: { subscriptionTier: "STARTER", paidUntil: null, trialEndsAt: null, pausedAt: null, pauseReason: null } });
      const before = (await withSession(superAdmin, () => getStudioPayments(lumina.id))).length;
      const r = await pay({ plan: "PRO", paidUntil: ymd(40) });
      harness.assert((r as { success?: boolean }).success === true, "Recorded", JSON.stringify(r));
      let row = await tenantNow();
      harness.assertEqual(row.subscriptionTier, "PRO", "The payment's plan applies");
      harness.assertEqual(planStatus(row).endsOn, ymd(40), "Paid until the entered day");
      await pay({ paidUntil: ymd(10) });
      row = await tenantNow();
      harness.assertEqual(planStatus(row).endsOn, ymd(40), "A back-dated payment doesn't shorten it");
      harness.assertEqual((await withSession(superAdmin, () => getStudioPayments(lumina.id))).length, before + 2, "Both payments are on record");
      const bad = await pay({ amount: -5 });
      harness.assert((bad as { success?: boolean }).success === false, "A negative amount is refused");
    } finally {
      await db.platformPayment.deleteMany({ where: { reference: "T38" } });
      await restorePlan();
    }
  });

  await harness.test("T38-ADMIN-02: a payment resumes a studio paused for lateness only if it covers it; a manual pause stays", async () => {
    try {
      await db.tenant.update({ where: { id: lumina.id }, data: { subscriptionTier: "PRO", paidUntil: new Date(`${ymd(-30)}T00:00:00+08:00`), trialEndsAt: null, pausedAt: new Date(), pauseReason: "OVERDUE" } });
      await pay({ paidUntil: ymd(-20) });
      let row = await tenantNow();
      harness.assert(row.pausedAt !== null, "Still past the grace period: stays paused");
      await pay({ paidUntil: ymd(30) });
      row = await tenantNow();
      harness.assertEqual(row.pausedAt, null, "Covered: resumed");
      harness.assertEqual(planStatus(row).state, "ACTIVE", "Active again");
      await withSession(superAdmin, () => pauseStudio({ tenantId: lumina.id, reason: "Asked to pause" }));
      await pay({ paidUntil: ymd(60) });
      row = await tenantNow();
      harness.assert(row.pausedAt !== null && row.pauseReason === "MANUAL", "A manual pause stays through a payment");
      const resumed = await withSession(superAdmin, () => resumeStudio({ tenantId: lumina.id }));
      harness.assert((resumed as { success?: boolean }).success === true, "Resume");
      harness.assertEqual((await tenantNow()).pausedAt, null, "…clears it");
    } finally {
      await db.platformPayment.deleteMany({ where: { reference: "T38" } });
      await restorePlan();
    }
  });

  await harness.test("T38-ADMIN-03: closing a studio needs its address typed; a closed studio's pages are gone", async () => {
    const slug = `t38-close-${Date.now().toString(36)}`;
    const t = await db.tenant.create({ data: { name: "T38 Close", slug } });
    try {
      const wrong = await withSession(superAdmin, () => closeStudio({ tenantId: t.id, confirmSlug: "nope" }));
      harness.assert((wrong as { success?: boolean }).success === false, "Wrong confirmation: refused");
      harness.assertEqual((await db.tenant.findUnique({ where: { id: t.id } }))?.subscriptionStatus, "ACTIVE", "Still there");
      const ok = await withSession(superAdmin, () => closeStudio({ tenantId: t.id, confirmSlug: slug }));
      harness.assert((ok as { success?: boolean }).success === true, "Right confirmation: closed");
      harness.assertEqual(planStatus((await db.tenant.findUnique({ where: { id: t.id } }))!).state, "CLOSED", "State is closed");
    } finally {
      await db.tenant.delete({ where: { id: t.id } }).catch(() => {});
    }
  });

  await harness.test("T38-ADMIN-04: only a super-admin can do any of it; revenue is what was recorded", async () => {
    try {
      const attempts: Array<[string, () => Promise<unknown>]> = [
        ["recordPlatformPayment", () => withSession(owner, () => recordPlatformPayment({ tenantId: lumina.id, amount: 1, method: "CASH", plan: "PRO", paidUntil: ymd(5) } as never))],
        ["changeStudioPlan", () => withSession(owner, () => changeStudioPlan({ tenantId: lumina.id, plan: "STUDIO_UNLIMITED" }))],
        ["extendTrial", () => withSession(owner, () => extendTrial({ tenantId: lumina.id, until: ymd(5) }))],
        ["pauseStudio", () => withSession(owner, () => pauseStudio({ tenantId: lumina.id, reason: "x" }))],
        ["resumeStudio", () => withSession(owner, () => resumeStudio({ tenantId: lumina.id }))],
        ["closeStudio", () => withSession(owner, () => closeStudio({ tenantId: lumina.id, confirmSlug: "lumina-cine" }))],
      ];
      for (const [name, call] of attempts) {
        let refused = false;
        try {
          const res = (await call()) as { success?: boolean } | undefined;
          refused = res?.success === false;
        } catch {
          refused = true;
        }
        harness.assert(refused, `${name}: refused for a studio owner`);
      }
      harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.subscriptionStatus, "ACTIVE", "Nothing was changed");

      const m0 = await withSession(superAdmin, () => getPlatformMetrics());
      await pay({ amount: 300 });
      await pay({ amount: 99.5, plan: "STARTER", paidUntil: ymd(35) });
      const m1 = await withSession(superAdmin, () => getPlatformMetrics());
      harness.assertEqual(Math.round((m1.revenueThisMonth - m0.revenueThisMonth) * 100), 39950, "Revenue this month grows by what was recorded");
      harness.assertEqual(Math.round((m1.revenue12m - m0.revenue12m) * 100), 39950, "…and in the last 12 months");
      harness.assert(!("estimatedMrrUsd" in m1), "The list-price estimate is gone");
    } finally {
      await db.platformPayment.deleteMany({ where: { reference: "T38" } });
      await restorePlan();
    }
  });
}
