import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { FramesManager } from "@/components/admin/frames/frames-manager";
import type { FrameDesignRow } from "@/components/admin/frames/frame-design-dialog";
import type { PrintSizeRow } from "@/components/admin/frames/print-size-dialog";

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
    title: `Frames & Print Sizes | ${tenant.name} Studio Admin`,
    description: "Manage custom frame moldings, dimensions, and wall art visualizer options.",
  };
}

export default async function AdminFramesPage({ params }: FramesPageProps) {
  const { tenantSlug } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
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
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <FramesManager
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialFrames={frames as unknown as FrameDesignRow[]}
        initialSizes={printSizes as unknown as PrintSizeRow[]}
      />
    </div>
  );
}
