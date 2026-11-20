import { PageShell, PageHeader } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { canAccessProject } from "@/lib/auth/access-guard";
import { NoAccess } from "@/components/admin/no-access";
import { MySchedule } from "@/components/admin/schedule/my-schedule";
import { loadSchedule } from "@/lib/bookings/schedule";
import { studioNow } from "@/lib/slot-time";

interface SchedulePageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ past?: string }>;
}

export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `My schedule | ${tenant.name} Studio Admin` : "My schedule" };
}

// Any team member (and the owner): their own assigned sessions, never anyone else's.
export default async function MySchedulePage({ params, searchParams }: SchedulePageProps) {
  const { tenantSlug } = await params;
  const { past } = await searchParams;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      brandColor: true,
      currency: true,
      discipline: true,
      bio: true,
      tagline: true,
    },
  });
  if (!tenant) notFound();

  const today = studioNow().dateKey;
  const showPast = past === "1";
  const days = await loadSchedule(tenant.id, viewer.user.id, { from: today, past: showPast });

  const projectIds = [...new Set(days.flatMap((d) => d.sessions.map((s) => s.projectId).filter((id): id is string => !!id)))];
  const openable = (
    await Promise.all(
      projectIds.map(async (id) => ((await canAccessProject(viewer.user, viewer.access, tenant.id, id)) ? id : null))
    )
  ).filter((id): id is string => id !== null);

  return (
    <PageShell width="detail">
      <PageHeader icon={CalendarClock} title="My schedule" description="The sessions you are assigned to." />
      <MySchedule
        tenantSlug={tenantSlug}
        tenantName={tenant.name}
        tenantBio={tenant.bio}
        currency={tenant.currency}
        brandColor={tenant.brandColor}
        days={days}
        past={showPast}
        today={today}
        openableProjects={openable}
      />
    </PageShell>
  );
}
