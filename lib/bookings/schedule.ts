import { db } from "@/lib/db";
import { isUnassigned } from "@/lib/bookings/unassigned";
import { minutesOfDay } from "@/lib/slot-time";

/**
 * "My schedule": the sessions one person is assigned to, and the Overview's unassigned count.
 * No prices or money here. Not a "use server" module: callers must authorize first.
 */

export interface ScheduleSession {
  bookingId: string;
  trackingCode: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  category: string;
  discipline: string;
  serviceTier: string;
  packageName: string | null;
  brief: string | null;
  projectId: string | null;
  status: string;
  depositPaid: boolean;
  depositAmount: number;
  sessionPrice: number | null;
  paymentMethod: string | null;
  package?: {
    id: string;
    name: string;
    description: string;
    deliverables: string;
    turnaround: string;
    price: number;
    depositPrice: number;
  } | null;
  includedPrints: Array<{
    id: string;
    sizeName: string;
    frameName: string;
    quantity: number;
    note?: string | null;
  }>;
  callSheet?: {
    id: string;
    title: string;
    shootDate: Date;
    generalCallTime: string;
    locationName: string;
    locationAddress: string;
    locationPinUrl?: string | null;
    parkingNotes?: string | null;
    notes?: string | null;
  } | null;
  project?: {
    id: string;
    projectNumber: string;
    title: string;
    status: string;
  } | null;
  /** Other people on the same booking. */
  others: string[];
  allAssignees: Array<{ id: string; name: string; roleName: string }>;
}

export interface ScheduleDay {
  /** Studio date YYYY-MM-DD; "" for sessions whose date is still to be confirmed. */
  date: string;
  sessions: ScheduleSession[];
}

const SCHEDULE_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "DELIVERED", "NO_SHOW"];
const PAST_LIMIT = 60;

/** Slot dates are stored as midnight UTC; a released slot falls back to the requested date. */
function sessionDateOf(b: { slot: { date: Date } | null; targetDate: string | null }): string | null {
  return b.slot ? b.slot.date.toISOString().slice(0, 10) : b.targetDate ?? null;
}

/**
 * The viewer's own assigned sessions (never cancelled), grouped by studio date. Upcoming (date on or
 * after `from`, plus any still without a date, last) in date order; `past` gives earlier dates, newest first.
 */
export async function loadSchedule(
  tenantId: string,
  userId: string,
  opts: { from: string; past?: boolean }
): Promise<ScheduleDay[]> {
  const rows = await db.clientBooking.findMany({
    where: {
      tenantId,
      status: { in: SCHEDULE_STATUSES },
      assignments: { some: { userId } },
    },
    select: {
      id: true,
      trackingCode: true,
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      category: true,
      discipline: true,
      serviceTier: true,
      packageName: true,
      creativeBrief: true,
      status: true,
      targetDate: true,
      depositPaid: true,
      depositAmount: true,
      sessionPrice: true,
      paymentMethod: true,
      slot: { select: { date: true, startTime: true, endTime: true } },
      package: {
        select: {
          id: true,
          name: true,
          description: true,
          deliverables: true,
          turnaround: true,
          price: true,
          depositPrice: true,
        },
      },
      includedPrints: {
        select: {
          id: true,
          sizeName: true,
          frameName: true,
          quantity: true,
          note: true,
        },
      },
      project: {
        select: {
          id: true,
          projectNumber: true,
          title: true,
          status: true,
          callSheets: {
            orderBy: { shootDate: "asc" },
            take: 1,
            select: {
              id: true,
              title: true,
              shootDate: true,
              generalCallTime: true,
              locationName: true,
              locationAddress: true,
              locationPinUrl: true,
              parkingNotes: true,
              notes: true,
            },
          },
        },
      },
      assignments: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              role: true,
              teamRole: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const items = rows
    .map((b) => ({
      date: sessionDateOf(b),
      start: b.slot ? minutesOfDay(b.slot.startTime) ?? 0 : 0,
      session: {
        bookingId: b.id,
        trackingCode: b.trackingCode,
        startTime: b.slot?.startTime ?? "",
        endTime: b.slot?.endTime ?? "",
        clientName: b.clientName,
        clientEmail: b.clientEmail,
        clientPhone: b.clientPhone,
        category: b.category,
        discipline: b.discipline,
        serviceTier: b.serviceTier,
        packageName: b.packageName,
        brief: b.creativeBrief,
        projectId: b.project?.id ?? null,
        status: b.status,
        depositPaid: b.depositPaid,
        depositAmount: b.depositAmount,
        sessionPrice: b.sessionPrice,
        paymentMethod: b.paymentMethod,
        package: b.package,
        includedPrints: b.includedPrints,
        callSheet: b.project?.callSheets?.[0] ?? null,
        project: b.project ? { id: b.project.id, projectNumber: b.project.projectNumber, title: b.project.title, status: b.project.status } : null,
        others: b.assignments.filter((a) => a.userId !== userId).map((a) => a.user.name),
        allAssignees: b.assignments.map((a) => ({
          id: a.user.id,
          name: a.user.name,
          roleName: a.user.role === "STUDIO_OWNER" ? "Studio Owner" : (a.user.teamRole?.name ?? "Photographer"),
        })),
      } satisfies ScheduleSession,
    }))
    .filter((x) => (opts.past ? x.date !== null && x.date < opts.from : x.date === null || x.date >= opts.from));

  const dir = opts.past ? -1 : 1;
  items.sort((x, y) => {
    // Undated sessions go last.
    if (x.date === null || y.date === null) return x.date === y.date ? 0 : x.date === null ? 1 : -1;
    if (x.date !== y.date) return x.date < y.date ? -dir : dir;
    return x.start - y.start;
  });

  const limited = opts.past ? items.slice(0, PAST_LIMIT) : items;
  const days: ScheduleDay[] = [];
  for (const x of limited) {
    const date = x.date ?? "";
    const last = days[days.length - 1];
    if (last && last.date === date) last.sessions.push(x.session);
    else days.push({ date, sessions: [x.session] });
  }
  return days;
}

/**
 * Upcoming PENDING or CONFIRMED bookings with nobody assigned: the same definition (isUnassigned)
 * as the Bookings "Unassigned" filter, so the Overview count matches the list.
 */
export async function countUnassignedUpcoming(tenantId: string, today: string): Promise<number> {
  const rows = await db.clientBooking.findMany({
    where: { tenantId, status: { in: ["PENDING", "CONFIRMED"] }, assignments: { none: {} } },
    select: { status: true, targetDate: true, slot: { select: { date: true } } },
  });
  return rows.filter((b) => isUnassigned({ status: b.status, sessionDate: sessionDateOf(b), assignees: [] }, today)).length;
}
