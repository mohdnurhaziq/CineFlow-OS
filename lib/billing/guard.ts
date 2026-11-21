import { db } from "@/lib/db";
import { FEATURE_LABEL, PLANS, cheapestPlanWith, type PlanFeature } from "@/lib/billing/plans";
import { planStatus, type PlanStatus } from "@/lib/billing/state";

/**
 * Server-side plan checks (docs/superpowers/specs/2026-11-21-studio-subscriptions-design.md).
 * Platform super-admins are never blocked. Not a "use server" module.
 */

export type PlanLockCode = "PLAN_UPGRADE_REQUIRED" | "PLAN_PAUSED" | "PLAN_TEAM_LIMIT";

/** Refused by the studio's plan; `message` is plain words for the person. Not an AuthorizationError on purpose: it is shown as written. */
export class PlanLockedError extends Error {
  constructor(public code: PlanLockCode, message: string) {
    super(message);
    this.name = "PlanLockedError";
  }
}

export const PAUSED_MESSAGE = "Your plan has ended. Contact us to renew.";
export const BOOKINGS_CLOSED_MESSAGE = "This studio isn't taking bookings online right now.";

export async function loadPlanStatus(tenantId: string): Promise<PlanStatus> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, pausedAt: true },
  });
  // A studio that isn't there has nothing to enforce; the caller's own checks will refuse it.
  return planStatus(t ?? { subscriptionTier: "PRO", subscriptionStatus: "ACTIVE", trialEndsAt: null, paidUntil: null, pausedAt: null });
}

const isSuper = (user?: { role: string } | null) => user?.role === "SUPER_ADMIN";

/** Refuses a change in a paused studio. */
export async function assertNotPaused(tenantId: string, user?: { role: string } | null): Promise<void> {
  if (isSuper(user)) return;
  if ((await loadPlanStatus(tenantId)).state === "PAUSED") throw new PlanLockedError("PLAN_PAUSED", PAUSED_MESSAGE);
}

/** Whether online booking is open (a paused studio's isn't). */
export async function bookingsOpen(tenantId: string): Promise<boolean> {
  return (await loadPlanStatus(tenantId)).state !== "PAUSED";
}

export function featureLockedMessage(feature: PlanFeature): string {
  return `${FEATURE_LABEL_HEAD[feature]} ${feature === "team" ? "are" : "is"} on the ${PLANS[cheapestPlanWith(feature)].name} plan. Contact us to upgrade.`;
}

// The sentence's subject for each feature ("Proposals is on the Studio plan").
const FEATURE_LABEL_HEAD: Record<PlanFeature, string> = {
  team: "Team & shoot assignments",
  proposals: "Proposals",
  callSheets: "Call sheets & releases",
  customDomain: "Custom domains",
  wallArt: "The wall-art visualizer & print orders",
  gear: "Gear inventory",
};

/** Refuses unless the studio's plan (or its trial) includes `feature`. */
export async function requireFeature(tenantId: string, feature: PlanFeature, user?: { role: string } | null): Promise<void> {
  if (isSuper(user)) return;
  if (!(await loadPlanStatus(tenantId)).features.has(feature)) {
    throw new PlanLockedError("PLAN_UPGRADE_REQUIRED", featureLockedMessage(feature));
  }
}

/** Whether `feature` is on for the studio (for pages that hide links to it). */
export async function hasFeature(tenantId: string, feature: PlanFeature): Promise<boolean> {
  return (await loadPlanStatus(tenantId)).features.has(feature);
}

/** The email a studio is told to contact: the first platform super-admin. */
export async function platformContactEmail(): Promise<string | null> {
  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" }, select: { email: true } });
  return admin?.email ?? null;
}

// FEATURE_LABEL is re-exported for the panels.
export { FEATURE_LABEL };
