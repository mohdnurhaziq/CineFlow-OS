import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStudioAnalytics } from "@/lib/actions/admin-analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetupChecklist, type SetupChecklist as SetupChecklistData } from "@/lib/onboarding/checklist";
import { StudioDashboard } from "@/components/admin/studio-dashboard";
import { SetupChecklist } from "@/components/admin/onboarding/setup-checklist";
import { DashboardTour } from "@/components/admin/onboarding/dashboard-tour";

interface AdminPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: AdminPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Overview | ${tenant.name} Studio Admin` : "Studio Admin" };
}

/**
 * Onboarding help for the signed-in user: the setup checklist (this studio's own owner, until
 * they close it) and whether the tour should start on its own (never finished or skipped).
 * The admin layout has already checked that the user is staff of this studio.
 */
async function onboardingFor(
  tenantSlug: string,
): Promise<{ checklist: SetupChecklistData | null; autoStartTour: boolean }> {
  const none = { checklist: null, autoStartTour: false };
  const user = await getCurrentUser();
  if (!user) return none;
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { onboardingChecklistDismissedAt: true, onboardingTourSeenAt: true },
  });
  if (!row) return none;

  let checklist: SetupChecklistData | null = null;
  if (user.role === "STUDIO_OWNER" && user.tenantId && !row.onboardingChecklistDismissedAt) {
    const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (tenant && tenant.id === user.tenantId) checklist = await getSetupChecklist(tenant.id);
  }
  return { checklist, autoStartTour: !row.onboardingTourSeenAt };
}

export default async function AdminDashboardPage({ params }: AdminPageProps) {
  const { tenantSlug } = await params;
  const [analytics, onboarding] = await Promise.all([getStudioAnalytics(tenantSlug), onboardingFor(tenantSlug)]);

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
          onboarding.checklist ? (
            <SetupChecklist tenantSlug={tenantSlug} checklist={onboarding.checklist} bookingUrl={bookingUrl} />
          ) : null
        }
      />
      <Suspense fallback={null}>
        <DashboardTour tenantSlug={tenantSlug} autoStart={onboarding.autoStartTour} />
      </Suspense>
    </div>
  );
}
