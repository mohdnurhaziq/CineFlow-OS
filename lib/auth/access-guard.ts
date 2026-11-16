import { db } from "@/lib/db";
import { AuthorizationError, requireStaff } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { loadAccess, levelAtLeast, type AccessArea, type AccessLevel, type AccessMap, type AccessTick } from "@/lib/auth/access";

/**
 * Server-side checks for the per-area access model. Every action must call one itself;
 * the menu only mirrors what these allow.
 *
 * Not a "use server" module.
 */

type WithAccess = SessionUser & { access: AccessMap };

async function staffWithAccess(tenantId: string): Promise<WithAccess> {
  const user = await requireStaff(tenantId);
  return { ...user, access: await loadAccess({ id: user.id, role: user.role, tenantId }) };
}

/** Staff of `tenantId` with at least `need` on `area`. */
export async function requireAccess(tenantId: string, area: AccessArea, need: AccessLevel): Promise<WithAccess> {
  const user = await staffWithAccess(tenantId);
  if (!levelAtLeast(user.access.areas[area], need)) throw new AuthorizationError("FORBIDDEN: You don't have access to this.");
  return user;
}

/** Staff of `tenantId` who has been given the `tick` permission. */
export async function requireTick(tenantId: string, tick: AccessTick): Promise<WithAccess> {
  const user = await staffWithAccess(tenantId);
  if (!user.access.ticks[tick]) throw new AuthorizationError("FORBIDDEN: You don't have permission to do this.");
  return user;
}

/**
 * Whether `user` may open booking `bookingId` of studio `tenantId`. False unless the booking exists in that
 * studio. Then VIEW or more sees every booking; OWN only the ones they are assigned to.
 */
export async function canAccessBooking(
  user: { id: string },
  access: AccessMap,
  tenantId: string,
  bookingId: string
): Promise<boolean> {
  const level = access.areas.bookings;
  if (level === "NONE") return false;
  const booking = await db.clientBooking.findFirst({ where: { id: bookingId, tenantId }, select: { id: true } });
  if (!booking) return false;
  if (levelAtLeast(level, "VIEW")) return true;
  return isAssigned(user.id, bookingId);
}

/**
 * Whether `user` may open project `projectId` of studio `tenantId`. False unless the project exists in that
 * studio. Then VIEW or more on galleries sees every project; OWN the ones they lead or are assigned to the
 * booking of.
 */
export async function canAccessProject(
  user: { id: string },
  access: AccessMap,
  tenantId: string,
  projectId: string
): Promise<boolean> {
  const level = access.areas.galleries;
  if (level === "NONE") return false;
  const project = await db.project.findFirst({
    where: { id: projectId, tenantId },
    select: { studioLeadId: true, bookingId: true },
  });
  if (!project) return false;
  if (levelAtLeast(level, "VIEW")) return true;
  if (project.studioLeadId === user.id) return true;
  return project.bookingId ? isAssigned(user.id, project.bookingId) : false;
}

/** The two areas with "Only their own". */
export type WorkArea = "bookings" | "galleries";

const WORK_REFUSED = "FORBIDDEN: You can only change your own work here.";

/**
 * Staff of `tenantId` who may do the work in `area` (change a booking or a gallery): MANAGE, or
 * OWN for their own records. VIEW is refused: it ranks above OWN for reading, but it is read-only.
 * Follow it with `canWorkOn` for the record itself.
 */
export async function requireOwnOrManage(tenantId: string, area: WorkArea): Promise<WithAccess> {
  const user = await staffWithAccess(tenantId);
  const level = user.access.areas[area];
  if (level !== "OWN" && level !== "MANAGE") throw new AuthorizationError(WORK_REFUSED);
  return user;
}

/**
 * Whether `user` may change record `recordId` (a booking or a project) of studio `tenantId`: at
 * MANAGE any record of that studio, at OWN only their own (as canAccessBooking / canAccessProject),
 * never at VIEW or NONE.
 */
export async function canWorkOn(
  user: { id: string; access: AccessMap },
  tenantId: string,
  area: WorkArea,
  recordId: string
): Promise<boolean> {
  const level = user.access.areas[area];
  if (level !== "OWN" && level !== "MANAGE") return false;
  return area === "bookings"
    ? canAccessBooking(user, user.access, tenantId, recordId)
    : canAccessProject(user, user.access, tenantId, recordId);
}

/** Throws FORBIDDEN unless `canWorkOn` allows it. */
export async function assertCanWorkOn(
  user: { id: string; access: AccessMap },
  tenantId: string,
  area: WorkArea,
  recordId: string
): Promise<void> {
  if (!(await canWorkOn(user, tenantId, area, recordId))) throw new AuthorizationError(WORK_REFUSED);
}

async function isAssigned(userId: string, bookingId: string): Promise<boolean> {
  return !!(await db.bookingAssignment.findUnique({
    where: { bookingId_userId: { bookingId, userId } },
    select: { id: true },
  }));
}
