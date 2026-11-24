"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { actionErrorMessage } from "@/lib/action-error";
import { PLAN_CODES, PLANS } from "@/lib/billing/plans";
import { addDays, planStatus, type PlanState } from "@/lib/billing/state";
import { studioNow } from "@/lib/slot-time";

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
  /** Studios by where their plan stands (trial, active, overdue, paused, closed). */
  byState: Record<PlanState, number>;
  /** Recorded plan payments (RM) this month and over the last 12 months, Malaysia time. */
  revenueThisMonth: number;
  revenue12m: number;
  /** Studios whose trial or paid period ends within 7 days. */
  endingSoon: { tenantId: string; name: string; endsOn: string }[];
  totalUsers: number;
  activeProjects: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  await requireSuperAdmin();
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
        name: true,
        trialEndsAt: true,
        paidUntil: true,
        pausedAt: true,
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
  const byState: Record<PlanState, number> = { TRIAL: 0, ACTIVE: 0, OVERDUE: 0, PAUSED: 0, CLOSED: 0 };
  const endingSoon: PlatformMetrics["endingSoon"] = [];
  const today = studioNow().dateKey;

  for (const t of tenants) {
    studiosByDiscipline[t.discipline] = (studiosByDiscipline[t.discipline] || 0) + 1;
    studiosByTier[t.subscriptionTier] = (studiosByTier[t.subscriptionTier] || 0) + 1;
    studiosByStatus[t.subscriptionStatus] = (studiosByStatus[t.subscriptionStatus] || 0) + 1;

    const st = planStatus(t);
    byState[st.state] += 1;
    if ((st.state === "TRIAL" || st.state === "ACTIVE") && st.endsOn && st.endsOn <= addDays(today, 7)) {
      endingSoon.push({ tenantId: t.id, name: t.name, endsOn: st.endsOn });
    }
  }
  endingSoon.sort((a, b) => a.endsOn.localeCompare(b.endsOn));

  // Money the owner recorded (by hand), not list prices.
  const payments = await db.platformPayment.findMany({ select: { amount: true, createdAt: true } });
  const thisMonth = today.slice(0, 7);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  let revenueThisMonth = 0;
  let revenue12m = 0;
  for (const pay of payments) {
    if (studioNow(pay.createdAt).dateKey.slice(0, 7) === thisMonth) revenueThisMonth += pay.amount;
    if (pay.createdAt >= yearAgo) revenue12m += pay.amount;
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
    byState,
    revenueThisMonth,
    revenue12m,
    endingSoon,
    totalUsers,
    activeProjects,
  };
}

export async function getAllTenantsSummary() {
  await requireSuperAdmin();
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
  const seats = await db.user.groupBy({
    by: ["tenantId"],
    where: { deactivatedAt: null, role: { notIn: ["CLIENT", "STUDIO_OWNER", "SUPER_ADMIN"] } },
    _count: { _all: true },
  });
  const seatsOf = new Map(seats.map((x) => [x.tenantId, x._count._all]));
  const lastSeen = await db.user.groupBy({ by: ["tenantId"], where: { role: { not: "CLIENT" } }, _max: { updatedAt: true } });
  const lastOf = new Map(lastSeen.map((x) => [x.tenantId, x._max.updatedAt]));

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
      state: planStatus(t).state,
      endsOn: planStatus(t).endsOn,
      graceEndsOn: planStatus(t).graceEndsOn,
      trialEndsAt: t.trialEndsAt,
      paidUntil: t.paidUntil,
      pausedAt: t.pausedAt,
      pauseReason: t.pauseReason,
      teamUsed: seatsOf.get(t.id) ?? 0,
      teamLimit: planStatus(t).teamLimit === Infinity ? null : planStatus(t).teamLimit,
      lastActive: lastOf.get(t.id) ?? null,
      createdAt: t.createdAt,
      userCount: t._count.users,
      bookingCount: t._count.clientBookings,
      projectCount: t._count.projects,
      slotCount: t._count.bookingSlots,
      totalPaidRevenue,
    };
  });
}

// ---------------------------------------------------------------------------
// Running studios' plans (platform owner only; payments are collected by hand)
// ---------------------------------------------------------------------------

type Result = { success: true; message?: string } | { success: false; error: string; message: string };
const fail = (error: string, err: unknown, fallback: string): Result => ({ success: false, error, message: actionErrorMessage(err, fallback) });

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD.");
const PlanEnum = z.enum(PLAN_CODES as [string, ...string[]]);
/** A Malaysia-time calendar day as a stored date (midnight in Kuala Lumpur). */
const malaysiaDay = (day: string) => new Date(`${day}T00:00:00+08:00`);

/** Clears a lateness pause (never a manual one) when the studio's dates now cover it. */
async function resumeIfCovered(tenantId: string): Promise<void> {
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!t || !t.pausedAt || t.pauseReason !== "OVERDUE") return;
  if (planStatus({ ...t, pausedAt: null }).state !== "PAUSED") {
    await db.tenant.update({ where: { id: tenantId }, data: { pausedAt: null, pauseReason: null } });
  }
}

const RecordPaymentSchema = z.object({
  tenantId: z.string().min(1),
  amount: z.number().positive("The amount must be more than 0.").max(1_000_000),
  method: z.enum(["BANK_TRANSFER", "DUITNOW", "CASH", "OTHER"]),
  reference: z.string().trim().max(120).optional(),
  plan: PlanEnum,
  paidUntil: DAY,
  note: z.string().trim().max(500).optional(),
});

/** Records a payment: sets the plan, moves "paid until" to that day if later (never earlier), ends a lateness pause it covers. */
export async function recordPlatformPayment(input: z.input<typeof RecordPaymentSchema>): Promise<Result> {
  try {
    const admin = await requireSuperAdmin();
    const v = RecordPaymentSchema.parse(input);
    const tenant = await db.tenant.findUnique({ where: { id: v.tenantId } });
    if (!tenant) return { success: false, error: "NOT_FOUND", message: "Studio not found." };
    const given = malaysiaDay(v.paidUntil);
    const paidUntil = tenant.paidUntil && tenant.paidUntil > given ? tenant.paidUntil : given;
    await db.$transaction([
      db.platformPayment.create({
        data: { tenantId: v.tenantId, amount: v.amount, method: v.method, reference: v.reference || null, plan: v.plan, paidUntil: given, note: v.note || null, recordedById: admin.id },
      }),
      db.tenant.update({ where: { id: v.tenantId }, data: { subscriptionTier: v.plan, paidUntil } }),
    ]);
    await resumeIfCovered(v.tenantId);
    return { success: true, message: `Recorded RM ${v.amount.toFixed(2)}; ${PLANS[v.plan as keyof typeof PLANS].name} plan paid until ${v.paidUntil}.` };
  } catch (err) {
    return fail("RECORD_FAILED", err, "Could not record the payment.");
  }
}

export async function changeStudioPlan(input: { tenantId: string; plan: string }): Promise<Result> {
  try {
    await requireSuperAdmin();
    const v = z.object({ tenantId: z.string().min(1), plan: PlanEnum }).parse(input);
    await db.tenant.update({ where: { id: v.tenantId }, data: { subscriptionTier: v.plan } });
    return { success: true };
  } catch (err) {
    return fail("PLAN_FAILED", err, "Could not change the plan.");
  }
}

/** Sets the last day of the studio's free trial. */
export async function extendTrial(input: { tenantId: string; until: string }): Promise<Result> {
  try {
    await requireSuperAdmin();
    const v = z.object({ tenantId: z.string().min(1), until: DAY }).parse(input);
    await db.tenant.update({ where: { id: v.tenantId }, data: { trialEndsAt: malaysiaDay(v.until) } });
    await resumeIfCovered(v.tenantId);
    return { success: true };
  } catch (err) {
    return fail("TRIAL_FAILED", err, "Could not change the trial.");
  }
}

export async function pauseStudio(input: { tenantId: string; reason?: string }): Promise<Result> {
  try {
    await requireSuperAdmin();
    const v = z.object({ tenantId: z.string().min(1), reason: z.string().trim().max(200).optional() }).parse(input);
    await db.tenant.update({ where: { id: v.tenantId }, data: { pausedAt: new Date(), pauseReason: "MANUAL" } });
    return { success: true };
  } catch (err) {
    return fail("PAUSE_FAILED", err, "Could not pause the studio.");
  }
}

export async function resumeStudio(input: { tenantId: string }): Promise<Result> {
  try {
    await requireSuperAdmin();
    const v = z.object({ tenantId: z.string().min(1) }).parse(input);
    await db.tenant.update({ where: { id: v.tenantId }, data: { pausedAt: null, pauseReason: null } });
    return { success: true };
  } catch (err) {
    return fail("RESUME_FAILED", err, "Could not resume the studio.");
  }
}

/** Removes the studio from the platform (its pages stop opening). Needs its address typed. */
export async function closeStudio(input: { tenantId: string; confirmSlug: string }): Promise<Result> {
  try {
    await requireSuperAdmin();
    const v = z.object({ tenantId: z.string().min(1), confirmSlug: z.string() }).parse(input);
    const tenant = await db.tenant.findUnique({ where: { id: v.tenantId }, select: { slug: true } });
    if (!tenant) return { success: false, error: "NOT_FOUND", message: "Studio not found." };
    if (v.confirmSlug.trim() !== tenant.slug) return { success: false, error: "CONFIRM_MISMATCH", message: "Type the studio's address exactly to close it." };
    await db.tenant.update({ where: { id: v.tenantId }, data: { subscriptionStatus: "CANCELLED" } });
    return { success: true };
  } catch (err) {
    return fail("CLOSE_FAILED", err, "Could not close the studio.");
  }
}

export async function getStudioPayments(tenantId: string) {
  await requireSuperAdmin();
  const rows = await db.platformPayment.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), paidUntil: r.paidUntil.toISOString() }));
}
