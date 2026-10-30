"use server";

import { db } from "@/lib/db";

export interface PlatformMetrics {
  totalStudios: number;
  studiosByDiscipline: Record<string, number>;
  studiosByTier: Record<string, number>;
  studiosByStatus: Record<string, number>;
  totalBookings: number;
  bookingsByStatus: Record<string, number>;
  totalInvoicesCount: number;
  paidRevenueUsd: number;
  paidRevenueMyr: number;
  pendingVerificationCount: number;
  pendingVerificationAmountUsd: number;
  pendingVerificationAmountMyr: number;
  estimatedMrrUsd: number;
  totalUsers: number;
  activeProjects: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const [
    totalStudios,
    tenants,
    totalBookings,
    bookings,
    invoices,
    totalUsers,
    activeProjects,
  ] = await Promise.all([
    db.tenant.count(),
    db.tenant.findMany({
      select: {
        id: true,
        discipline: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        currency: true,
      },
    }),
    db.clientBooking.count(),
    db.clientBooking.findMany({ select: { status: true } }),
    db.milestoneInvoice.findMany({
      select: {
        amount: true,
        status: true,
        tenant: { select: { currency: true } },
      },
    }),
    db.user.count(),
    db.project.count({
      where: {
        status: { in: ["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION", "IN_REVIEW"] },
      },
    }),
  ]);

  const studiosByDiscipline: Record<string, number> = {};
  const studiosByTier: Record<string, number> = {};
  const studiosByStatus: Record<string, number> = {};
  let estimatedMrrUsd = 0;

  for (const t of tenants) {
    studiosByDiscipline[t.discipline] = (studiosByDiscipline[t.discipline] || 0) + 1;
    studiosByTier[t.subscriptionTier] = (studiosByTier[t.subscriptionTier] || 0) + 1;
    studiosByStatus[t.subscriptionStatus] = (studiosByStatus[t.subscriptionStatus] || 0) + 1;

    if (t.subscriptionStatus === "ACTIVE") {
      if (t.subscriptionTier === "STARTER") estimatedMrrUsd += 29;
      else if (t.subscriptionTier === "PRO") estimatedMrrUsd += 79;
      else if (t.subscriptionTier === "STUDIO_UNLIMITED") estimatedMrrUsd += 199;
    }
  }

  const bookingsByStatus: Record<string, number> = {};
  for (const b of bookings) {
    bookingsByStatus[b.status] = (bookingsByStatus[b.status] || 0) + 1;
  }

  let paidRevenueUsd = 0;
  let paidRevenueMyr = 0;
  let pendingVerificationCount = 0;
  let pendingVerificationAmountUsd = 0;
  let pendingVerificationAmountMyr = 0;

  for (const inv of invoices) {
    const curr = inv.tenant?.currency || "USD";
    if (inv.status === "PAID") {
      if (curr === "MYR") paidRevenueMyr += inv.amount;
      else paidRevenueUsd += inv.amount;
    } else if (inv.status === "PENDING_VERIFICATION") {
      pendingVerificationCount++;
      if (curr === "MYR") pendingVerificationAmountMyr += inv.amount;
      else pendingVerificationAmountUsd += inv.amount;
    }
  }

  return {
    totalStudios,
    studiosByDiscipline,
    studiosByTier,
    studiosByStatus,
    totalBookings,
    bookingsByStatus,
    totalInvoicesCount: invoices.length,
    paidRevenueUsd,
    paidRevenueMyr,
    pendingVerificationCount,
    pendingVerificationAmountUsd,
    pendingVerificationAmountMyr,
    estimatedMrrUsd,
    totalUsers,
    activeProjects,
  };
}

export async function getAllTenantsSummary() {
  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          clientBookings: true,
          projects: true,
          invoices: true,
          bookingSlots: true,
        },
      },
      invoices: {
        where: { status: "PAID" },
        select: { amount: true },
      },
    },
  });

  return tenants.map((t) => {
    const totalPaidRevenue = t.invoices.reduce((sum, inv) => sum + inv.amount, 0);
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      customDomain: t.customDomain,
      discipline: t.discipline,
      tagline: t.tagline,
      brandColor: t.brandColor,
      currency: t.currency,
      subscriptionTier: t.subscriptionTier,
      subscriptionStatus: t.subscriptionStatus,
      createdAt: t.createdAt,
      userCount: t._count.users,
      bookingCount: t._count.clientBookings,
      projectCount: t._count.projects,
      slotCount: t._count.bookingSlots,
      totalPaidRevenue,
    };
  });
}
