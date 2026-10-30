"use client";

import { useState, useTransition } from "react";
import {
  Film,
  Calendar,
  User,
  Shield,
  FileCheck,
  CheckCircle2,
  Lock,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { AddonsSelector, type AddOnItem } from "./addons-selector";
import { PricingBreakdown } from "./pricing-breakdown";
import { SignaturePad } from "./signature-pad";
import { SignedAcceptanceView } from "./signed-acceptance-view";
import { acceptProposal } from "@/lib/actions/proposals";

interface ProposalViewerProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    brandColor?: string | null;
  };
  proposal: {
    id: string;
    proposalNumber: string;
    title: string;
    category: string;
    discipline: string;
    basePrice: number;
    totalPrice: number;
    depositPercentage: number;
    depositAmount: number;
    finalBalanceAmount: number;
    status: string;
    contractTerms: string;
    clientSignature?: string | null;
    signedAt?: Date | string | null;
    client: {
      name: string;
      email: string;
    };
    studio: {
      name: string;
      email: string;
    };
    addOns: AddOnItem[];
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      milestoneType: string;
      status: string;
      amount: number;
    }>;
    project?: {
      id: string;
      projectNumber: string;
      title: string;
    } | null;
  };
}

export function ProposalViewer({ tenant, proposal }: ProposalViewerProps) {
  const currencySymbol = tenant.currency === "MYR" ? "RM " : "$";

  // Initially selected add-ons
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(() => {
    return new Set(proposal.addOns.filter((a) => a.isSelected).map((a) => a.id));
  });

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(proposal.client.name || "");
  const [signerTitle, setSignerTitle] = useState("Authorized Client Lead");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [acceptedData, setAcceptedData] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    depositAmount: number;
    projectId?: string;
    projectNumber?: string;
  } | null>(null);

  const isAlreadyAccepted = proposal.status === "ACCEPTED" || Boolean(acceptedData);

  // Toggle Add-On
  const handleToggleAddOn = (id: string) => {
    if (isAlreadyAccepted) return;
    setSelectedAddOnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Compute live financial totals
  let addOnsTotal = 0;
  for (const addon of proposal.addOns) {
    if (selectedAddOnIds.has(addon.id)) {
      addOnsTotal += addon.price * (addon.quantity || 1);
    }
  }

  const subtotal = Math.round((proposal.basePrice + addOnsTotal) * 100) / 100;
  const depositAmount = Math.round(((subtotal * proposal.depositPercentage) / 100) * 100) / 100;

  // Dynamic Legal Clauses Engine
  const selectedAddonNames = proposal.addOns
    .filter((a) => selectedAddOnIds.has(a.id))
    .map((a) => a.name.toLowerCase());

  const hasDrone = selectedAddonNames.some((n) => n.includes("drone") || n.includes("aerial"));
  const hasRawSsd = selectedAddonNames.some(
    (n) => n.includes("raw") || n.includes("ssd") || n.includes("drive")
  );
  const hasSecondCam = selectedAddonNames.some(
    (n) => n.includes("second") || n.includes("2nd") || n.includes("operator")
  );
  const hasRush = selectedAddonNames.some(
    (n) => n.includes("rush") || n.includes("expedited") || n.includes("48-hour")
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!signatureDataUrl) {
      toast.error("Please provide your digital signature on the signature pad.");
      return;
    }
    if (!signerName.trim() || signerName.trim().length < 2) {
      toast.error("Please enter your printed legal name.");
      return;
    }
    if (!consentAccepted) {
      toast.error("You must accept the production terms and 50% milestone schedule.");
      return;
    }

    startTransition(async () => {
      const res = await acceptProposal({
        proposalId: proposal.id,
        tenantSlug: tenant.slug,
        signatureDataUrl,
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || undefined,
        selectedAddOnIds: Array.from(selectedAddOnIds),
        consentAccepted: true,
      });

      if (res.success && res.invoiceId && res.invoiceNumber && res.amount !== undefined) {
        setAcceptedData({
          invoiceId: res.invoiceId,
          invoiceNumber: res.invoiceNumber,
          depositAmount: res.amount,
          projectId: res.projectId,
        });
        toast.success("Proposal formally accepted! Retainer milestone generated.");
      } else {
        toast.error(res.message || "Failed to accept proposal.");
      }
    });
  };

  // If already accepted or just signed, show the executed view
  if (isAlreadyAccepted) {
    const retainerInvoice = proposal.invoices.find((i) => i.milestoneType === "RETAINER_50");
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <SignedAcceptanceView
          tenantSlug={tenant.slug}
          proposalNumber={proposal.proposalNumber}
          title={proposal.title}
          signerName={signerName || proposal.client.name}
          signedAt={proposal.signedAt || new Date()}
          clientSignature={proposal.clientSignature || signatureDataUrl}
          depositAmount={acceptedData?.depositAmount ?? proposal.depositAmount}
          totalPrice={proposal.totalPrice}
          currency={tenant.currency}
          invoiceId={acceptedData?.invoiceId ?? retainerInvoice?.id}
          invoiceNumber={acceptedData?.invoiceNumber ?? retainerInvoice?.invoiceNumber}
          projectId={acceptedData?.projectId ?? proposal.project?.id}
          projectNumber={proposal.project?.projectNumber}
          isInitialSigning={Boolean(acceptedData)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* 1. Header & Studio Brand Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              OFFICIAL PRODUCTION PROPOSAL
            </span>
            <span className="text-xs font-mono text-zinc-500">#{proposal.proposalNumber}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{proposal.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-300 uppercase">
            {proposal.discipline}
          </span>
          <span className="px-3 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-mono font-bold text-amber-400 uppercase">
            {proposal.category}
          </span>
        </div>
      </div>

      {/* 2. Executive Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Client Organization</div>
          <div className="font-semibold text-white">{proposal.client.name}</div>
          <div className="text-xs font-mono text-zinc-400 truncate">{proposal.client.email}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Studio Director</div>
          <div className="font-semibold text-white">{proposal.studio.name}</div>
          <div className="text-xs font-mono text-zinc-400 truncate">{tenant.name}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Milestone Structure</div>
          <div className="font-semibold text-amber-400 font-mono">50% Retainer / 50% Vault</div>
          <div className="text-xs text-zinc-400">Gated master asset delivery</div>
        </div>
      </div>

      {/* 3. Base Scope & Production Narrative */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-3 shadow-md">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
          CORE PRODUCTION SCOPE
        </span>
        <h3 className="text-base font-bold text-white">Baseline Deliverables &amp; Crew Allocation</h3>
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
          {proposal.contractTerms}
        </p>
      </div>

      {/* 4. Interactive Add-On Selector */}
      {proposal.addOns.length > 0 && (
        <AddonsSelector
          addOns={proposal.addOns}
          selectedIds={selectedAddOnIds}
          onToggle={handleToggleAddOn}
          currency={tenant.currency}
        />
      )}

      {/* 5. Live Pricing Breakdown */}
      <PricingBreakdown
        basePrice={proposal.basePrice}
        addOnsTotal={addOnsTotal}
        currency={tenant.currency}
        depositPercentage={proposal.depositPercentage}
      />

      {/* 6. Dynamic Contract Terms & Injected Addenda */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
            Standard Contract Terms &amp; Scope Addenda
          </span>
          <span className="text-[10px] font-mono text-zinc-500">Legally Enforceable Digital Accord</span>
        </div>

        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed font-sans">
          <p>
            1. <strong>Production Retainer:</strong> A non-refundable 50% milestone deposit is required upon execution of this agreement to secure production crew, studio availability, and dates.
          </p>
          <p>
            2. <strong>Master Deliverables Paywall:</strong> Master 4K ProRes files, uncompressed high-resolution photo archives (ZIP), and RAW negative drives remain locked within the CineFlow vault until the final 50% balance milestone has been verified and settled in full.
          </p>
          <p>
            3. <strong>Client Proofing:</strong> Watermarked digital proofs and streaming review proxies are provided for revision feedback and retouch selections prior to final settlement.
          </p>

          {/* Dynamically Injected Addenda */}
          {hasDrone && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[10px] uppercase font-bold text-amber-400 block">
                Addendum A (FAA Airspace &amp; Drone Flight Clearance)
              </span>
              <p className="text-xs leading-relaxed">
                All drone operations are conducted under FAA Part 107 / CAAM guidelines. Flights are contingent on safe meteorological conditions (&lt;20 knot sustained winds, no active precipitation). Postponement due to weather warrants rescheduling without client forfeiture.
              </p>
            </div>
          )}

          {hasRawSsd && (
            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 text-blue-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[10px] uppercase font-bold text-blue-400 block">
                Addendum B (Archival Negatives &amp; Data Custody)
              </span>
              <p className="text-xs leading-relaxed">
                Uncompressed RAW sensor media is archived to an encrypted NVMe solid-state drive with 12-month studio backup retention. Master camera originals are released following final milestone settlement.
              </p>
            </div>
          )}

          {hasSecondCam && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 block">
                Addendum C (Second Unit Cinematographer Operations)
              </span>
              <p className="text-xs leading-relaxed">
                The secondary cinematographer operates under direct supervision of the Principal Director/DP, executing synchronized B-roll and continuous alternate camera angles throughout scheduled production hours.
              </p>
            </div>
          )}

          {hasRush && (
            <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-950/20 text-purple-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[10px] uppercase font-bold text-purple-400 block">
                Addendum D (Expedited Post-Production Timeline)
              </span>
              <p className="text-xs leading-relaxed">
                Turnaround clock commences at formal shoot wrap. Requires client round-1 revision feedback within 12 hours of rough cut dispatch to preserve expedited milestone delivery.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 7. Acceptance & Digital Signature Console */}
      <form onSubmit={handleSubmit} className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
              Legal Acceptance &amp; Digital Signature
            </span>
            <span className="text-[10px] font-mono text-zinc-500 block">
              Draw signature below to execute contract
            </span>
          </div>

          <span className="text-xs font-mono text-amber-400 font-bold tabular-nums">
            Retainer Due: {currencySymbol}
            {depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Signature Pad */}
        <SignaturePad onSignatureChange={setSignatureDataUrl} disabled={isPending} />

        {/* Signer Identity Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Signer Legal Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Julian Sterling"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Signer Title / Role (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Managing Director / Client"
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Consent Checkbox */}
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-start gap-3">
          <input
            type="checkbox"
            id="proposal-consent"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-0.5 size-4 rounded border-zinc-700 text-amber-500 focus:ring-amber-400 bg-zinc-800 cursor-pointer"
            required
          />
          <label htmlFor="proposal-consent" className="text-xs text-zinc-300 leading-snug cursor-pointer">
            I confirm that I am authorized to bind the client organization. I have reviewed and accepted the production scope, itemized add-ons, contract addenda, and the 50% retainer milestone payment schedule.
          </label>
        </div>

        {/* Submit Action CTA */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending || !signatureDataUrl || !consentAccepted}
            className="w-full py-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Executing Contract...
              </>
            ) : (
              <>
                <FileCheck className="size-4" />
                Sign &amp; Accept Proposal ({currencySymbol}
                {depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} Retainer)
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
