import { db } from "@/lib/db";
import { getCurrentLogin } from "@/lib/auth/session";
import { liveAccounts } from "@/lib/auth/token";
import { signInTarget } from "@/lib/auth/sign-in-target";
import { studioSubdomainsOn, studioUrl } from "@/lib/domain-name";

/** One of a person's studios in the switcher and on "Your studios". */
export interface SwitcherEntry {
  tenantSlug: string;
  tenantName: string;
  /** "Owner", the team role's name, or "Client". */
  roleLabel: string;
  href: string;
  current: boolean;
}

/**
 * Where a person lands in a studio: where signing in there would take them (Overview for the owner,
 * My schedule for the team, the account page for a client). With studio subdomains on it is the
 * studio's own subdomain address, even for a studio that also has its own domain: the subdomain
 * shares the platform's sign-in cookie. With them off it is the path.
 */
export function accountHref(slug: string, role: string): string {
  const target = signInTarget({ role, tenantSlug: slug });
  return studioSubdomainsOn() ? studioUrl(slug, target) : target;
}

/**
 * The studios the signed-in person can open, for the switcher and "Your studios": every live account
 * of their login, by studio name, with the studio being visited marked. Empty without a login session.
 * Removed accounts and cancelled studios are left out; paused studios stay, so owners can renew.
 */
export async function loadSwitcher(currentSlug: string | null): Promise<SwitcherEntry[]> {
  const me = await getCurrentLogin();
  if (!me) return [];
  const accounts = await liveAccounts(me.loginId);
  const teamIds = accounts.filter((a) => a.role !== "STUDIO_OWNER" && a.role !== "CLIENT").map((a) => a.userId);
  const roleNames = new Map(
    (await db.user.findMany({ where: { id: { in: teamIds } }, select: { id: true, teamRole: { select: { name: true } } } })).map((u) => [u.id, u.teamRole?.name ?? null])
  );
  return accounts.map((a) => ({
    tenantSlug: a.tenantSlug,
    tenantName: a.tenantName,
    roleLabel: a.role === "STUDIO_OWNER" ? "Owner" : a.role === "CLIENT" ? "Client" : (roleNames.get(a.userId) ?? "Team"),
    href: accountHref(a.tenantSlug, a.role),
    current: a.tenantSlug === currentSlug,
  }));
}
