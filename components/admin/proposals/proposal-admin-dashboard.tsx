"use client";

import { tabClass, tabListClass } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Sparkles,
  Search,
  CheckCircle,
  DollarSign,
  Layers,
} from "lucide-react";
import { AddOnTemplateTable } from "./addon-template-table";
import { ProposalsList, type ProposalRow } from "./proposals-list";
import {
  AddOnTemplateDialog,
  type ProposalAddOnTemplateRow,
} from "./addon-template-dialog";

interface ProposalAdminDashboardProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialTemplates: ProposalAddOnTemplateRow[];
  initialProposals: ProposalRow[];
  /** "New proposal" button, for those with the setPrices permission. */
  newProposal?: React.ReactNode;
  /** Proposals MANAGE: may add, edit, switch and delete add-on templates. Read-only without it. */
  canManage: boolean;
  /** The setPrices permission: may send and delete draft proposals. */
  canSend: boolean;
}

export function ProposalAdminDashboard({
  tenantId,
  tenantSlug,
  currency,
  initialTemplates,
  initialProposals,
  newProposal,
  canManage,
  canSend,
}: ProposalAdminDashboardProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"templates" | "pipeline">("templates");
  const [searchQuery, setSearchQuery] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<ProposalAddOnTemplateRow | null>(null);

  const handleSuccess = () => {
    router.refresh();
  };

  // Filter templates
  const filteredTemplates = initialTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter proposals
  const filteredProposals = initialProposals.filter((p) => {
    const query = searchQuery.toLowerCase();
    return (
      p.proposalNumber.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query) ||
      (p.client && p.client.name.toLowerCase().includes(query)) ||
      (p.client && p.client.email.toLowerCase().includes(query))
    );
  });

  // KPI Calculations
  const totalTemplates = initialTemplates.length;
  const activeTemplates = initialTemplates.filter((t) => t.isActive).length;
  const defaultTemplates = initialTemplates.filter((t) => t.isDefault).length;
  const totalProposals = initialProposals.length;
  const pipelineValue = initialProposals
    .filter((p) => p.status === "SENT" || p.status === "ACCEPTED")
    .reduce((sum, p) => sum + p.totalPrice, 0);

  const formatPrice = (val: number) => {
    return `${currency === "MYR" ? "RM" : "$"}${val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Proposals"
        description="Quotes for clients, and the optional extras they can add to them."
        actions={
          <>
          {newProposal}
          {canManage && activeTab === "templates" && (
            <button
              type="button"
              onClick={() => {
                setTemplateToEdit(null);
                setIsDialogOpen(true);
              }}
              className={buttonVariants()}
            >
              <Plus className="size-4" />
              <span>New Add-On Template</span>
            </button>
          )}
          </>
        }
      />

      {/* KPI Metrics Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Add-On Templates
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalTemplates}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Catalog options</span>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle className="size-3" /> Active in Quotes
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
            {activeTemplates}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Visible to clients</span>
        </div>

        <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
            <Sparkles className="size-3" /> Pre-Selected Defaults
          </span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
            {defaultTemplates}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Auto-added to proposals</span>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0d0d10]">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
            Total Proposals
          </span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">
            {totalProposals}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Generated quotes</span>
        </div>

        <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
            <DollarSign className="size-3" /> Pipeline Value
          </span>
          <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block truncate">
            {formatPrice(pipelineValue)}
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5 block">Active quote value</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={tabListClass}>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={tabClass(activeTab === "templates")}
        >
          <Layers className="size-4" />
          <span>Add-On Catalog ({initialTemplates.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pipeline")}
          className={tabClass(activeTab === "pipeline")}
        >
          <FileText className="size-4" />
          <span>Client Proposals Pipeline ({initialProposals.length})</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === "templates"
              ? "Search add-ons by name or description..."
              : "Search proposals by number, title, client..."
          }
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Tab 1: Add-On Templates Catalog */}
      {activeTab === "templates" && (
        <AddOnTemplateTable
          templates={filteredTemplates}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          currency={currency}
          onEdit={(t) => {
            setTemplateToEdit(t);
            setIsDialogOpen(true);
          }}
          onSuccess={handleSuccess}
          canManage={canManage}
        />
      )}

      {/* Tab 2: Proposals Pipeline */}
      {activeTab === "pipeline" && (
        <ProposalsList
          proposals={filteredProposals}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          currency={currency}
          canSend={canSend}
        />
      )}

      {/* Create/Edit Dialog */}
      {canManage && (
      <AddOnTemplateDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        currency={currency}
        templateToEdit={templateToEdit}
        onSuccess={handleSuccess}
      />
      )}
    </div>
  );
}
