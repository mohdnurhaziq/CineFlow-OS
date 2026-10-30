import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { ProposalAdminDashboard } from "@/components/admin/proposals/proposal-admin-dashboard";
import type { ProposalAddOnTemplateRow } from "@/components/admin/proposals/addon-template-dialog";
import type { ProposalRow } from "@/components/admin/proposals/proposals-list";

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
    title: `Proposals & Add-On Templates | ${tenant.name} Studio Admin`,
    description: "Manage proposal add-on options, pricing units, and monitor client quote status.",
  };
}

export default async function AdminProposalsPage({ params }: ProposalsPageProps) {
  const { tenantSlug } = await params;

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
    take: 50,
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <ProposalAdminDashboard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        currency={tenant.currency}
        initialTemplates={templates as unknown as ProposalAddOnTemplateRow[]}
        initialProposals={proposals as unknown as ProposalRow[]}
      />
    </div>
  );
}
