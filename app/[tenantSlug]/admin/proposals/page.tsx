import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { NewProposalButton } from "@/components/admin/proposals/new-proposal-dialog";
import { ProposalAdminDashboard } from "@/components/admin/proposals/proposal-admin-dashboard";
import type { ProposalAddOnTemplateRow } from "@/components/admin/proposals/addon-template-dialog";
import type { ProposalRow } from "@/components/admin/proposals/proposals-list";
import { PlanPanel } from "@/components/billing/plan-panel";

interface ProposalsPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: ProposalsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { title: "Proposals Not Found" };

  return {
    title: `Proposals | ${tenant.name} Studio Admin`,
    description: "Manage proposal add-on options, pricing units, and monitor client quote status.",
  };
}

// Proposals VIEW.
export default async function AdminProposalsPage({ params }: ProposalsPageProps) {
  const { tenantSlug } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.proposals, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
    },
  });

  if (!tenant) notFound();

  // 2. Fetch scoped add-on templates
  const templates = await db.proposalAddOnTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isDefault: "desc" }, { price: "desc" }],
  });

  // 3. Fetch scoped proposals overview
  const proposals = await db.proposal.findMany({
    where: { tenantId: tenant.id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      addOns: true,
      invoices: true,
      project: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Creating a proposal sets prices: the setPrices permission.
  const canSetPrices = viewer.access.ticks.setPrices;
  const [clients, categories] = canSetPrices
    ? await Promise.all([
        db.user.findMany({ where: { tenantId: tenant.id, role: "CLIENT" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 1000 }),
        db.campaignCategory.findMany({ where: { tenantId: tenant.id, isActive: true }, select: { slug: true, name: true }, orderBy: { sortOrder: "asc" } }),
      ])
    : [[], []];

  return (
    <PageShell>
      <PlanPanel tenantId={tenant.id} feature="proposals" role={viewer.user.role} />
      <ProposalAdminDashboard
        newProposal={
          canSetPrices ? (
            <NewProposalButton
              tenantId={tenant.id}
              tenantSlug={tenant.slug}
              currency={tenant.currency}
              clients={clients}
              categories={categories}
              templates={templates}
            />
          ) : null
        }
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialTemplates={templates as unknown as ProposalAddOnTemplateRow[]}
        initialProposals={proposals as unknown as ProposalRow[]}
        canManage={levelAtLeast(viewer.access.areas.proposals, "MANAGE")}
        canSend={canSetPrices}
      />
    </PageShell>
  );
}
