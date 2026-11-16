import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { levelAtLeast, type AccessMap } from "@/lib/auth/access";

/**
 * Which projects each tab of the admin Projects page shows. Every confirmed booking has a
 * project, so the list is split by kind; projects whose booking was cancelled or a no-show
 * only appear under All. Not a "use server" module.
 */
export type ProjectListTab = "productions" | "sessions" | "all";

export const PROJECT_LIST_TABS: ProjectListTab[] = ["productions", "sessions", "all"];

/**
 * Projects still in play: from a proposal (no booking), or from a booking that wasn't cancelled
 * or a no-show. Used wherever a cancelled booking's gallery shouldn't count: the client's list,
 * studio stats, and the Productions / Sessions tabs.
 */
export const liveProjectWhere: Prisma.ProjectWhereInput = {
  OR: [{ bookingId: null }, { booking: { status: { notIn: ["CANCELLED", "NO_SHOW"] } } }],
};

export function projectListWhere(tenantId: string, tab: ProjectListTab): Prisma.ProjectWhereInput {
  if (tab === "all") return { tenantId };
  return { tenantId, kind: tab === "productions" ? "PRODUCTION" : "SESSION", ...liveProjectWhere };
}

/** Who is looking at the list: their id (for "Only their own") and their access. */
export interface ProjectListViewer {
  id: string;
  access: AccessMap;
}

/**
 * Which of a studio's projects the viewer's Galleries access covers: all of them at VIEW and up;
 * at OWN those they lead or are assigned to the booking of (as canAccessProject); none otherwise.
 */
function visibleProjectsWhere(viewer: ProjectListViewer): Prisma.ProjectWhereInput | null {
  const level = viewer.access.areas.galleries;
  if (level === "NONE") return null;
  if (levelAtLeast(level, "VIEW")) return {};
  return { OR: [{ studioLeadId: viewer.id }, { booking: { assignments: { some: { userId: viewer.id } } } }] };
}

/** The admin Projects (Galleries) page list for one tab, newest first, filtered to the viewer's access. */
export async function loadAdminProjects(tenantId: string, viewer: ProjectListViewer, tab: ProjectListTab = "all") {
  const visible = visibleProjectsWhere(viewer);
  if (!visible) return [];
  return db.project.findMany({
    where: { AND: [projectListWhere(tenantId, tab), visible] },
    include: {
      client: { select: { name: true } },
      callSheets: { select: { shootDate: true }, orderBy: { shootDate: "asc" } },
      deliverables: { select: { _count: { select: { items: true } } } },
      booking: { select: { id: true, trackingCode: true, category: true, serviceTier: true } },
      proposal: { select: { id: true, proposalNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** How many projects each tab holds for this viewer. */
export async function countAdminProjects(tenantId: string, viewer: ProjectListViewer): Promise<Record<ProjectListTab, number>> {
  const visible = visibleProjectsWhere(viewer);
  const counts = await Promise.all(
    PROJECT_LIST_TABS.map(async (t) =>
      [t, visible ? await db.project.count({ where: { AND: [projectListWhere(tenantId, t), visible] } }) : 0] as const
    )
  );
  return Object.fromEntries(counts) as Record<ProjectListTab, number>;
}
