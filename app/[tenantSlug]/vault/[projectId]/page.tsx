import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { VaultShell } from "@/components/vault/vault-shell";

interface VaultPageProps {
  params: Promise<{
    tenantSlug: string;
    projectId: string;
  }>;
}

export async function generateMetadata({ params }: VaultPageProps): Promise<Metadata> {
  const { tenantSlug, projectId } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });

  if (!tenant) return { title: "Vault | CineFlow OS" };

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    select: { title: true, projectNumber: true },
  });

  if (!project) return { title: "Vault Not Found | CineFlow OS" };

  return {
    title: `${project.title} — Private Delivery Vault | ${tenant.name}`,
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
        where: { milestoneType: "FINAL_BALANCE_50" },
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
