import { db } from "@/lib/db";
import { TEAM_ACCOUNT_ROLES, parseAccess, type AccessMap } from "@/lib/auth/access";
import { teamMemberStatus, type TeamMemberStatus } from "@/lib/team/status";

/**
 * The Team screen's Members list. Server-only, not a "use server" module.
 * Never carries password hashes or tokens: only what the screen shows.
 */

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  roleId: string | null;
  roleName: string;
  /** This person's own extras on top of the role (null when none). */
  extraAccess: AccessMap | null;
  status: TeamMemberStatus;
}

/** Owner first, then active and invited people by name, then removed people by name. */
export async function loadTeamMembers(tenantId: string, now: Date = new Date()): Promise<TeamMemberRow[]> {
  const users = await db.user.findMany({
    where: { tenantId, role: { in: ["STUDIO_OWNER", ...TEAM_ACCOUNT_ROLES] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamRoleId: true,
      extraAccess: true,
      passwordHash: true,
      passwordResetExpires: true,
      deactivatedAt: true,
      teamRole: { select: { name: true } },
    },
  });

  const rows: TeamMemberRow[] = users.map((u) => {
    const isOwner = u.role === "STUDIO_OWNER";
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      isOwner,
      roleId: isOwner ? null : u.teamRoleId,
      roleName: isOwner ? "Studio owner" : (u.teamRole?.name ?? "No role"),
      extraAccess: !isOwner && u.extraAccess ? parseAccess(u.extraAccess) : null,
      status: isOwner ? "ACTIVE" : teamMemberStatus(u, now),
    };
  });

  const rank = (r: TeamMemberRow) => (r.isOwner ? 0 : r.status === "REMOVED" ? 2 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The picker's list, for a viewer: only people who can add or remove assignees (Bookings MANAGE) get it. */
export async function loadAssignableFor(tenantId: string, canManage: boolean): Promise<AssignableMember[]> {
  return canManage ? loadAssignableMembers(tenantId) : [];
}

export interface AssignableMember {
  id: string;
  name: string;
  roleName: string;
}

/** Who can be put on a booking: the studio owner and active team members (not invited or removed people). */
export async function loadAssignableMembers(tenantId: string, now: Date = new Date()): Promise<AssignableMember[]> {
  const rows = await loadTeamMembers(tenantId, now);
  return rows.filter((r) => r.status === "ACTIVE").map((r) => ({ id: r.id, name: r.name, roleName: r.roleName }));
}
