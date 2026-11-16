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

/** VIEW or more sees every booking; OWN sees only the ones they are assigned to. */
export async function canAccessBooking(user: { id: string }, access: AccessMap, bookingId: string): Promise<boolean> {
  const level = access.areas.bookings;
  if (levelAtLeast(level, "VIEW")) return true;
  if (level !== "OWN") return false;
  return !!(await db.bookingAssignment.findUnique({
    where: { bookingId_userId: { bookingId, userId: user.id } },
    select: { id: true },
  }));
}

/** VIEW or more sees every gallery; OWN sees the ones they lead or are assigned to the booking of. */
export async function canAccessProject(user: { id: string }, access: AccessMap, projectId: string): Promise<boolean> {
  const level = access.areas.galleries;
  if (levelAtLeast(level, "VIEW")) return true;
  if (level !== "OWN") return false;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { studioLeadId: true, bookingId: true } });
  if (!project) return false;
  if (project.studioLeadId === user.id) return true;
  if (!project.bookingId) return false;
  return !!(await db.bookingAssignment.findUnique({
    where: { bookingId_userId: { bookingId: project.bookingId, userId: user.id } },
    select: { id: true },
  }));
}
