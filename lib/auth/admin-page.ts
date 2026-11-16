import { db } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { loadAccess, type AccessMap } from "@/lib/auth/access";

/**
 * For admin pages and the admin top bar: who is looking and what they may open.
 * Pages decide with levelAtLeast(access.areas[area], need) and show <NoAccess /> below it.
 * Every action still checks on the server; this only decides what a page shows.
 *
 * Not a "use server" module.
 */

/** The studio's own owner, or the platform super-admin. Settings and Team are theirs alone. */
export function isStudioOwner(user: { role: string; tenantId: string | null }, tenantId: string): boolean {
  return user.role === "SUPER_ADMIN" || (user.role === "STUDIO_OWNER" && user.tenantId === tenantId);
}

/**
 * The signed-in team member of studio `tenantSlug` with their access, or null when signed out,
 * not on this studio's team, or the studio doesn't exist (the admin layout redirects those).
 */
export async function adminPageAccess(
  tenantSlug: string
): Promise<{ user: SessionUser; access: AccessMap; isOwner: boolean } | null> {
  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.has(user.role)) return null;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return null;
  if (user.role !== "SUPER_ADMIN" && user.tenantId !== tenant.id) return null;
  const access = await loadAccess({ id: user.id, role: user.role, tenantId: tenant.id });
  return { user, access, isOwner: isStudioOwner(user, tenant.id) };
}
