"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, CheckCircle, Clock, FileText, Loader2, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteDraftProposal, sendProposal } from "@/lib/actions/admin-projects";
import { formatStudioDate } from "@/lib/slot-time";
import { studioPath } from "@/lib/domain-name";
import { formatMoney } from "@/lib/money";

export interface ProposalRow {
  id: string;
  proposalNumber: string;
  title: string;
  category: string;
  discipline: string;
  basePrice: number;
  totalPrice: number;
  depositAmount: number;
  depositPercentage: number;
  finalBalanceAmount: number;
  status: string;
  signedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  declineReason?: string | null;
  createdAt: Date | string;
  client?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  addOns?: Array<{
    id: string;
    name: string;
    price: number;
    isSelected: boolean;
  }>;
}

interface ProposalsListProps {
  proposals: ProposalRow[];
  tenantId: string;
  tenantSlug: string;
  currency: string;
  /** May send and delete drafts (the setPrices permission, as for creating one). */
  canSend: boolean;
}

/** Send and Delete for a draft. Delete asks once more inline before it happens. */
function DraftActions({ tenantId, proposalId }: { tenantId: string; proposalId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const send = () =>
    start(async () => {
      const res = await sendProposal({ tenantId, proposalId });
      if (res.success) {
        toast.success("Proposal sent. The client has been emailed a link.");
        router.refresh();
      } else toast.error(res.message);
    });
  const remove = () =>
    start(async () => {
      const res = await deleteDraftProposal({ tenantId, proposalId });
      if (res.success) {
        toast.success("Draft deleted.");
        router.refresh();
      } else toast.error(res.message);
    });

  const btn = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors disabled:opacity-50";
  if (confirmDelete) {
    return (
      <>
        <button type="button" onClick={remove} disabled={pending} className={`${btn} text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20`}>
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete draft
        </button>
        <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className={`${btn} text-zinc-300 border-zinc-700 bg-zinc-900 hover:border-zinc-600`}>
          Cancel
        </button>
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={send} disabled={pending} className={`${btn} text-black font-bold border-amber-500 bg-amber-500 hover:bg-amber-400`}>
        {pending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Send
      </button>
      <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} aria-label="Delete draft" className={`${btn} text-zinc-400 border-zinc-700 bg-zinc-900 hover:text-red-300 hover:border-red-500/40`}>
        <Trash2 className="size-3" />
      </button>
    </>
  );
}

export function ProposalsList({ proposals, tenantId, tenantSlug, currency, canSend }: ProposalsListProps) {
  const formatPrice = (val: number) => {
    return formatMoney(currency, val);
  };

  if (proposals.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-zinc-800 bg-[#0d0d10]">
        <p className="text-sm text-zinc-400">No client proposals recorded yet.</p>
        <p className="text-xs text-zinc-400 mt-1">
          Proposals generated for prospective studio clients will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="text-[11px] font-mono uppercase bg-zinc-900/60 text-zinc-400 border-b border-zinc-800">
            <tr>
              <th scope="col" className="px-4 py-3">Proposal #</th>
              <th scope="col" className="px-4 py-3">Client</th>
              <th scope="col" className="px-4 py-3">Project Title</th>
              <th scope="col" className="px-4 py-3">Financials</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-sans text-xs">
            {proposals.map((p) => {
              const createdDate = formatStudioDate(p.createdAt);
              const selectedAddOnsCount = p.addOns?.filter((a) => a.isSelected).length || 0;

              return (
                <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                  {/* Proposal Number */}
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-amber-400">{p.proposalNumber}</span>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{createdDate}</div>
                  </td>

                  {/* Client Details */}
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{p.client?.name || "Client"}</div>
                    <div className="text-[11px] text-zinc-400">{p.client?.email || "—"}</div>
                  </td>

                  {/* Title & Addons */}
                  <td className="px-4 py-3">
                    <div className="text-zinc-200 font-medium">{p.title}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {selectedAddOnsCount > 0 ? `${selectedAddOnsCount} add-on(s) selected` : "Base package only"}
                    </div>
                  </td>

                  {/* Pricing */}
                  <td className="px-4 py-3 font-mono">
                    <div className="text-white font-bold">{formatPrice(p.totalPrice)}</div>
                    <div className="text-[11px] text-zinc-400">
                      {p.depositPercentage}% deposit: {formatPrice(p.depositAmount)}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {p.status === "ACCEPTED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="size-3" /> Signed & Accepted
                      </span>
                    )}
                    {(p.status === "SENT" || p.status === "VIEWED") && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="size-3" /> Awaiting Signature
                      </span>
                    )}
                    {p.status === "DRAFT" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                        <FileText className="size-3" /> Draft
                      </span>
                    )}
                    {p.status === "DECLINED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="size-3" /> Declined
                      </span>
                    )}
                    {p.status === "DECLINED" && (p.declinedAt || p.declineReason) && (
                      <div className="mt-1 text-[11px] text-zinc-400 max-w-[14rem] mx-auto">
                        {p.declinedAt &&
                          formatStudioDate(p.declinedAt)}
                        {p.declineReason && <span className="block italic text-zinc-300 break-words">&ldquo;{p.declineReason}&rdquo;</span>}
                      </div>
                    )}
                  </td>

                  {/* Link to Proposal View */}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                    {p.status === "DRAFT" && canSend && <DraftActions tenantId={tenantId} proposalId={p.id} />}
                    <Link
                      href={studioPath(tenantSlug, `/proposals/${p.id}`)}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-700 hover:border-zinc-600 transition-colors"
                    >
                      <span>{p.status === "DRAFT" ? "Preview" : "View"}</span>
                      <ExternalLink className="size-3 text-amber-400" />
                    </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
