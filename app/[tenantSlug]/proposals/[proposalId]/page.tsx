import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/project-access";
import { ProposalViewer } from "@/components/proposals/proposal-viewer";
import { PortalTopBar } from "@/components/portal/portal-top-bar";

interface ProposalPageProps {
  params: Promise<{
    tenantSlug: string;
    proposalId: string;
  }>;
}

export async function generateMetadata({ params }: ProposalPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });

  if (!tenant) return { title: "Proposal" };

  // Generic: the page needs a sign-in, so the tab title must not reveal the proposal.
  return {
    title: `Proposal | ${tenant.name}`,
    robots: { index: false, follow: false },
    description: "Review production scope, itemized add-ons, contract terms, and sign digitally.",
  };
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { tenantSlug, proposalId } = await params;

  // 1. Resolve Tenant
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      brandColor: true,
    },
  });

  if (!tenant) notFound();

  // 2. Resolve Proposal with Relations
  const proposal = await db.proposal.findFirst({
    where: {
      tenantId: tenant.id,
      OR: [{ id: proposalId }, { proposalNumber: proposalId }],
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      studio: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      addOns: {
        orderBy: { price: "desc" },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
      },
      project: {
        select: {
          id: true,
          projectNumber: true,
          title: true,
        },
      },
    },
  });

  if (!proposal) notFound();

  // The proposal's client or the studio's staff, signed in.
  await requirePageAccess({
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    clientId: proposal.client.id,
    returnTo: `/${tenant.slug}/proposals/${proposal.id}`,
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <PortalTopBar
        tenant={tenant}
        width="5xl"
        back={{ href: `/${tenant.slug}/account?tab=proposals`, label: "My proposals" }}
        staffBack={{ href: `/${tenant.slug}/admin/proposals`, label: "All proposals" }}
      />
      <ProposalViewer tenant={tenant} proposal={proposal} />
    </div>
  );
}
