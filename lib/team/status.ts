import { hasSetUp } from "@/lib/auth/set-up";

/**
 * Where a team member stands, for the Team screen. Plain module: safe in server and client code.
 */

export type TeamMemberStatus = "ACTIVE" | "INVITED" | "LINK_EXPIRED" | "REMOVED";

export const TEAM_MEMBER_STATUS_LABELS: Record<TeamMemberStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  LINK_EXPIRED: "Link expired",
  REMOVED: "Removed",
};

/**
 * REMOVED once the studio removed them (wins over everything); ACTIVE once they set a password or joined their one login;
 * INVITED while their set-password link is still valid; LINK_EXPIRED otherwise.
 */
export function teamMemberStatus(
  user: { deactivatedAt: Date | null; passwordHash: string | null; loginId?: string | null; passwordResetExpires: Date | null },
  now: Date = new Date()
): TeamMemberStatus {
  if (user.deactivatedAt) return "REMOVED";
  if (hasSetUp(user)) return "ACTIVE";
  if (user.passwordResetExpires && user.passwordResetExpires.getTime() > now.getTime()) return "INVITED";
  return "LINK_EXPIRED";
}
