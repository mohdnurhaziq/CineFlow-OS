import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { FramesManager } from "@/components/admin/frames/frames-manager";
import type { FrameDesignRow } from "@/components/admin/frames/frame-design-dialog";
import type { PrintSizeRow } from "@/components/admin/frames/print-size-dialog";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";

interface FramesPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: FramesPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Frames Not Found" };

  return {
    title: `Frames & Prints | ${tenant.name} Studio Admin`,
    description: "Manage custom frame moldings, dimensions, and wall art visualizer options.",
  };
}

// Catalog VIEW.
export default async function AdminFramesPage({ params }: FramesPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.catalog, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      matBoardPrice: true,
    },
  });

  if (!tenant) notFound();

  // 2. Fetch scoped frame designs
  const frames = await db.frameDesign.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isAvailable: "desc" }, { priceOffset: "asc" }],
  });

  // 3. Fetch scoped print sizes
  const printSizes = await db.printSize.findMany({
    where: { tenantId: tenant.id },
    orderBy: { widthInches: "asc" },
  });

  return (
    <PageShell>
      <FramesManager
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        matBoardPrice={tenant.matBoardPrice}
        initialFrames={frames as unknown as FrameDesignRow[]}
        initialSizes={printSizes as unknown as PrintSizeRow[]}
        canManage={levelAtLeast(viewer.access.areas.catalog, "MANAGE")}
      />
    </PageShell>
  );
}
