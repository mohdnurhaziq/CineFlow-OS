import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadClientDirectory } from "@/lib/client-directory";
import { ClientsDirectory } from "@/components/admin/clients/clients-directory";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { studioAdminName } from "@/lib/labels";

interface ClientsPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<{ filter?: string; q?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ClientsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Clients | ${studioAdminName(tenant.name)}` : "Clients" };
}

// Clients VIEW.
export default async function AdminClientsPage({ params, searchParams }: ClientsPageProps) {
  const { tenantSlug } = await params;
  const query = searchParams ? await searchParams : undefined;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.clients, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  // Paid and balance due are money: Invoices VIEW.
  const showMoney = levelAtLeast(viewer.access.areas.invoices, "VIEW");
  const clients = await loadClientDirectory(tenant.id, { money: showMoney });

  const rawFilter = query?.filter?.toUpperCase();
  const validFilters = new Set(["ALL", "REGISTERED", "INVITED", "GUEST", "OWING"]);
  const initialFilter = rawFilter && validFilters.has(rawFilter) ? (rawFilter as "ALL" | "REGISTERED" | "INVITED" | "GUEST" | "OWING") : undefined;

  return (
    <PageShell>
      <ClientsDirectory
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        clients={clients}
        showMoney={showMoney}
        initialFilter={initialFilter}
        initialQuery={query?.q}
      />
    </PageShell>
  );
}
