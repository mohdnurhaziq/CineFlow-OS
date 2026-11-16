import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { filesReleased } from "@/lib/deliverables/access";
import { catchUpShotStages } from "@/lib/projects/stage";
import { formatMoney } from "@/lib/money";
import type { JobBooking, JobPayment } from "@/components/admin/projects/job-header";
import { ProjectWorkspace } from "@/components/admin/projects/project-workspace";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { canAccessProject } from "@/lib/auth/access-guard";
import { NoAccess } from "@/components/admin/no-access";
import { projectPagePowers } from "@/lib/auth/page-powers";

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

// Galleries access; at "Only their own", only a project they lead or are assigned to.
export default async function AdminProjectPage({ params }: ProjectPageProps) {
  const { tenantSlug, projectId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true, releaseFilesBeforePayment: true } });
  if (!tenant) notFound();
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.galleries, "OWN")) return <NoAccess tenantSlug={tenantSlug} />;
  if (!(await db.project.findFirst({ where: { id: projectId, tenantId: tenant.id }, select: { id: true } }))) notFound();
  if (!(await canAccessProject(viewer.user, viewer.access, tenant.id, projectId))) return <NoAccess tenantSlug={tenantSlug} />;
  const powers = projectPagePowers(viewer.access);
  const money = powers.money;

  // A session whose time has passed counts as shot.
  await catchUpShotStages(tenant.id);

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      booking: {
        select: {
          id: true,
          trackingCode: true,
          packageName: true,
          serviceTier: true,
          targetDate: true,
          slot: { select: { date: true, startTime: true, endTime: true } },
        },
      },
      callSheets: { orderBy: { shootDate: "asc" } },
      reservations: { include: { item: { select: { name: true, sku: true } } }, orderBy: { startDate: "asc" } },
      deliverables: { include: { items: { orderBy: { id: "asc" } } }, orderBy: { createdAt: "asc" } },
      // Money only with Invoices access: without it the invoices aren't loaded at all.
      ...(money ? { invoices: { select: { id: true, invoiceNumber: true, milestoneType: true, amount: true, status: true }, orderBy: { createdAt: "asc" as const } } } : {}),
      shotItems: { orderBy: [{ sceneNumber: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!project) notFound();

  const gear = await db.inventoryItem.findMany({
    where: { tenantId: tenant.id, status: { not: "MAINTENANCE" } },
    select: { id: true, name: true, sku: true },
    orderBy: { name: "asc" },
  });

  // One line for the header: paid in full, or what is still owed (only with Invoices access).
  const invoices = "invoices" in project ? project.invoices : [];
  const open = invoices.filter((i) => i.status === "PENDING" || i.status === "OVERDUE");
  const checking = invoices.filter((i) => i.status === "PENDING_VERIFICATION");
  const sum = (rows: { amount: number }[]) => rows.reduce((n, i) => n + i.amount, 0);
  const payment: JobPayment | null = !money
    ? null
    : open.length > 0
      ? { label: `${formatMoney(tenant.currency, sum(open))} due`, tone: "due" }
      : checking.length > 0
        ? { label: `${formatMoney(tenant.currency, sum(checking))} being checked`, tone: "due" }
        : invoices.some((i) => i.status === "PAID")
          ? { label: "Paid in full", tone: "paid" }
          : { label: "No invoices yet", tone: "neutral" };

  const b = project.booking;
  const booking: JobBooking | null = b
    ? {
        id: b.id,
        trackingCode: b.trackingCode,
        packageName: b.packageName ?? b.serviceTier ?? null,
        date: b.slot ? b.slot.date.toISOString() : b.targetDate ? `${b.targetDate}T00:00:00.000Z` : null,
        startTime: b.slot?.startTime ?? null,
        endTime: b.slot?.endTime ?? null,
      }
    : null;

  return (
    <PageShell width="detail">
      <ProjectWorkspace
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        gear={gear}
        booking={booking}
        payment={payment}
        money={money ? { budget: project.budget, invoices } : null}
        canEditGallery={powers.canEditGallery}
        canChangeKind={powers.canChangeKind}
        canManageProduction={powers.canManageProduction}
        canOrderPrints={powers.canOrderPrints}
        project={{
          id: project.id,
          title: project.title,
          projectNumber: project.projectNumber,
          status: project.status,
          kind: project.kind,
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
    </PageShell>
  );
}
