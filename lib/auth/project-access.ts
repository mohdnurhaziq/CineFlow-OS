import { notFound, redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { AuthorizationError, STAFF_ROLES } from "@/lib/auth/guard";
import { levelAtLeast, loadAccess, type AccessArea, type AccessLevel } from "@/lib/auth/access";
import { canAccessProject, canWorkOn } from "@/lib/auth/access-guard";
import { studioPath } from "@/lib/domain-name";

/**
 * Access to a client's own records: projects (vault, call sheets, releases), proposals and invoices.
 *
 * Allowed: the client the record belongs to, or a team member of the record's studio (or a platform
 * super-admin) with access to the record's area: Galleries for a project's vault (with OWN, only the
 * projects they lead or are assigned to), Production for call sheets and releases, Proposals for
 * proposals, Invoices for invoices, each at VIEW or more (or the `level` a write path asks for).
 * A gallery write path asks for MANAGE: Galleries MANAGE, or OWN on their own project; VIEW only reads.
 * Everyone must be signed in, so every view and change has a name on it.
 *
 * Not a "use server" module.
 */

/** Which area a record belongs to, for the team's access check. */
export type RecordArea =
  | {
      area: "galleries";
      projectId: string;
      /** Default VIEW (open it). MANAGE for team write paths: Galleries MANAGE, or OWN on their own project. */
      level?: "VIEW" | "MANAGE";
    }
  | { area: Exclude<AccessArea, "galleries" | "bookings">; /** Default VIEW; MANAGE for team write paths. */ level?: AccessLevel };

/** True when `session` is the client this record belongs to, in its studio. No access settings involved. */
export function isRecordClient(session: SessionUser | null, tenantId: string, clientId: string | null | undefined): boolean {
  return !!session && session.role === "CLIENT" && session.tenantId === tenantId && !!clientId && session.id === clientId;
}

export async function canAccessClientRecord(
  session: SessionUser | null,
  tenantId: string,
  clientId: string | null | undefined,
  record: RecordArea
): Promise<boolean> {
  if (!session) return false;
  if (!STAFF_ROLES.has(session.role)) return isRecordClient(session, tenantId, clientId);
  if (session.role !== "SUPER_ADMIN" && session.tenantId !== tenantId) return false;
  const access = await loadAccess({ id: session.id, role: session.role, tenantId });
  if (record.area === "galleries") {
    return record.level === "MANAGE"
      ? canWorkOn({ id: session.id, access }, tenantId, "galleries", record.projectId)
      : canAccessProject(session, access, tenantId, record.projectId);
  }
  return levelAtLeast(access.areas[record.area], record.level ?? "VIEW");
}

/**
 * For pages. Signed out: sends the visitor to the studio login and back to `returnTo` after.
 * Signed in without access: 404, so the record's existence isn't revealed.
 */
export async function requirePageAccess(opts: {
  tenantSlug: string;
  tenantId: string;
  clientId: string | null | undefined;
  record: RecordArea;
  returnTo: string;
}): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) {
    redirect(`${studioPath(opts.tenantSlug, "/login")}?callbackUrl=${encodeURIComponent(opts.returnTo)}`);
  }
  if (!(await canAccessClientRecord(session, opts.tenantId, opts.clientId, opts.record))) notFound();
  return session;
}

/** For server actions and route handlers. Throws AuthorizationError when the caller has no access. */
export async function requireRecordAccess(
  tenantId: string,
  clientId: string | null | undefined,
  record: RecordArea
): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) throw new AuthorizationError("UNAUTHENTICATED: Please sign in.");
  if (!(await canAccessClientRecord(session, tenantId, clientId, record))) throw new AuthorizationError();
  return session;
}
