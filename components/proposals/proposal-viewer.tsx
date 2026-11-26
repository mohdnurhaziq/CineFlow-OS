"use client";

import { useState, useTransition } from "react";
import { FileCheck, FileText, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AddonsSelector, type AddOnItem } from "./addons-selector";
import { PricingBreakdown } from "./pricing-breakdown";
import { SignaturePad } from "./signature-pad";
import { SignedAcceptanceView } from "./signed-acceptance-view";
import { acceptProposal, declineProposal } from "@/lib/actions/proposals";
import { disciplineLabel } from "@/lib/labels";
import { formatStudioDate } from "@/lib/slot-time";
import { formatMoney } from "@/lib/money";

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
    declinedAt?: Date | string | null;
    declineReason?: string | null;
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
  /** The signed-in viewer is the client it's addressed to (not studio staff): may sign or decline. */
  viewerIsClient?: boolean;
}

export function ProposalViewer({ tenant, proposal, viewerIsClient = false }: ProposalViewerProps) {

  // Initially selected add-ons
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(() => {
    return new Set(proposal.addOns.filter((a) => a.isSelected).map((a) => a.id));
  });

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(proposal.client.name || "");
  const [signerTitle, setSignerTitle] = useState("");
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

  // Declining: optional reason, then the proposal closes.
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declined, setDeclined] = useState<{ at: Date | string; reason: string | null } | null>(
    proposal.status === "DECLINED" ? { at: proposal.declinedAt ?? proposal.signedAt ?? new Date(), reason: proposal.declineReason ?? null } : null
  );
  const isDraft = proposal.status === "DRAFT";
  const isClosed = Boolean(declined) || isDraft;

  const handleDecline = () => {
    startTransition(async () => {
      const reason = declineReason.trim();
      const res = await declineProposal({ proposalId: proposal.id, tenantSlug: tenant.slug, reason: reason || undefined });
      if (res.success) {
        setDeclined({ at: new Date(), reason: reason || null });
        setDeclineOpen(false);
        toast.success("Proposal declined. The studio can see your answer.");
      } else {
        toast.error(res.message || "Could not decline the proposal.");
      }
    });
  };

  // Toggle Add-On
  const handleToggleAddOn = (id: string) => {
    if (isAlreadyAccepted || isClosed) return;
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
      toast.error("Please tick the box to accept the terms and payment plan.");
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
        toast.success("Proposal signed. Your deposit invoice is ready.");
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
            <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              PROPOSAL
            </span>
            <span className="text-xs font-mono text-zinc-400">#{proposal.proposalNumber}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{proposal.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-300 uppercase">
            {disciplineLabel(proposal.discipline)}
          </span>
          <span className="px-3 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-mono font-bold text-amber-400 uppercase">
            {proposal.category}
          </span>
        </div>
      </div>

      {/* 2. Executive Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[11px] font-mono uppercase text-zinc-400">Client Organization</div>
          <div className="font-semibold text-white">{proposal.client.name}</div>
          <div className="text-xs font-mono text-zinc-400 truncate">{proposal.client.email}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[11px] font-mono uppercase text-zinc-400">Studio Director</div>
          <div className="font-semibold text-white">{proposal.studio.name}</div>
          <div className="text-xs font-mono text-zinc-400 truncate">{tenant.name}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] space-y-1">
          <div className="text-[11px] font-mono uppercase text-zinc-400">Payments</div>
          <div className="font-semibold text-amber-400 font-mono">50% deposit / 50% on delivery</div>
          <div className="text-xs text-zinc-400">Final files unlock when paid in full</div>
        </div>
      </div>

      {/* 3. Base Scope & Production Narrative */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-3 shadow-md">
        <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
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
            Terms
          </span>
        </div>

        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed font-sans">
          <p>
            1. <strong>Deposit:</strong> A non-refundable 50% deposit is due when you sign this agreement. It secures the crew, the studio and your dates.
          </p>
          <p>
            2. <strong>Final files:</strong> Full-quality video files, full-resolution photo downloads (ZIP) and any RAW files stay locked in your online gallery until the final 50% balance has been paid in full and confirmed by the studio.
          </p>
          <p>
            3. <strong>Reviewing your work:</strong> Before the balance is paid, you get watermarked photo previews and preview videos to choose favourites and ask for changes.
          </p>

          {/* Dynamically Injected Addenda */}
          {hasDrone && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[11px] uppercase font-bold text-amber-400 block">
                Addendum A (FAA Airspace &amp; Drone Flight Clearance)
              </span>
              <p className="text-xs leading-relaxed">
                All drone operations are conducted under FAA Part 107 / CAAM guidelines. Flights are contingent on safe meteorological conditions (&lt;20 knot sustained winds, no active precipitation). Postponement due to weather warrants rescheduling without client forfeiture.
              </p>
            </div>
          )}

          {hasRawSsd && (
            <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 text-blue-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[11px] uppercase font-bold text-blue-400 block">
                Addendum B (Archival Negatives &amp; Data Custody)
              </span>
              <p className="text-xs leading-relaxed">
                Uncompressed RAW sensor media is archived to an encrypted NVMe solid-state drive with 12-month studio backup retention. Master camera originals are released following final milestone settlement.
              </p>
            </div>
          )}

          {hasSecondCam && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[11px] uppercase font-bold text-emerald-400 block">
                Addendum C (Second Unit Cinematographer Operations)
              </span>
              <p className="text-xs leading-relaxed">
                The secondary cinematographer operates under direct supervision of the Principal Director/DP, executing synchronized B-roll and continuous alternate camera angles throughout scheduled production hours.
              </p>
            </div>
          )}

          {hasRush && (
            <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-950/20 text-purple-200 space-y-1 animate-fadeIn">
              <span className="font-mono text-[11px] uppercase font-bold text-purple-400 block">
                Addendum D (Faster editing turnaround)
              </span>
              <p className="text-xs leading-relaxed">
                Turnaround clock commences at formal shoot wrap. Requires client round-1 revision feedback within 12 hours of rough cut dispatch to preserve expedited milestone delivery.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 7. Answer: declined, a draft (studio only), or sign / decline */}
      {declined ? (
        <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-red-300">
            <XCircle className="size-4 shrink-0" />
            {viewerIsClient ? "You declined this proposal" : "The client declined this proposal"}
          </div>
          <p className="text-xs text-zinc-400">
            {formatStudioDate(declined.at)}
          </p>
          {declined.reason && <p className="text-sm text-zinc-300 whitespace-pre-line">&ldquo;{declined.reason}&rdquo;</p>}
          {viewerIsClient && (
            <p className="text-xs text-zinc-400">Changed your mind? Contact {tenant.name} and they can send you a new proposal.</p>
          )}
        </div>
      ) : isDraft ? (
        <div className="p-6 rounded-2xl border border-zinc-700 bg-zinc-900/60 space-y-1">
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
            <FileText className="size-4 text-zinc-400" /> Draft
          </div>
          <p className="text-xs text-zinc-400">
            The client can&apos;t see this yet. Send it from Proposals when it&apos;s ready.
          </p>
        </div>
      ) : (
      <>
      <form onSubmit={handleSubmit} className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
              Sign to accept
            </span>
            <span className="text-[11px] font-mono text-zinc-400 block">
              Draw your signature below
            </span>
          </div>

          <span className="text-xs font-mono text-amber-400 font-bold tabular-nums">
            Deposit due: {formatMoney(tenant.currency, depositAmount)}
          </span>
        </div>

        {/* Signature Pad */}
        <SignaturePad onSignatureChange={setSignatureDataUrl} disabled={isPending} />

        {/* Signer Identity Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your full name *
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
              Your title or role (optional)
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
            I confirm I can accept this on behalf of the client. I have read and accept what&apos;s included, the extras I chose, the terms, and the {proposal.depositPercentage}% deposit payment plan.
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
                Signing...
              </>
            ) : (
              <>
                <FileCheck className="size-4" />
                Sign &amp; accept ({formatMoney(tenant.currency, depositAmount)} deposit)
              </>
            )}
          </button>
        </div>
      </form>

      {viewerIsClient && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-3">
          {!declineOpen ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">Not going ahead? You can decline this proposal instead.</p>
              <button
                type="button"
                onClick={() => setDeclineOpen(true)}
                disabled={isPending}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
              >
                Decline proposal
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor="decline-reason" className="block text-xs text-zinc-300">
                Reason (optional). The studio will see this.
              </label>
              <textarea
                id="decline-reason"
                rows={3}
                maxLength={500}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. We've changed our plans"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
              />
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeclineOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Keep it open
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 className="size-3.5 animate-spin" />} Decline proposal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
