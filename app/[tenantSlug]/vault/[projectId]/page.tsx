import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { filesReleased } from "@/lib/deliverables/access";
import { requirePageAccess } from "@/lib/auth/project-access";
import { VaultShell } from "@/components/vault/vault-shell";
import { StudioPageHeader } from "@/components/layout/studio-page-header";
import { FramedPrintsSection } from "@/components/prints/framed-prints-section";
import { loadFramedPrints } from "@/lib/prints/gallery";
import { currencySymbol } from "@/lib/money";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { levelAtLeast, loadAccess } from "@/lib/auth/access";
import { canWorkOn } from "@/lib/auth/access-guard";

interface VaultPageProps {
  params: Promise<{
    tenantSlug: string;
    projectId: string;
  }>;
}

export async function generateMetadata({ params }: VaultPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Gallery" };

  // Generic: the page needs a sign-in, so the tab title must not reveal the project.
  return {
    title: `Your gallery | ${tenant.name}`,
    robots: { index: false, follow: false },
    description: "Review watermarked proofs, stream review video, select favorites, and access 4K master deliverables.",
  };
}

export default async function ProjectVaultPage({ params }: VaultPageProps) {
  const { tenantSlug, projectId } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      brandColor: true,
      releaseFilesBeforePayment: true,
    },
  });

  if (!tenant) notFound();

  // 2. Resolve Scoped Project with Deliverables & Invoices
  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      studioLead: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      invoices: {
        where: { milestoneType: { in: ["FINAL_BALANCE_50", "BOOKING_BALANCE"] } },
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          status: true,
          dueDate: true,
        },
      },
      deliverables: {
        include: {
          items: {
            orderBy: [{ itemType: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });

  if (!project) notFound();

  // The project's client or the studio's staff, signed in.
  const viewer = await requirePageAccess({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    clientId: project.client.id,
    record: { area: "galleries", projectId: project.id },
    returnTo: `/${tenant.slug}/vault/${project.id}`,
  });

  // The client sees their own balance and marks up their own photos. The team sees money only with
  // Invoices VIEW, and marks up only a gallery they may work on (Galleries MANAGE, or OWN on their own).
  const isStaff = STAFF_ROLES.has(viewer.role);
  const access = isStaff ? await loadAccess({ id: viewer.id, role: viewer.role, tenantId: tenant.id }) : null;
  const money = !access || levelAtLeast(access.areas.invoices, "VIEW");
  const canMarkUp = !access || (await canWorkOn({ id: viewer.id, access }, tenant.id, "galleries", project.id));
  const finalInvoice = money ? project.invoices[0] || null : null;
  const [framedPrints, orderableSizes] = await Promise.all([
    loadFramedPrints(project.id),
    db.printSize.count({ where: { tenantId: tenant.id, isAvailable: true } }),
  ]);
  // Shown when there is something to claim, an order to follow, or a catalog to order from.
  const showFramedPrints = framedPrints.lines.length > 0 || framedPrints.orders.length > 0 || orderableSizes > 0;
  const released = filesReleased(project, tenant);
  const allItems = project.deliverables.flatMap((d) => d.items);

  const photoItems = allItems
    .filter((i) => i.itemType === "PHOTO")
    .map((p) => ({
      id: p.id,
      itemType: p.itemType,
      title: p.title,
      // Released: the clean copy, through the access-checked route. Otherwise the watermarked proof.
      previewUrl: released ? `/api/download?projectId=${project.id}&type=photo_view&assetId=${p.id}` : p.previewUrl,
      downloadUrl: p.downloadUrl,
      thumbnailUrl: p.thumbnailUrl,
      resolution: p.resolution,
      fileSize: p.fileSize,
      isClientFav: p.isClientFav,
      clientNotes: p.clientNotes,
    }));

  const videoItems = allItems
    .filter((i) => i.itemType === "VIDEO")
    .map((v) => ({
      id: v.id,
      itemType: v.itemType,
      title: v.title,
      previewUrl: v.previewUrl,
      downloadUrl: v.downloadUrl,
      thumbnailUrl: v.thumbnailUrl,
      resolution: v.resolution,
      duration: v.duration,
      fileSize: v.fileSize,
      clientNotes: v.clientNotes,
    }));

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <StudioPageHeader tenantSlug={tenant.slug} />
      <VaultShell
        back={
          isStaff
            ? { href: `/${tenant.slug}/admin/projects/${project.id}`, label: "Back to project" }
            : { href: `/${tenant.slug}/account?tab=projects`, label: "My galleries" }
        }
        tenant={tenant}
        project={{
          id: project.id,
          projectNumber: project.projectNumber,
          title: project.title,
          category: project.category,
          discipline: project.discipline,
          isFinalBalancePaid: money ? project.isFinalBalancePaid : false,
          filesReleased: released,
          budget: money ? project.budget : 0,
          client: project.client,
          studioLead: project.studioLead,
        }}
        finalInvoice={finalInvoice}
        photoItems={photoItems}
        videoItems={videoItems}
        money={money}
        canMarkUp={canMarkUp}
      >
        {showFramedPrints && (
          <FramedPrintsSection
            tenantId={tenant.id}
            tenantSlug={tenant.slug}
            currency={currencySymbol(tenant.currency)}
            projectId={project.id}
            lines={framedPrints.lines}
            unlocked={framedPrints.unlocked}
            hasPhotos={framedPrints.hasPhotos}
            orders={framedPrints.orders}
            {...(isStaff ? { staffOrderHref: `/${tenant.slug}/admin/projects/${project.id}/prints` } : {})}
          />
        )}
      </VaultShell>
    </div>
  );
}
