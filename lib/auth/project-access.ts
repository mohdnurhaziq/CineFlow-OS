import { notFound, redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { AuthorizationError, STAFF_ROLES } from "@/lib/auth/guard";

/**
 * Access to a client's own records: projects (vault, call sheets, releases), proposals and invoices.
 *
 * Allowed: the client the record belongs to, any staff member of the record's studio, or a
 * platform super-admin. Everyone must be signed in, so every view and change has a name on it.
 *
 * Not a "use server" module.
 */
export function canAccessClientRecord(
  session: SessionUser | null,
  tenantId: string,
  clientId: string | null | undefined
): boolean {
  if (!session) return false;
  if (session.role === "SUPER_ADMIN") return true;
  if (session.tenantId !== tenantId) return false;
  if (STAFF_ROLES.has(session.role)) return true;
  return session.role === "CLIENT" && !!clientId && session.id === clientId;
}

/**
 * For pages. Signed out: sends the visitor to the studio login and back to `returnTo` after.
 * Signed in without access: 404, so the record's existence isn't revealed.
 */
export async function requirePageAccess(opts: {
  tenantSlug: string;
  tenantId: string;
  clientId: string | null | undefined;
  returnTo: string;
}): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) {
    redirect(`/${opts.tenantSlug}/login?callbackUrl=${encodeURIComponent(opts.returnTo)}`);
  }
  if (!canAccessClientRecord(session, opts.tenantId, opts.clientId)) notFound();
  return session;
}

/** For server actions and route handlers. Throws AuthorizationError when the caller has no access. */
export async function requireRecordAccess(
  tenantId: string,
  clientId: string | null | undefined
): Promise<SessionUser> {
  const session = await getCurrentUser();
  if (!session) throw new AuthorizationError("UNAUTHENTICATED: Please sign in.");
  if (!canAccessClientRecord(session, tenantId, clientId)) throw new AuthorizationError();
  return session;
}
