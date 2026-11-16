"use server";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth/access-guard";
import { dashboardSectionsFor, loadStudioAnalytics, type StudioAnalyticsData } from "@/lib/analytics/studio-analytics";

export type { StudioAnalyticsData } from "@/lib/analytics/studio-analytics";

/** The Overview figures for the studio. The figures are money: Invoices VIEW; the other sections follow their own areas. */
export async function getStudioAnalytics(tenantSlug: string): Promise<StudioAnalyticsData | null> {
  let user;
  try {
    // Compares ids, so slug renames are safe.
    const studio = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    user = await requireAccess(studio?.id ?? "", "invoices", "VIEW");
  } catch (error) {
    console.error("Error fetching studio analytics:", error);
    return null;
  }
  return loadStudioAnalytics(tenantSlug, dashboardSectionsFor(user.access));
}
