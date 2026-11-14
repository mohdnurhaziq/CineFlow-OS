"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SettingsSection, type StudioTenantData } from "./settings-ui";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

/** Plan tab: read only. */
export function PlanTab({ tenant }: { tenant: StudioTenantData }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(tenant.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const active = tenant.subscriptionStatus === "ACTIVE" || tenant.subscriptionStatus === "TRIALING";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0e] px-4 sm:px-6">
      <SettingsSection title="Your plan" description="Your CineFlow subscription.">
        <dl className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-400">Plan</dt>
            <dd className="text-sm font-semibold text-white">{titleCase(tenant.subscriptionTier)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-400">Status</dt>
            <dd className={`text-sm font-semibold ${active ? "text-emerald-400" : "text-amber-300"}`}>{titleCase(tenant.subscriptionStatus)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-zinc-400">Studio ID</dt>
            <dd className="flex items-center gap-2 min-w-0">
              <code className="text-sm text-zinc-300 truncate">{tenant.id}</code>
              <button type="button" onClick={copy} aria-label="Copy studio ID" className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800">
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              </button>
            </dd>
          </div>
        </dl>
        <p className="text-sm text-zinc-400">Support may ask for your studio ID.</p>
      </SettingsSection>
    </div>
  );
}
