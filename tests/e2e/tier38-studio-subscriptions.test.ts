/**
 * Tier 38: studio subscriptions (docs/superpowers/specs/2026-11-21-studio-subscriptions-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, cheapestPlanWith } from "@/lib/billing/plans";
import { planStatus } from "@/lib/billing/state";
import type { PlanCode } from "@/lib/billing/plans";
import { PlanLockedError, requireFeature } from "@/lib/billing/guard";
import { db } from "@/lib/db";
import { withSession } from "./mocks/session";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { cleanupExpiredHolds } from "@/lib/actions/admin-calendar";

const myt = (day: string, time = "00:00:00") => new Date(`${day}T${time}+08:00`);

export async function runTier38StudioSubscriptionsTests(harness: TestHarness) {
  harness.setSuite("Tier 38", "Studio subscriptions");

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
}
