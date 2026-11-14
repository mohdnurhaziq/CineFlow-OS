import type { Prisma } from "@prisma/client";

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
