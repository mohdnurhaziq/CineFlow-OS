import { db } from "@/lib/db";
import { formatSlotDate } from "@/lib/slot-time";
import { liveProjectWhere } from "@/lib/projects/list";
import { levelAtLeast, type AccessMap } from "@/lib/auth/access";

/**
 * The Overview's figures. Each section is loaded only when the viewer's access covers it
 * (see DashboardSections); a section left out comes back empty or zero.
 *
 * Not a "use server" module: callers must authorize first (the Overview page, or the
 * getStudioAnalytics action, which needs Invoices VIEW).
 */

/** Which parts of the Overview the viewer may see. */
export interface DashboardSections {
  /** Money tiles, recent invoices, payments to verify: Invoices VIEW. */
  money: boolean;
  /** Galleries in play and confirmed bookings (studio-wide counts): Galleries or Bookings VIEW. */
  work: boolean;
  /** Gear tile and gear alerts: Production VIEW. */
  gear: boolean;
  /** Proposal pipeline: Proposals VIEW. */
  proposals: boolean;
  /** Upcoming shoots (call sheets): Production VIEW. */
  shoots: boolean;
  /** The "Open Calendar" button: Bookings VIEW. */
  calendar: boolean;
}

/** The parts of the Overview this access covers. */
export function dashboardSectionsFor(access: AccessMap): DashboardSections {
  const has = levelAtLeast;
  return {
    money: has(access.areas.invoices, "VIEW"),
    work: has(access.areas.galleries, "VIEW") || has(access.areas.bookings, "VIEW"),
    gear: has(access.areas.production, "VIEW"),
    proposals: has(access.areas.proposals, "VIEW"),
    shoots: has(access.areas.production, "VIEW"),
    calendar: has(access.areas.bookings, "VIEW"),
  };
}

export interface StudioAnalyticsData {
  /** What the viewer may see; the rest is empty or zero. */
  sections: DashboardSections;
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    discipline: string;
    brandColor: string | null;
  };
  kpis: {
    totalRevenue: number;
    pendingVerificationAmount: number;
    pendingVerificationCount: number;
    outstandingBalance: number;
    activeProjectsCount: number;
    completedProjectsCount: number;
    confirmedBookingsCount: number;
    heldSlotsCount: number;
    gearTotalCount: number;
    gearAvailableCount: number;
    gearOnShootCount: number;
    gearMaintenanceCount: number;
    gearUtilizationRate: number;
  };
  proposalsSummary: {
    total: number;
    accepted: number;
    sent: number;
    draft: number;
    totalPipelineValue: number;
  };
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    projectId: string | null;
    projectTitle: string | null;
    milestoneType: string;
    amount: number;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
    paidAt: string | null;
  }>;
  upcomingCallSheets: Array<{
    id: string;
    title: string;
    projectId: string | null;
    projectTitle: string;
    shootDate: string;
    callTime: string;
    locationName: string;
    weatherSummary: string | null;
  }>;
  gearAlerts: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    condition: string;
    serialNumber: string | null;
  }>;
}

/** `sections` is required: the caller says what the viewer may see (dashboardSectionsFor). */
export async function loadStudioAnalytics(tenantSlug: string, sections: DashboardSections): Promise<StudioAnalyticsData | null> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        discipline: true,
        brandColor: true,
      },
    });

    if (!tenant) return null;

    const tenantId = tenant.id;

    // Run parallel analytical aggregations, each only for a section the viewer may see.
    const [invoices, projects, bookings, slots, inventoryItems, proposals, callSheets] = await Promise.all([
      sections.money
        ? db.milestoneInvoice.findMany({
            where: { tenantId },
            include: {
              client: { select: { name: true } },
              project: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : [],
      // A cancelled booking's gallery is not a project in play.
      sections.work
        ? db.project.findMany({
            where: { tenantId, ...liveProjectWhere },
            select: { id: true, status: true },
          })
        : [],
      sections.work
        ? db.clientBooking.findMany({
            where: { tenantId },
            select: { id: true, status: true, project: { select: { id: true } } },
          })
        : [],
      sections.work
        ? db.bookingSlot.findMany({
            where: { tenantId },
            select: { id: true, status: true },
          })
        : [],
      sections.gear
        ? db.inventoryItem.findMany({
            where: { tenantId },
            select: {
              id: true,
              name: true,
              category: true,
              status: true,
              condition: true,
              serialNumber: true,
            },
          })
        : [],
      sections.proposals
        ? db.proposal.findMany({
            where: { tenantId },
            select: { id: true, status: true, totalPrice: true },
          })
        : [],
      sections.shoots
        ? db.callSheet.findMany({
            where: {
              project: { tenantId },
            },
            include: {
              project: { select: { id: true, title: true } },
            },
            orderBy: { shootDate: "asc" },
            take: 5,
          })
        : [],
    ]);

    // Financial KPI aggregations
    let totalRevenue = 0;
    let pendingVerificationAmount = 0;
    let pendingVerificationCount = 0;
    let outstandingBalance = 0;

    for (const inv of invoices) {
      if (inv.status === "PAID") {
        totalRevenue += inv.amount;
      } else if (inv.status === "PENDING_VERIFICATION") {
        pendingVerificationAmount += inv.amount;
        pendingVerificationCount++;
      } else if (inv.status === "PENDING" || inv.status === "OVERDUE") {
        outstandingBalance += inv.amount;
      }
    }

    // Project KPIs
    const activeProjectsCount = projects.filter(
      (p) => p.status !== "DELIVERED" && p.status !== "ARCHIVED"
    ).length;
    // "Delivered" covers finished projects, plus delivered bookings that have no project
    // (older ones); a booking and its own project are one job and count once.
    const completedProjectsCount =
      projects.filter((p) => p.status === "DELIVERED").length +
      bookings.filter((b) => b.status === "DELIVERED" && !b.project).length;

    // Booking KPIs
    const confirmedBookingsCount = bookings.filter(
      (b) => b.status === "CONFIRMED"
    ).length;
    const heldSlotsCount = slots.filter((s) => s.status === "HELD").length;

    // Fleet KPIs
    const gearTotalCount = inventoryItems.length;
    const gearAvailableCount = inventoryItems.filter(
      (i) => i.status === "AVAILABLE"
    ).length;
    const gearOnShootCount = inventoryItems.filter(
      (i) => i.status === "ON_SHOOT"
    ).length;
    const gearMaintenanceCount = inventoryItems.filter(
      (i) => i.status === "MAINTENANCE" || i.condition === "DAMAGED"
    ).length;

    const gearUtilizationRate =
      gearTotalCount > 0
        ? Math.round(((gearTotalCount - gearAvailableCount) / gearTotalCount) * 100)
        : 0;

    // Proposals Pipeline
    let acceptedProposals = 0;
    let sentProposals = 0;
    let draftProposals = 0;
    let totalPipelineValue = 0;

    for (const prop of proposals) {
      // A declined proposal is no longer work in the pipeline.
      if (prop.status !== "DECLINED") totalPipelineValue += prop.totalPrice;
      if (prop.status === "ACCEPTED") acceptedProposals++;
      else if (prop.status === "SENT") sentProposals++;
      else if (prop.status === "DRAFT") draftProposals++;
    }

    // Format top 6 recent invoices
    const recentInvoices = invoices.slice(0, 6).map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client?.name ?? "Client",
      projectId: inv.projectId ?? inv.project?.id ?? null,
      projectTitle: inv.project?.title ?? null,
      milestoneType: inv.milestoneType,
      amount: inv.amount,
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      createdAt: inv.createdAt.toISOString(),
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    }));

    // Format upcoming call sheets
    const upcomingCallSheets = callSheets.map((cs) => ({
      id: cs.id,
      title: cs.title,
      projectId: cs.projectId ?? cs.project?.id ?? null,
      projectTitle: cs.project?.title ?? "Shoot Production",
      // Shoot days are calendar days stored as midnight UTC, like booking slots.
      shootDate: cs.shootDate
        ? formatSlotDate(cs.shootDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
        : "Date not set",
      callTime: cs.generalCallTime ?? "08:00 AM",
      locationName: cs.locationName ?? "Studio Set",
      weatherSummary: cs.weatherSummary,
    }));

    // Flagged gear requiring attention
    const gearAlerts = inventoryItems
      .filter((i) => i.status === "MAINTENANCE" || i.condition === "DAMAGED" || i.condition === "FAIR")
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        status: i.status,
        condition: i.condition,
        serialNumber: i.serialNumber,
      }));

    return {
      sections,
      tenant,
      kpis: {
        totalRevenue,
        pendingVerificationAmount,
        pendingVerificationCount,
        outstandingBalance,
        activeProjectsCount,
        completedProjectsCount,
        confirmedBookingsCount,
        heldSlotsCount,
        gearTotalCount,
        gearAvailableCount,
        gearOnShootCount,
        gearMaintenanceCount,
        gearUtilizationRate,
      },
      proposalsSummary: {
        total: proposals.length,
        accepted: acceptedProposals,
        sent: sentProposals,
        draft: draftProposals,
        totalPipelineValue,
      },
      recentInvoices,
      upcomingCallSheets,
      gearAlerts,
    };
  } catch (error) {
    console.error("Error fetching studio analytics:", error);
    return null;
  }
}
