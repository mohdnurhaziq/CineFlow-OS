import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { LogIn } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { currencySymbol } from "@/lib/money";
import { loadProjectOrdering, toFrameOption, toSizeOption } from "@/lib/prints/project-ordering";
import { loadClientHeaderBadges } from "@/lib/client-header-badges";
import { VisualizerShell } from "@/components/visualizer/visualizer-shell";
import type { OrderingContext } from "@/components/visualizer/cart";
import { ShowcaseNav } from "@/components/showcase/showcase-nav";
import { ClientAccountHeader } from "@/components/account/client-account-header";
import { getSessionClient } from "@/lib/clients";
import type { PhotoOption } from "@/components/visualizer/configurator-panel";

interface VisualizerPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams: Promise<{
    projectId?: string;
    /** An included print line to start from. */
    claim?: string;
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
  const { projectId: requestedProjectId, claim } = await searchParams;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) notFound();

  // 2. Fetch the print sizes and frames that can be ordered
  const [printSizes, frameDesigns] = await Promise.all([
    db.printSize.findMany({
      where: { tenantId: tenant.id, isAvailable: true },
      orderBy: { widthInches: "asc" },
    }),
    db.frameDesign.findMany({
      where: { tenantId: tenant.id, isAvailable: true },
      orderBy: { priceOffset: "asc" },
    }),
  ]);

  // 3. A project's own photos are private: only its client or the studio's staff, signed in.
  const project = requestedProjectId
    ? await db.project.findFirst({ where: { id: requestedProjectId, tenantId: tenant.id }, select: { id: true, clientId: true } })
    : null;
  if (requestedProjectId && !project) notFound();

  let photos: PhotoOption[];
  let ordering: OrderingContext | null = null;
  let viewerIsProjectClient = false;

  if (project) {
    const session = await requirePageAccess({
      tenantSlug: tenant.slug,
      tenantId: tenant.id,
      clientId: project.clientId,
      record: { area: "galleries", projectId: project.id },
      returnTo: `/${tenant.slug}/visualizer?projectId=${project.id}`,
    });
    viewerIsProjectClient = session.role === "CLIENT" && session.id === project.clientId;

    ({ photos, ordering } = await loadProjectOrdering({
      tenantId: tenant.id,
      project,
      galleryHref: `/${tenant.slug}/vault/${project.id}`,
      claim,
    }));
  } else {
    // The public preview: this studio's own published showcase covers.
    const showcase = await db.showcaseItem.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, coverImageUrl: true },
      take: 12,
    });
    photos = showcase
      .filter((item) => item.coverImageUrl)
      .map((item) => ({ id: `showcase_${item.id}`, title: item.title, url: item.coverImageUrl }));
  }

  const canOrder = !!ordering && ordering.unlocked && ordering.hasPhotos;

  const shell = (
    <VisualizerShell
      tenantSlug={tenant.slug}
      tenantId={tenant.id}
      tenantName={tenant.name}
      currency={currencySymbol(tenant.currency)}
      matBoardPrice={tenant.matBoardPrice}
      canOrder={canOrder}
      ordering={ordering}
      initialPrintSizes={printSizes.map(toSizeOption)}
      initialFrameDesigns={frameDesigns.map(toFrameOption)}
      initialPhotos={photos}
    />
  );

  // The project's client ordering from their gallery: the client portal's top bar.
  if (project && viewerIsProjectClient) {
    const [client, badges] = await Promise.all([
      db.user.findFirst({ where: { id: project.clientId, tenantId: tenant.id, role: "CLIENT" }, select: { name: true, email: true, phone: true } }),
      loadClientHeaderBadges(tenant.id, project.clientId),
    ]);
    return (
      <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400">
        {client && <ClientAccountHeader tenant={tenant} client={client} badges={badges} />}
        <main className="flex-1 py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">{shell}</main>
      </div>
    );
  }

  // Everyone else: the same studio top bar as the studio website, so visitors can still book, message or sign in.
  const session = await getCurrentUser();
  const [studioLead, navClient] = await Promise.all([
    db.user.findFirst({
      where: { tenantId: tenant.id, role: "STUDIO_OWNER" },
      select: { name: true, phone: true },
    }),
    getSessionClient(tenant.id),
  ]);
  const navStaff =
    session && STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id)
      ? { name: session.name, email: session.email, role: session.role }
      : null;
  const signInHref = `/${tenant.slug}/login?callbackUrl=${encodeURIComponent(`/${tenant.slug}/account`)}`;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <ShowcaseNav
        tenant={tenant}
        studioLead={studioLead}
        client={navClient ? { name: navClient.name, email: navClient.email } : null}
        staff={navStaff}
      />
      <main className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
        {!project && (
          <Link
            href={signInHref}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#121215] px-4 py-3 text-sm text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors"
          >
            <LogIn className="size-4 text-amber-400 shrink-0" />
            <span>Ordering is done from your gallery — sign in</span>
          </Link>
        )}
        {shell}
      </main>
    </div>
  );
}
