import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { calculateGoldenHour, extractCoordinates } from "@/lib/solar";
import { generateWhatsAppCallSheetUrl } from "@/lib/whatsapp";
import { CallSheetShell, type CallSheetDetails } from "@/components/logistics/call-sheet-shell";

interface SetHudPageProps {
  params: Promise<{
    tenantSlug: string;
    callSheetId: string;
  }>;
}

export async function generateMetadata({
  params,
}: SetHudPageProps): Promise<Metadata> {
  const { tenantSlug, callSheetId } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Call Sheet Not Found" };

  const callSheet = await db.callSheet.findFirst({
    where: { id: callSheetId, project: { tenantId: tenant.id } },
    select: { title: true, generalCallTime: true },
  });

  return {
    title: callSheet
      ? `${callSheet.title} | On-Set Companion HUD | ${tenant.name}`
      : `Set Companion HUD | ${tenant.name}`,
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
          tenant: true,
          shotItems: {
            orderBy: [{ sceneNumber: "asc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  });

  if (!callSheet) notFound();

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
    <div className="min-h-screen bg-[#070709] text-zinc-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <CallSheetShell
        callSheet={callSheet as unknown as CallSheetDetails}
        solarTimes={solarTimes}
        whatsappUrl={whatsappUrl}
        whatsappPreview={whatsappPreview}
      />
    </div>
  );
}
