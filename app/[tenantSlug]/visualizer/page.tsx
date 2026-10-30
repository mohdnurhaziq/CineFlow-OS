import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { VisualizerShell } from "@/components/visualizer/visualizer-shell";
import type {
  PrintSizeOption,
  FrameDesignOption,
  PhotoOption,
} from "@/components/visualizer/configurator-panel";

interface VisualizerPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams: Promise<{
    projectId?: string;
    photoUrl?: string;
  }>;
}

export async function generateMetadata({
  params,
}: VisualizerPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Visualizer Not Found" };

  return {
    title: `Print & Frame Wall Visualizer | ${tenant.name}`,
    description: "Interactive real-scale wall art visualizer anchored to an 84-inch sofa with custom frame moldings and museum glass.",
  };
}

export default async function VisualizerPage({
  params,
  searchParams,
}: VisualizerPageProps) {
  const { tenantSlug } = await params;
  const { projectId, photoUrl } = await searchParams;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) notFound();

  // 2. Fetch Print Sizes & Frame Designs
  const [printSizes, frameDesigns] = await Promise.all([
    db.printSize.findMany({
      where: { tenantId: tenant.id },
      orderBy: { widthInches: "asc" },
    }),
    db.frameDesign.findMany({
      where: { tenantId: tenant.id, isAvailable: true },
      orderBy: { priceOffset: "asc" },
    }),
  ]);

  // 3. Prepare Photos: project deliverables (if specified) + curated studio masterpieces
  const curatedPhotos: PhotoOption[] = [
    {
      id: "curated_1",
      title: "Aurora Luxury Editorial Portrait",
      url: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
    },
    {
      id: "curated_2",
      title: "Pavilion 4 Fashion Close-Up",
      url: "/uploads/deliverables/previews/aurora_hero_02_watermarked.jpg",
    },
    {
      id: "curated_3",
      title: "Heirloom Convocation Graduate",
      url: "/uploads/deliverables/previews/farah_convo_01_preview.jpg",
    },
    {
      id: "curated_4",
      title: "Royal Family Heritage Portrait",
      url: "/uploads/deliverables/previews/farah_family_02_preview.jpg",
    },
  ];

  // If client provided a direct photoUrl in query param, insert as first option
  if (photoUrl) {
    curatedPhotos.unshift({
      id: "query_photo",
      title: "Client Deliverable Photo",
      url: photoUrl,
    });
  }

  // If projectId is provided, query project deliverables
  if (projectId) {
    const deliverableItems = await db.deliverableItem.findMany({
      where: {
        deliverable: { projectId, project: { tenantId: tenant.id } },
        itemType: "PHOTO",
      },
    });

    for (const dItem of deliverableItems) {
      if (!curatedPhotos.some((p) => p.url === dItem.previewUrl)) {
        curatedPhotos.unshift({
          id: dItem.id,
          title: dItem.title,
          url: dItem.previewUrl,
        });
      }
    }
  }

  const currencySymbol = tenant.currency === "MYR" ? "RM" : "$";

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <VisualizerShell
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        currency={currencySymbol}
        projectId={projectId}
        initialPrintSizes={printSizes as PrintSizeOption[]}
        initialFrameDesigns={frameDesigns as FrameDesignOption[]}
        initialPhotos={curatedPhotos}
      />
    </div>
  );
}
