"use client";

import Link from "next/link";
import { ExternalLink, CheckCircle, Clock, FileText, XCircle } from "lucide-react";

export interface ProposalRow {
  id: string;
  proposalNumber: string;
  title: string;
  category: string;
  discipline: string;
  basePrice: number;
  totalPrice: number;
  depositAmount: number;
  finalBalanceAmount: number;
  status: string;
  signedAt?: Date | string | null;
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
  tenantSlug: string;
  currency: string;
}

export function ProposalsList({ proposals, tenantSlug, currency }: ProposalsListProps) {
  const formatPrice = (val: number) => {
    return `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
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
              const createdDate = new Date(p.createdAt).toISOString().split("T")[0];
              const selectedAddOnsCount = p.addOns?.filter((a) => a.isSelected).length || 0;

              return (
                <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                  {/* Proposal Number */}
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-amber-400">{p.proposalNumber}</span>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{createdDate}</div>
                  </td>

                  {/* Client Details */}
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{p.client?.name || "Client"}</div>
                    <div className="text-[11px] text-zinc-400">{p.client?.email || "—"}</div>
                  </td>

                  {/* Title & Addons */}
                  <td className="px-4 py-3">
                    <div className="text-zinc-200 font-medium">{p.title}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {selectedAddOnsCount > 0 ? `${selectedAddOnsCount} add-on(s) selected` : "Base package only"}
                    </div>
                  </td>

                  {/* Pricing */}
                  <td className="px-4 py-3 font-mono">
                    <div className="text-white font-bold">{formatPrice(p.totalPrice)}</div>
                    <div className="text-[10px] text-zinc-500">
                      50% Retainer: {formatPrice(p.depositAmount)}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {p.status === "ACCEPTED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="size-3" /> Signed & Accepted
                      </span>
                    )}
                    {p.status === "SENT" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="size-3" /> Awaiting Signature
                      </span>
                    )}
                    {p.status === "DRAFT" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                        <FileText className="size-3" /> Draft
                      </span>
                    )}
                    {p.status === "DECLINED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="size-3" /> Declined
                      </span>
                    )}
                  </td>

                  {/* Link to Proposal View */}
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/${tenantSlug}/proposals/${p.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-700 hover:border-zinc-600 transition-colors"
                    >
                      <span>View</span>
                      <ExternalLink className="size-3 text-amber-400" />
                    </Link>
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
