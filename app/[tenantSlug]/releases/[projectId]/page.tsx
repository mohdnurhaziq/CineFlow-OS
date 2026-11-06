import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { ReleaseFormShell } from "@/components/logistics/release-form-shell";
import { PortalTopBar } from "@/components/portal/portal-top-bar";

interface ReleasesPageProps {
  params: Promise<{
    tenantSlug: string;
    projectId: string;
  }>;
}

export async function generateMetadata({
  params,
}: ReleasesPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  if (!tenant) return { title: "Releases" };

  // Generic: the page needs a sign-in, so the tab title must not reveal the project.
  return {
    title: `Digital Releases | ${tenant.name}`,
    robots: { index: false, follow: false },
    description: "Touchscreen legal release forms for talent, models, and location property clearances.",
  };
}

export default async function ReleasesPage({ params }: ReleasesPageProps) {
  const { tenantSlug, projectId } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) notFound();

  // 2. Resolve Project scoped to tenant
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      tenantId: tenant.id,
    },
    include: {
      digitalReleases: {
        orderBy: { signedAt: "desc" },
      },
    },
  });

  if (!project) notFound();

  // The project's client or the studio's staff, signed in; each release records who collected it.
  await requirePageAccess({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    clientId: project.clientId,
    returnTo: `/${tenant.slug}/releases/${project.id}`,
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <PortalTopBar
        tenant={tenant}
        back={{ href: `/${tenant.slug}/account?tab=projects`, label: "My projects" }}
        staffBack={{ href: `/${tenant.slug}/admin/projects/${project.id}`, label: "Back to project" }}
      />
      <main className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <ReleaseFormShell
        projectId={project.id}
        projectTitle={project.title}
        projectNumber={project.projectNumber}
        tenantSlug={tenant.slug}
        studioName={tenant.name}
        existingReleases={project.digitalReleases}
      />
      </main>
    </div>
  );
}
