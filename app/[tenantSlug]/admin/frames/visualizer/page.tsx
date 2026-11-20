import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { currencySymbol } from "@/lib/money";
import { PageShell } from "@/components/ui/page";
import { VisualizerShell } from "@/components/visualizer/visualizer-shell";
import type { PrintSizeOption, FrameDesignOption, PhotoOption } from "@/components/visualizer/configurator-panel";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { SHOWCASE_PLACEHOLDER, showcaseCover } from "@/lib/showcase/cover";

interface AdminVisualizerPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: AdminVisualizerPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Wall Art Preview | ${tenant.name} Studio Admin` : "Wall Art Preview" };
}

/**
 * Wall Art inside the admin console, as a preview (no ordering), for Catalog VIEW. The admin layout
 * supplies the admin top bar.
 */
export default async function AdminVisualizerPage({ params }: AdminVisualizerPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.catalog, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  const [printSizes, frameDesigns, showcase] = await Promise.all([
    db.printSize.findMany({ where: { tenantId: tenant.id }, orderBy: { widthInches: "asc" } }),
    db.frameDesign.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { priceOffset: "asc" } }),
    db.showcaseItem.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, coverImageUrl: true },
      take: 12,
    }),
  ]);

  const photos: PhotoOption[] = showcase
    // Only real photos: a placeholder isn't something to put in a frame.
      .filter((item) => showcaseCover(item.coverImageUrl) !== SHOWCASE_PLACEHOLDER)
    .map((item) => ({ id: `showcase_${item.id}`, title: item.title, url: item.coverImageUrl }));

  return (
    <PageShell>
      <VisualizerShell
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        currency={currencySymbol(tenant.currency)}
        matBoardPrice={tenant.matBoardPrice}
        canOrder={false}
        ordering={null}
        initialPrintSizes={printSizes as PrintSizeOption[]}
        initialFrameDesigns={frameDesigns as FrameDesignOption[]}
        initialPhotos={photos}
      />
    </PageShell>
  );
}
