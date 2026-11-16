import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Frame } from "lucide-react";
import { db } from "@/lib/db";
import { currencySymbol } from "@/lib/money";
import { loadProjectOrdering, toFrameOption, toSizeOption } from "@/lib/prints/project-ordering";
import { PageHeader, PageShell } from "@/components/ui/page";
import { VisualizerShell } from "@/components/visualizer/visualizer-shell";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { canAccessProject } from "@/lib/auth/access-guard";
import { NoAccess } from "@/components/admin/no-access";

interface AdminProjectPrintsPageProps {
  params: Promise<{ tenantSlug: string; projectId: string }>;
}

export async function generateMetadata({ params }: AdminProjectPrintsPageProps): Promise<Metadata> {
  const { tenantSlug, projectId } = await params;
  const project = await db.project.findFirst({
    where: { id: projectId, tenant: { slug: tenantSlug } },
    select: { title: true, tenant: { select: { name: true } } },
  });
  return { title: project ? `Framed prints · ${project.title} | ${project.tenant.name} Studio Admin` : "Framed prints" };
}

/**
 * Staff order framed prints for a client from that client's gallery, inside the admin console.
 * Needs Print orders MANAGE and the project's gallery (Galleries, with canAccessProject). Placing
 * goes through the same placePrintOrder rules as the client: no ordering until the balance is paid.
 */
export default async function AdminProjectPrintsPage({ params }: AdminProjectPrintsPageProps) {
  const { tenantSlug, projectId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  const viewer = await adminPageAccess(tenantSlug);
  if (
    !viewer ||
    !levelAtLeast(viewer.access.areas.printOrders, "MANAGE") ||
    !levelAtLeast(viewer.access.areas.galleries, "OWN")
  ) {
    return <NoAccess tenantSlug={tenantSlug} />;
  }

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    select: { id: true, clientId: true, title: true, client: { select: { name: true } } },
  });
  if (!project) notFound();
  if (!(await canAccessProject(viewer.user, viewer.access, tenant.id, project.id))) return <NoAccess tenantSlug={tenantSlug} />;

  const [printSizes, frameDesigns, { photos, ordering }] = await Promise.all([
    db.printSize.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { widthInches: "asc" } }),
    db.frameDesign.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { priceOffset: "asc" } }),
    loadProjectOrdering({
      tenantId: tenant.id,
      project,
      galleryHref: `/${tenant.slug}/admin/projects/${project.id}`,
      staffOrdersHref: `/${tenant.slug}/admin/print-orders`,
    }),
  ]);

  const canOrder = ordering.unlocked && ordering.hasPhotos;

  return (
    <PageShell>
      <PageHeader
        icon={Frame}
        title={`Framed prints for ${project.client.name}`}
        description={
          canOrder
            ? `Order prints from ${project.title} on the client's behalf. Included prints and prices work exactly as they do for the client.`
            : !ordering.unlocked
              ? "Framed prints unlock when the client's balance is paid."
              : "Upload photos to this gallery before ordering prints."
        }
        back={{ href: `/${tenant.slug}/admin/projects/${project.id}`, label: project.title }}
      />
      <VisualizerShell
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        currency={currencySymbol(tenant.currency)}
        matBoardPrice={tenant.matBoardPrice}
        canOrder={canOrder}
        ordering={ordering}
        initialPrintSizes={printSizes.map(toSizeOption)}
        initialFrameDesigns={frameDesigns.map(toFrameOption)}
        initialPhotos={photos}
      />
    </PageShell>
  );
}
