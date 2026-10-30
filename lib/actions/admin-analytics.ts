"use server";

import { db } from "@/lib/db";

export interface StudioAnalyticsData {
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

export async function getStudioAnalytics(tenantSlug: string): Promise<StudioAnalyticsData | null> {
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

    // Run parallel analytical aggregations
    const [
      invoices,
      projects,
      bookings,
      slots,
      inventoryItems,
      proposals,
      callSheets,
    ] = await Promise.all([
      db.milestoneInvoice.findMany({
        where: { tenantId },
        include: {
          client: { select: { name: true } },
          project: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.project.findMany({
        where: { tenantId },
        select: { id: true, status: true, budget: true },
      }),
      db.clientBooking.findMany({
        where: { tenantId },
        select: { id: true, status: true },
      }),
      db.bookingSlot.findMany({
        where: { tenantId },
        select: { id: true, status: true },
      }),
      db.inventoryItem.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          condition: true,
          serialNumber: true,
        },
      }),
      db.proposal.findMany({
        where: { tenantId },
        select: { id: true, status: true, totalPrice: true },
      }),
      db.callSheet.findMany({
        where: {
          project: { tenantId },
        },
        include: {
          project: { select: { title: true } },
        },
        orderBy: { shootDate: "asc" },
        take: 5,
      }),
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
    const completedProjectsCount = projects.filter(
      (p) => p.status === "DELIVERED"
    ).length;

    // Booking KPIs
    const confirmedBookingsCount = bookings.filter(
      (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
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
      totalPipelineValue += prop.totalPrice;
      if (prop.status === "ACCEPTED") acceptedProposals++;
      else if (prop.status === "SENT") sentProposals++;
      else if (prop.status === "DRAFT") draftProposals++;
    }

    // Format top 6 recent invoices
    const recentInvoices = invoices.slice(0, 6).map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client?.name ?? "Client",
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
      projectTitle: cs.project?.title ?? "Shoot Production",
      shootDate: cs.shootDate
        ? new Date(cs.shootDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "TBD",
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
