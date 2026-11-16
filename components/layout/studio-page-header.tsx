import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { AdminHeader } from "@/components/admin/admin-header";
import { ClientAccountHeader } from "@/components/account/client-account-header";
import { ShowcaseNav } from "@/components/showcase/showcase-nav";
import { loadClientHeaderBadges } from "@/lib/client-header-badges";

interface StudioPageHeaderProps {
  tenantSlug: string;
  /**
   * What a team member sees. "admin" (default): the admin top bar, for pages the team opens from
   * the console (a client's gallery, a proposal, a call sheet). "website": the studio website's
   * bar, for the website's own pages (booking), as on the studio's front page.
   */
  staffView?: "admin" | "website";
}

/**
 * The top bar for pages that clients, the studio's team and visitors can all reach, chosen by
 * who is looking, so every page carries its area's bar:
 *
 *   signed-in client of this studio -> the client portal bar (their account's tabs)
 *   team member                      -> the admin top bar (or the website bar, see staffView)
 *   anyone else                      -> the studio website bar
 */
export async function StudioPageHeader({ tenantSlug, staffView = "admin" }: StudioPageHeaderProps) {
  const [tenant, session] = await Promise.all([
    db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, slug: true, brandColor: true, discipline: true },
    }),
    getCurrentUser(),
  ]);
  if (!tenant) return null;

  if (session?.role === "CLIENT" && session.tenantId === tenant.id) {
    const [client, badges] = await Promise.all([
      db.user.findFirst({
        where: { id: session.id, tenantId: tenant.id, role: "CLIENT" },
        select: { name: true, email: true, phone: true },
      }),
      loadClientHeaderBadges(tenant.id, session.id),
    ]);
    if (client) return <ClientAccountHeader tenant={tenant} client={client} badges={badges} />;
  }

  const isStaff =
    !!session && STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id);
  if (session && isStaff && staffView === "admin") return <AdminHeader tenant={tenant} user={session} />;

  const studioLead = await db.user.findFirst({
    where: { tenantId: tenant.id, role: "STUDIO_OWNER" },
    select: { name: true, phone: true },
  });
  return (
    <ShowcaseNav
      tenant={tenant}
      studioLead={studioLead}
      staff={session && isStaff ? { name: session.name, email: session.email, role: session.role } : null}
    />
  );
}
