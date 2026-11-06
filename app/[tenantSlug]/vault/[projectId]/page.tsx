import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { VaultShell } from "@/components/vault/vault-shell";

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

  if (!tenant) return { title: "Vault" };

  // Generic: the page needs a sign-in, so the tab title must not reveal the project.
  return {
    title: `Delivery Vault | ${tenant.name}`,
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
  await requirePageAccess({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    clientId: project.client.id,
    returnTo: `/${tenant.slug}/vault/${project.id}`,
  });

  const finalInvoice = project.invoices[0] || null;
  const allItems = project.deliverables.flatMap((d) => d.items);

  const photoItems = allItems
    .filter((i) => i.itemType === "PHOTO")
    .map((p) => ({
      id: p.id,
      itemType: p.itemType,
      title: p.title,
      previewUrl: p.previewUrl,
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
      <VaultShell
        tenant={tenant}
        project={{
          id: project.id,
          projectNumber: project.projectNumber,
          title: project.title,
          category: project.category,
          discipline: project.discipline,
          isFinalBalancePaid: project.isFinalBalancePaid,
          budget: project.budget,
          client: project.client,
          studioLead: project.studioLead,
        }}
        finalInvoice={finalInvoice}
        photoItems={photoItems}
        videoItems={videoItems}
      />
    </div>
  );
}
