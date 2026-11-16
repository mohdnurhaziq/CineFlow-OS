/** Role sets, in a plain module so client code can use them (lib/auth/guard.ts pulls in the database). */
export const STAFF_ROLES = new Set(["SUPER_ADMIN", "STUDIO_OWNER", "PHOTOGRAPHER", "VIDEOGRAPHER", "CREW", "TEAM_MEMBER"]);
