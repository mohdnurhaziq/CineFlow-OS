import { STAFF_ROLES } from "@/lib/auth/roles";

/**
 * Where a person goes after signing in to studio `tenantSlug`. One function for the login page and
 * the login form, so the two can't disagree. Plain module: safe in server and client code.
 *
 *  - a same-studio callbackUrl wins (clients never into /admin); the studio root doesn't count
 *  - clients: their account
 *  - team accounts (staff, not owner or super-admin): My schedule
 *  - owner and super-admin: the Overview
 */
export function signInTarget(opts: { role: string | undefined; tenantSlug: string; callbackUrl?: string | null }): string {
  const { role, tenantSlug } = opts;
  const root = `/${tenantSlug}`;
  const cb = opts.callbackUrl ?? "";
  const sameStudio =
    cb.startsWith(root) && !cb.startsWith("//") && (cb.length === root.length || /^[/?#]/.test(cb.charAt(root.length)));
  const path = (cb.split(/[?#]/)[0] ?? "").replace(/\/+$/, "").toLowerCase();
  const safe = sameStudio && path !== root.toLowerCase() && path !== "" ? cb : null;

  if (role === "CLIENT") return safe && !safe.includes("/admin") ? safe : `${root}/account`;
  if (safe) return safe;
  const isTeam = !!role && STAFF_ROLES.has(role) && role !== "STUDIO_OWNER" && role !== "SUPER_ADMIN";
  return isTeam ? `${root}/admin/schedule` : `${root}/admin`;
}
