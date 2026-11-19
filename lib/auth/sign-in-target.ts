import { STAFF_ROLES } from "@/lib/auth/roles";
import { isSafeRelativePath, studioPath, studioSubdomainsOn } from "@/lib/domain-name";

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
  const cb = opts.callbackUrl ?? "";
  const path = (cb.split(/[?#]/)[0] ?? "").replace(/\/+$/, "").toLowerCase();
  let safe: string | null;
  if (studioSubdomainsOn()) {
    // The studio is the whole host, so any plain path on it is the studio's; never another site
    // (//evil.com, a backslash, a tab or line break, a full address) and never the studio root itself.
    const plain = isSafeRelativePath(cb) && !path.split("/").includes("..");
    safe = plain && path !== "" ? cb : null;
  } else {
    const root = studioPath(tenantSlug);
    const sameStudio =
      isSafeRelativePath(cb) && cb.startsWith(root) && (cb.length === root.length || /^[/?#]/.test(cb.charAt(root.length)));
    safe = sameStudio && path !== root.toLowerCase() && path !== "" ? cb : null;
  }

  if (role === "CLIENT") return safe && !safe.includes("/admin") ? safe : studioPath(tenantSlug, "/account");
  if (safe) return safe;
  const isTeam = !!role && STAFF_ROLES.has(role) && role !== "STUDIO_OWNER" && role !== "SUPER_ADMIN";
  return studioPath(tenantSlug, isTeam ? "/admin/schedule" : "/admin");
}
