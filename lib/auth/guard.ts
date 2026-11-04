import { db } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/**
 * Authorization guards for server actions.
 *
 * Every exported function in a "use server" module is a public HTTP endpoint:
 * it can be invoked by POSTing its action ID to ANY route, so the /admin page
 * guard in middleware does not protect it. Each staff-only action must call one
 * of these guards itself, before touching the database.
 *
 * Not a "use server" module.
 */

export const STAFF_ROLES = new Set(["SUPER_ADMIN", "STUDIO_OWNER", "PHOTOGRAPHER", "VIDEOGRAPHER", "CREW"]);
export const OWNER_ROLES = new Set(["SUPER_ADMIN", "STUDIO_OWNER"]);

export class AuthorizationError extends Error {
  constructor(message = "FORBIDDEN: You are not allowed to perform this action for this studio.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

async function requireRole(tenantId: string | null | undefined, roles: Set<string>): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) throw new AuthorizationError("UNAUTHENTICATED: Please sign in as studio staff.");
  if (!roles.has(session.role)) throw new AuthorizationError();
  if (session.role === "SUPER_ADMIN") return session;
  if (!tenantId || session.tenantId !== tenantId) throw new AuthorizationError();
  return session;
}

/** Any staff member of `tenantId` (or the platform super-admin). Throws AuthorizationError otherwise. */
export function requireStaff(tenantId: string | null | undefined): Promise<SessionUser> {
  return requireRole(tenantId, STAFF_ROLES);
}

/** The owner of `tenantId` (or the platform super-admin). For money, bank details and studio identity. */
export function requireOwner(tenantId: string | null | undefined): Promise<SessionUser> {
  return requireRole(tenantId, OWNER_ROLES);
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) throw new AuthorizationError("UNAUTHENTICATED: Please sign in.");
  if (session.role !== "SUPER_ADMIN") throw new AuthorizationError("FORBIDDEN: Platform administrators only.");
  return session;
}

/** Staff check for actions that receive a tenant slug instead of an id (compares ids, so slug renames are safe). */
export async function requireStaffBySlug(tenantSlug: string): Promise<SessionUser> {
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  return requireStaff(tenant?.id ?? null);
}
