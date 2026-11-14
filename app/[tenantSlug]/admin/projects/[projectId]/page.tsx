import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { filesReleased } from "@/lib/deliverables/access";
import { ProjectWorkspace } from "@/components/admin/projects/project-workspace";

interface ProjectPageProps {
  params: Promise<{ tenantSlug: string; projectId: string }>;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { tenantSlug, projectId } = await params;
  const project = await db.project.findFirst({
    where: { id: projectId, tenant: { slug: tenantSlug } },
    select: { title: true, tenant: { select: { name: true } } },
  });
  return { title: project ? `${project.title} | ${project.tenant.name} Studio Admin` : "Project" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminProjectPage({ params }: ProjectPageProps) {
  const { tenantSlug, projectId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true, releaseFilesBeforePayment: true } });
  if (!tenant) notFound();

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      callSheets: { orderBy: { shootDate: "asc" } },
      reservations: { include: { item: { select: { name: true, sku: true } } }, orderBy: { startDate: "asc" } },
      deliverables: { include: { items: { orderBy: { id: "asc" } } }, orderBy: { createdAt: "asc" } },
      invoices: { select: { id: true, invoiceNumber: true, milestoneType: true, amount: true, status: true }, orderBy: { createdAt: "asc" } },
      shotItems: { orderBy: [{ sceneNumber: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!project) notFound();

  const gear = await db.inventoryItem.findMany({
    where: { tenantId: tenant.id, status: { not: "MAINTENANCE" } },
    select: { id: true, name: true, sku: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <ProjectWorkspace
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        gear={gear}
        project={{
          id: project.id,
          title: project.title,
          projectNumber: project.projectNumber,
          status: project.status,
          kind: project.kind,
          budget: project.budget,
          isFinalBalancePaid: project.isFinalBalancePaid,
          filesReleased: filesReleased(project, tenant),
          client: project.client,
          callSheets: project.callSheets.map((c) => ({
            id: c.id,
            title: c.title,
            shootDate: c.shootDate.toISOString(),
            generalCallTime: c.generalCallTime,
            locationName: c.locationName,
          })),
          reservations: project.reservations.map((r) => ({
            id: r.id,
            itemName: r.item.name,
            sku: r.item.sku,
            startDate: r.startDate.toISOString(),
            endDate: r.endDate.toISOString(),
            status: r.status,
          })),
          galleries: project.deliverables.map((d) => ({
            id: d.id,
            title: d.title,
            items: d.items.map((i) => ({
              id: i.id,
              title: i.title,
              itemType: i.itemType,
              previewUrl: i.previewUrl,
              fileSize: i.fileSize,
              isClientFav: i.isClientFav,
              clientNotes: i.clientNotes,
            })),
          })),
          invoices: project.invoices,
          shotItems: project.shotItems.map((s) => ({
            id: s.id,
            projectId: s.projectId,
            sceneNumber: s.sceneNumber,
            shotNumber: s.shotNumber,
            framing: s.framing,
            cameraLens: s.cameraLens,
            lightingSetup: s.lightingSetup,
            referenceImageUrl: s.referenceImageUrl,
            description: s.description,
            status: s.status,
            sortOrder: s.sortOrder,
          })),
        }}
      />
    </div>
  );
}
