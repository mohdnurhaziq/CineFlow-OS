import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { currencySymbol } from "@/lib/money";
import type { PrintOrderer } from "@/components/visualizer/order-modal";
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
  const { projectId: requestedProjectId } = await searchParams;

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

  // 3. Photos to try on the wall: this studio's own published showcase covers, plus the
  //    project's photos when opened from a vault (below).
  const showcase = await db.showcaseItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
    select: { id: true, title: true, coverImageUrl: true },
    take: 12,
  });
  const curatedPhotos: PhotoOption[] = showcase
    .filter((item) => item.coverImageUrl)
    .map((item) => ({ id: `showcase_${item.id}`, title: item.title, url: item.coverImageUrl }));

  // A project's own photos are private: only its client or the studio's staff, signed in.
  const project = requestedProjectId
    ? await db.project.findFirst({ where: { id: requestedProjectId, tenantId: tenant.id }, select: { id: true, clientId: true } })
    : null;
  if (requestedProjectId && !project) notFound();
  const projectId = project?.id;

  if (project) {
    await requirePageAccess({
      tenantSlug: tenant.slug,
      tenantId: tenant.id,
      clientId: project.clientId,
      returnTo: `/${tenant.slug}/visualizer?projectId=${project.id}`,
    });

    const deliverableItems = await db.deliverableItem.findMany({
      where: {
        deliverable: { projectId: project.id },
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

  // Who would place an order: ordering prints needs a sign-in.
  const session = await getCurrentUser();
  let orderer: PrintOrderer | null = null;
  if (session?.role === "CLIENT" && session.tenantId === tenant.id) {
    const me = await db.user.findFirst({
      where: { id: session.id, tenantId: tenant.id, role: "CLIENT" },
      select: { name: true, email: true, phone: true },
    });
    if (me) orderer = { kind: "client", name: me.name, email: me.email, phone: me.phone ?? "" };
  } else if (session && STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id)) {
    orderer = { kind: "staff", name: session.name, email: "", phone: "" };
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <main className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <VisualizerShell
        tenantSlug={tenant.slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        currency={currencySymbol(tenant.currency)}
        projectId={projectId}
        orderer={orderer}
        initialPrintSizes={printSizes as PrintSizeOption[]}
        initialFrameDesigns={frameDesigns as FrameDesignOption[]}
        initialPhotos={curatedPhotos}
      />
      </main>
    </div>
  );
}
