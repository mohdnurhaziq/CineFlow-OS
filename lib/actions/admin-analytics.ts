"use server";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth/access-guard";
import { loadStudioAnalytics, type StudioAnalyticsData } from "@/lib/analytics/studio-analytics";

export type { StudioAnalyticsData } from "@/lib/analytics/studio-analytics";

/** Every Overview figure for the studio. The figures are money: Invoices VIEW. */
export async function getStudioAnalytics(tenantSlug: string): Promise<StudioAnalyticsData | null> {
  try {
    // Compares ids, so slug renames are safe.
    const studio = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    await requireAccess(studio?.id ?? "", "invoices", "VIEW");
  } catch (error) {
    console.error("Error fetching studio analytics:", error);
    return null;
  }
  return loadStudioAnalytics(tenantSlug);
}
