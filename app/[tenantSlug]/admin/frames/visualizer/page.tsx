import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { currencySymbol } from "@/lib/money";
import { PageShell } from "@/components/ui/page";
import { VisualizerShell } from "@/components/visualizer/visualizer-shell";
import type { PrintSizeOption, FrameDesignOption, PhotoOption } from "@/components/visualizer/configurator-panel";

interface AdminVisualizerPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: AdminVisualizerPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Wall Art Preview | ${tenant.name} Studio Admin` : "Wall Art Preview" };
}

/** Wall Art inside the admin console: the admin layout supplies the staff guard and the admin top bar. */
export default async function AdminVisualizerPage({ params }: AdminVisualizerPageProps) {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) notFound();

  const [printSizes, frameDesigns, showcase, session] = await Promise.all([
    db.printSize.findMany({ where: { tenantId: tenant.id }, orderBy: { widthInches: "asc" } }),
    db.frameDesign.findMany({ where: { tenantId: tenant.id, isAvailable: true }, orderBy: { priceOffset: "asc" } }),
    db.showcaseItem.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, coverImageUrl: true },
      take: 12,
    }),
    getCurrentUser(),
  ]);

  const photos: PhotoOption[] = showcase
    .filter((item) => item.coverImageUrl)
    .map((item) => ({ id: `showcase_${item.id}`, title: item.title, url: item.coverImageUrl }));

  return (
    <PageShell>
      <VisualizerShell
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        currency={currencySymbol(tenant.currency)}
        orderer={session ? { kind: "staff", name: session.name, email: "", phone: "" } : null}
        initialPrintSizes={printSizes as PrintSizeOption[]}
        initialFrameDesigns={frameDesigns as FrameDesignOption[]}
        initialPhotos={photos}
      />
    </PageShell>
  );
}
