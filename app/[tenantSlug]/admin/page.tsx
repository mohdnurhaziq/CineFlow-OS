import { PageShell } from "@/components/ui/page";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadStudioAnalytics, type DashboardSections } from "@/lib/analytics/studio-analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { levelAtLeast, type AccessMap } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
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

/** The parts of the Overview this person's access covers. */
function sectionsFor(access: AccessMap): DashboardSections {
  const has = levelAtLeast;
  return {
    money: has(access.areas.invoices, "VIEW"),
    work: has(access.areas.galleries, "VIEW") || has(access.areas.bookings, "VIEW"),
    gear: has(access.areas.production, "VIEW"),
    proposals: has(access.areas.proposals, "VIEW"),
    shoots: has(access.areas.production, "VIEW"),
    calendar: has(access.areas.bookings, "VIEW"),
  };
}

// Any team member; each tile shows only when their access covers it.
export default async function AdminDashboardPage({ params }: AdminPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer) return <NoAccess tenantSlug={tenantSlug} />;
  const sections = sectionsFor(viewer.access);
  // Only the sections they may see are loaded, so nothing else reaches the browser.
  const [analytics, onboarding] = await Promise.all([loadStudioAnalytics(tenantSlug, sections), onboardingFor(tenantSlug)]);

  if (!analytics) {
    notFound();
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const bookingUrl = `${appUrl}/${tenantSlug}`;

  return (
    <PageShell>
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
    </PageShell>
  );
}
