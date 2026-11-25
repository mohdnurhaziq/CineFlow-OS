"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * A client finished or skipped the tour of their portal. Only their own account, in the studio they are
 * signed in to, is updated: staff have their own tour, and another studio's clients are refused.
 */
export async function markClientTourSeen(tenantSlug: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [session, tenant] = await Promise.all([
      getCurrentUser(),
      db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } }),
    ]);
    if (!session || !tenant || session.role !== "CLIENT" || session.tenantId !== tenant.id) {
      return { success: false, error: "Please sign in to continue." };
    }
    await db.user.update({ where: { id: session.id }, data: { onboardingTourSeenAt: new Date() } });
    return { success: true };
  } catch (err) {
    console.error("Client tour action failed:", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
