import { notFound } from "next/navigation";
import { Metadata } from "next";
import { db } from "@/lib/db";
import { ProposalViewer } from "@/components/proposals/proposal-viewer";

interface ProposalPageProps {
  params: Promise<{
    tenantSlug: string;
    proposalId: string;
  }>;
}

export async function generateMetadata({ params }: ProposalPageProps): Promise<Metadata> {
  const { tenantSlug, proposalId } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });

  if (!tenant) return { title: "Proposal | CineFlow OS" };

  const proposal = await db.proposal.findFirst({
    where: {
      tenantId: tenant.id,
      OR: [{ id: proposalId }, { proposalNumber: proposalId }],
    },
    select: { title: true, proposalNumber: true },
  });

  if (!proposal) return { title: "Proposal Not Found | CineFlow OS" };

  return {
    title: `${proposal.title} (#${proposal.proposalNumber}) | ${tenant.name}`,
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

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <ProposalViewer tenant={tenant} proposal={proposal} />
    </div>
  );
}
