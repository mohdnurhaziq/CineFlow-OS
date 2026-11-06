import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStudioAnalytics } from "@/lib/actions/admin-analytics";
import { StudioDashboard } from "@/components/admin/studio-dashboard";

interface AdminPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: AdminPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Overview | ${tenant.name} Studio Admin` : "Studio Admin" };
}

export default async function AdminDashboardPage({ params }: AdminPageProps) {
  const { tenantSlug } = await params;
  const analytics = await getStudioAnalytics(tenantSlug);

  if (!analytics) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StudioDashboard data={analytics} />
    </div>
  );
}
