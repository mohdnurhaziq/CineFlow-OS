import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadClientDirectory } from "@/lib/client-directory";
import { ClientsDirectory } from "@/components/admin/clients/clients-directory";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";

interface ClientsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: ClientsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Clients | ${tenant.name} Studio Admin` : "Clients" };
}

// Clients VIEW.
export default async function AdminClientsPage({ params }: ClientsPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.clients, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const clients = await loadClientDirectory(tenant.id);

  return (
    <PageShell>
      <ClientsDirectory tenantSlug={tenant.slug} currency={tenant.currency} clients={clients} />
    </PageShell>
  );
}
