import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStudioAnalytics } from "@/lib/actions/admin-analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetupChecklist, type SetupChecklist as SetupChecklistData } from "@/lib/onboarding/checklist";
import { StudioDashboard } from "@/components/admin/studio-dashboard";
import { SetupChecklist } from "@/components/admin/onboarding/setup-checklist";

interface AdminPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: AdminPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Overview | ${tenant.name} Studio Admin` : "Studio Admin" };
}

/** The setup checklist, for this studio's own owner until they close it. Null otherwise. */
async function ownerChecklist(tenantSlug: string): Promise<{ checklist: SetupChecklistData } | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "STUDIO_OWNER" || !user.tenantId) return null;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant || tenant.id !== user.tenantId) return null;
  const row = await db.user.findUnique({ where: { id: user.id }, select: { onboardingChecklistDismissedAt: true } });
  if (!row || row.onboardingChecklistDismissedAt) return null;
  return { checklist: await getSetupChecklist(tenant.id) };
}

export default async function AdminDashboardPage({ params }: AdminPageProps) {
  const { tenantSlug } = await params;
  const [analytics, guide] = await Promise.all([getStudioAnalytics(tenantSlug), ownerChecklist(tenantSlug)]);

  if (!analytics) {
    notFound();
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const bookingUrl = `${appUrl}/${tenantSlug}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StudioDashboard
        data={analytics}
        guide={
          guide ? <SetupChecklist tenantSlug={tenantSlug} checklist={guide.checklist} bookingUrl={bookingUrl} /> : null
        }
      />
    </div>
  );
}
