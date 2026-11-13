"use server";

import { db } from "@/lib/db";
import { AuthorizationError, requireOwner, requireStaffBySlug } from "@/lib/auth/guard";

type Result = { success: boolean; error?: string };

function refusal(err: unknown): Result {
  if (err instanceof AuthorizationError) return { success: false, error: err.message };
  console.error("Onboarding guide action failed:", err);
  return { success: false, error: "Something went wrong. Please try again." };
}

/** The studio owner closes the setup checklist on their dashboard. Remembered on their account. */
export async function dismissSetupChecklist(tenantSlug: string): Promise<Result> {
  try {
    const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    const session = await requireOwner(tenant?.id ?? null);
    // Super admins pass requireOwner, but the checklist is only ever shown to the studio's own owner.
    if (session.role !== "STUDIO_OWNER") throw new AuthorizationError();
    await db.user.update({ where: { id: session.id }, data: { onboardingChecklistDismissedAt: new Date() } });
    return { success: true };
  } catch (err) {
    return refusal(err);
  }
}

/** Any staff member finished or skipped the dashboard tour. Only their own account is updated. */
export async function markTourSeen(tenantSlug: string): Promise<Result> {
  try {
    const session = await requireStaffBySlug(tenantSlug);
    await db.user.update({ where: { id: session.id }, data: { onboardingTourSeenAt: new Date() } });
    return { success: true };
  } catch (err) {
    return refusal(err);
  }
}
