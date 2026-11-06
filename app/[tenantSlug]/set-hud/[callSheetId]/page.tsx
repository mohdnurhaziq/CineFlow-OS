import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";
import { generateWhatsAppCallSheetUrl } from "@/lib/whatsapp";
import { CallSheetShell, type CallSheetDetails } from "@/components/logistics/call-sheet-shell";
import { PortalTopBar } from "@/components/portal/portal-top-bar";

interface SetHudPageProps {
  params: Promise<{
    tenantSlug: string;
    callSheetId: string;
  }>;
}

export async function generateMetadata({
  params,
}: SetHudPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  if (!tenant) return { title: "Call Sheet" };

  // Generic: the page needs a sign-in, so the tab title must not reveal the shoot.
  return {
    title: `Call Sheet | ${tenant.name}`,
    robots: { index: false, follow: false },
    description: "Real-time on-set mobile call sheet companion with solar golden hour calculations and interactive shot check-off.",
  };
}

export default async function SetHudPage({ params }: SetHudPageProps) {
  const { tenantSlug, callSheetId } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) notFound();

  // 2. Resolve CallSheet scoped to tenant
  const callSheet = await db.callSheet.findFirst({
    where: {
      id: callSheetId,
      project: { tenantId: tenant.id },
    },
    include: {
      project: {
        include: {
          // Only what the page shows: the full row holds bank details and the gateway secret.
          tenant: { select: { id: true, name: true, slug: true } },
          shotItems: {
            orderBy: [{ sceneNumber: "asc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  });

  if (!callSheet) notFound();

  // The project's client or the studio's staff, signed in.
  await requirePageAccess({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    clientId: callSheet.project.clientId,
    returnTo: `/${tenant.slug}/set-hud/${callSheet.id}`,
  });

  // 3. Compute Solar Golden Hour Times using astronomical algorithms
  const coords = extractCoordinates(callSheet.locationPinUrl);
  const solarTimes = calculateGoldenHour(coords.lat, coords.lng, callSheet.shootDate);

  // 4. Generate WhatsApp Dispatch URL & Formatted Markdown
  const { url: whatsappUrl, previewText: whatsappPreview } =
    generateWhatsAppCallSheetUrl(
      {
        ...callSheet,
        sunriseTime: callSheet.sunriseTime || solarTimes.sunrise,
        sunsetTime: callSheet.sunsetTime || solarTimes.sunset,
        goldenHourMorning: callSheet.goldenHourMorning || solarTimes.goldenHourMorning,
        goldenHourEvening: callSheet.goldenHourEvening || solarTimes.goldenHourEvening,
      },
      undefined,
      process.env.NEXT_PUBLIC_APP_URL || ""
    );

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <PortalTopBar
        tenant={tenant}
        back={{ href: `/${tenant.slug}/account?tab=projects`, label: "My projects" }}
        staffBack={{ href: `/${tenant.slug}/admin/projects/${callSheet.projectId}`, label: "Back to project" }}
      />
      <main className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <CallSheetShell
        callSheet={callSheet as unknown as CallSheetDetails}
        solarTimes={solarTimes}
        whatsappUrl={whatsappUrl}
        whatsappPreview={whatsappPreview}
      />
      </main>
    </div>
  );
}
