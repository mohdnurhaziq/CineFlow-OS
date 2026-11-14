import type { PrismaClient } from "@prisma/client";
import { isProjectCategorySlug, projectKindForBooking, provisionProjectForBooking, type ProjectKind } from "@/lib/bookings/project-promotion";

/**
 * One-off backfill for "every booking gets a gallery" (run by prisma/backfill-booking-projects.ts).
 *
 * 1. carryOverCategories: before this change a category's "auto-create project" box was also
 *    true in effect when its name sounded like a production (wedding, event, corporate...).
 *    Categories now decide by their Session / Production choice alone, so mark those as
 *    Production once. Run it on the first backfill only: afterwards it would undo a studio
 *    that deliberately set such a category to Session.
 * 2. Every confirmed / completed / delivered booking without a project gets one, starting at
 *    the stage the booking already reached (delivered -> Delivered, shoot done -> editing).
 *
 * Only creates; never changes an existing project. Safe to re-run without carryOverCategories.
 * Not a "use server" module.
 */

export interface BackfillResult {
  categories: Array<{ tenantSlug: string; slug: string; name: string }>;
  created: Array<{ tenantSlug: string; trackingCode: string; projectNumber?: string; kind: ProjectKind; status: string }>;
}

const STAGE_FOR_BOOKING: Record<string, string> = {
  CONFIRMED: "PRE_PRODUCTION",
  COMPLETED: "POST_PRODUCTION",
  DELIVERED: "DELIVERED",
};

export async function backfillBookingProjects(
  db: PrismaClient,
  opts: { dryRun: boolean; carryOverCategories: boolean }
): Promise<BackfillResult> {
  const result: BackfillResult = { categories: [], created: [] };

  if (opts.carryOverCategories) {
    const rows = await db.campaignCategory.findMany({
      where: { isProduction: false },
      select: { id: true, slug: true, name: true, tenantId: true, tenant: { select: { slug: true } } },
    });
    for (const row of rows.filter((r) => isProjectCategorySlug(r.slug) || isProjectCategorySlug(r.name))) {
      result.categories.push({ tenantSlug: row.tenant.slug, slug: row.slug, name: row.name });
      if (!opts.dryRun) await db.campaignCategory.update({ where: { id: row.id }, data: { isProduction: true } });
    }
  }
  const carried = new Set(result.categories.map((c) => `${c.tenantSlug}/${c.slug}`));

  const bookings = await db.clientBooking.findMany({
    where: { status: { in: Object.keys(STAGE_FOR_BOOKING) }, project: null },
    select: { id: true, tenantId: true, category: true, status: true, trackingCode: true, tenant: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  for (const booking of bookings) {
    const status = STAGE_FOR_BOOKING[booking.status]!;
    if (opts.dryRun) {
      const kind = carried.has(`${booking.tenant.slug}/${booking.category}`) ? "PRODUCTION" : await projectKindForBooking(db, booking);
      result.created.push({ tenantSlug: booking.tenant.slug, trackingCode: booking.trackingCode, kind, status });
      continue;
    }
    const made = await db.$transaction(async (tx) => {
      const provisioned = await provisionProjectForBooking(tx, booking.id);
      if (!provisioned || provisioned.alreadyExists) return null;
      return tx.project.update({ where: { id: provisioned.project.id }, data: { status }, select: { projectNumber: true, kind: true } });
    });
    if (made) {
      result.created.push({
        tenantSlug: booking.tenant.slug,
        trackingCode: booking.trackingCode,
        projectNumber: made.projectNumber,
        kind: made.kind as ProjectKind,
        status,
      });
    }
  }
  return result;
}
