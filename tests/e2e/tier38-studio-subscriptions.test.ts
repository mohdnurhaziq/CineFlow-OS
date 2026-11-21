/**
 * Tier 38: studio subscriptions (docs/superpowers/specs/2026-11-21-studio-subscriptions-design.md).
 */

import { TestHarness } from "./test-harness";
import { PLANS, cheapestPlanWith } from "@/lib/billing/plans";
import { planStatus } from "@/lib/billing/state";

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
}
