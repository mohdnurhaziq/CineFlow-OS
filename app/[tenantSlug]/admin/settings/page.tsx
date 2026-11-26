import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { SettingsShell } from "@/components/admin/settings/settings-shell";
import { SETTINGS_TABS, type SettingsTabId } from "@/components/admin/settings/tabs";
import type { StudioTenantData } from "@/components/admin/settings/settings-ui";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { ensureStudioRoles, parseAccess } from "@/lib/auth/access";
import { NoAccess } from "@/components/admin/no-access";
import { loadTeamMembers, type TeamMemberRow } from "@/lib/team/members";
import { hasFeature } from "@/lib/billing/guard";
import { studioAdminName } from "@/lib/labels";

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
    title: `Settings | ${studioAdminName(tenant.name)}`,
    description: "Your studio, how clients pay you, and how their photos are delivered.",
  };
}

// The studio owner only: never grantable to the team.
export default async function AdminSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer?.isOwner) return <NoAccess tenantSlug={tenantSlug} />;
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
    hasWallArt: await hasFeature(tenant.id, "wallArt"),
  };

  let roles: { id: string; name: string; access: ReturnType<typeof parseAccess>; members: number }[] = [];
  let members: TeamMemberRow[] = [];
  if (tab === "team") {
    await ensureStudioRoles(tenant.id);
    const rows = await db.teamRole.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { members: true } } },
    });
    roles = rows.map((r) => ({ id: r.id, name: r.name, access: parseAccess(r.access), members: r._count.members }));
    members = await loadTeamMembers(tenant.id);
  }

  return (
    <PageShell>
      {/* key: a tab starts from the saved values each time it opens */}
      <SettingsShell key={tab} tenant={data as unknown as StudioTenantData} tab={tab} host={host} roles={roles} members={members} />
    </PageShell>
  );
}
