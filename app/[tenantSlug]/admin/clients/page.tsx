import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadClientDirectory } from "@/lib/client-directory";
import { ClientsDirectory } from "@/components/admin/clients/clients-directory";

interface ClientsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: ClientsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Clients | ${tenant.name} Studio Admin` : "Clients" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminClientsPage({ params }: ClientsPageProps) {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const clients = await loadClientDirectory(tenant.id);

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <ClientsDirectory tenantSlug={tenant.slug} currency={tenant.currency} clients={clients} />
    </div>
  );
}
