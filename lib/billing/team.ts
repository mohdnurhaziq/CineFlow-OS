import { db } from "@/lib/db";
import { PLANS } from "@/lib/billing/plans";
import { PlanLockedError, loadPlanStatus } from "@/lib/billing/guard";

/**
 * Staff accounts of a studio other than the owner: not clients, not removed members. A member who
 * hasn't accepted yet is already an account, so open invitations count.
 */
export async function countTeamSeats(tenantId: string): Promise<number> {
  return db.user.count({
    where: { tenantId, deactivatedAt: null, role: { notIn: ["CLIENT", "STUDIO_OWNER", "SUPER_ADMIN"] } },
  });
}

/** Refuses adding (or bringing back) a team member past the plan's limit. Super-admins aren't limited. */
export async function assertTeamSeat(tenantId: string, user?: { role: string } | null): Promise<void> {
  if (user?.role === "SUPER_ADMIN") return;
  const limit = (await loadPlanStatus(tenantId)).teamLimit;
  if (limit === Infinity) return;
  if ((await countTeamSeats(tenantId)) >= limit) {
    throw new PlanLockedError(
      "PLAN_TEAM_LIMIT",
      limit === 0 ? "Your plan is for the owner only. Contact us to upgrade." : `Your plan includes ${limit} team members. Contact us to upgrade.`
    );
  }
}

export { PLANS };
