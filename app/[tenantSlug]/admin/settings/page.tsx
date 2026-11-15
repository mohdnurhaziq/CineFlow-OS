import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parseZoneStates } from "@/lib/prints/zones";
import { SettingsShell } from "@/components/admin/settings/settings-shell";
import { SETTINGS_TABS, type SettingsTabId } from "@/components/admin/settings/tabs";
import type { StudioTenantData } from "@/components/admin/settings/settings-ui";

interface SettingsPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({
  params,
}: SettingsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Settings Not Found" };

  return {
    title: `Settings | ${tenant.name} Studio Admin`,
    description: "Your studio, how clients pay you, and how their photos are delivered.",
  };
}

export default async function AdminSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { tenantSlug } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: SettingsTabId = SETTINGS_TABS.some((t) => t.id === tabParam) ? (tabParam as SettingsTabId) : "studio";
  // Shown before the studio address field, e.g. "localhost:3000/".
  const host = env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant) notFound();

  // Pass only what the form needs: never the encrypted gateway secret.
  const { toyyibpaySecretEnc, toyyibpayCategoryCode, ...safeTenant } = tenant;
  const data = {
    ...safeTenant,
    gatewayConfigured: Boolean(toyyibpaySecretEnc && toyyibpayCategoryCode),
    gatewayCategoryCode: toyyibpayCategoryCode,
  };

  const zoneRows = await db.shippingZone.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } });
  const zones = zoneRows.map((z) => ({ name: z.name, fee: z.fee, states: parseZoneStates(z.statesJson) }));

  return (
    <PageShell>
      {/* key: a tab starts from the saved values each time it opens */}
      <SettingsShell key={tab} tenant={data as unknown as StudioTenantData} tab={tab} host={host} zones={zones} />
    </PageShell>
  );
}
