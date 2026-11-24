import { studioNow } from "@/lib/slot-time";
import { ALL_FEATURES, PLANS, asPlanCode, type PlanCode, type PlanFeature } from "@/lib/billing/plans";

/**
 * Where a studio stands, worked out from stored dates (nothing has to flip it):
 *   TRIAL    no payment yet, up to the trial's last day: everything unlocked
 *   ACTIVE   up to the paid-until day: the plan applies
 *   OVERDUE  up to 7 days after: works as before, with a warning
 *   PAUSED   later, or paused by hand: read-only, online booking closed
 *   CLOSED   removed from the platform
 * Days are Malaysia-time calendar days; a last day covers the whole day. Safe on server and client.
 */

export type PlanState = "TRIAL" | "ACTIVE" | "OVERDUE" | "PAUSED" | "CLOSED";

export const GRACE_DAYS = 7;
/** The free trial a new studio starts with. */
export const TRIAL_DAYS = 14;

export interface TenantPlanFields {
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  pausedAt: Date | null;
}

export interface PlanStatus {
  state: PlanState;
  plan: PlanCode;
  /** YYYY-MM-DD: the last day of the trial or paid period. */
  endsOn: string | null;
  /** YYYY-MM-DD: the last day of grace. */
  graceEndsOn: string | null;
  features: Set<PlanFeature>;
  teamLimit: number;
}

const DAY_MS = 86_400_000;

/** `day` (YYYY-MM-DD) plus `n` days. */
export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

const dayOf = (d: Date) => studioNow(d).dateKey;

export function planStatus(t: TenantPlanFields, now: Date = new Date()): PlanStatus {
  const plan = asPlanCode(t.subscriptionTier);
  const endDate = t.paidUntil ?? t.trialEndsAt;
  const endsOn = endDate ? dayOf(endDate) : null;
  const graceEndsOn = endsOn ? addDays(endsOn, GRACE_DAYS) : null;
  const today = dayOf(now);

  let state: PlanState;
  if (t.subscriptionStatus === "CANCELLED") state = "CLOSED";
  else if (t.pausedAt) state = "PAUSED";
  else if (!endsOn) state = "ACTIVE"; // no dates recorded (a studio from before plans): nothing to run out
  else if (today <= endsOn) state = t.paidUntil ? "ACTIVE" : "TRIAL";
  else if (today <= graceEndsOn!) state = "OVERDUE";
  else state = "PAUSED";

  const trial = state === "TRIAL";
  return {
    state,
    plan,
    endsOn,
    graceEndsOn,
    features: new Set(trial ? ALL_FEATURES : PLANS[plan].features),
    teamLimit: trial ? Infinity : PLANS[plan].teamLimit,
  };
}
