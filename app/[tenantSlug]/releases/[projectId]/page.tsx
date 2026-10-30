import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { ReleaseFormShell } from "@/components/logistics/release-form-shell";

interface ReleasesPageProps {
  params: Promise<{
    tenantSlug: string;
    projectId: string;
  }>;
}

export async function generateMetadata({
  params,
}: ReleasesPageProps): Promise<Metadata> {
  const { tenantSlug, projectId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Releases Not Found" };

  const project = await db.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    select: { title: true, projectNumber: true },
  });

  return {
    title: project
      ? `Digital Releases | ${project.title} (${project.projectNumber}) | ${tenant.name}`
      : `Digital Releases | ${tenant.name}`,
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

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <ReleaseFormShell
        projectId={project.id}
        projectTitle={project.title}
        projectNumber={project.projectNumber}
        tenantSlug={tenant.slug}
        studioName={tenant.name}
        existingReleases={project.digitalReleases}
      />
    </div>
  );
}
