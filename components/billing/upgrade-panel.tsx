import { Lock } from "lucide-react";
import type { PlanFeature } from "@/lib/billing/plans";
import { featureLockedMessage } from "@/lib/billing/guard";

/** Where a locked feature would be: says which plan has it and who to ask. Server-rendered. */
export function UpgradePanel({ feature, contactEmail }: { feature: PlanFeature; contactEmail: string | null }) {
  return (
    <div role="note" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
      <span className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
        <Lock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-white">{featureLockedMessage(feature)}</p>
        <p className="text-xs text-zinc-400">
          What you already have here stays and can still be opened. New ones need the plan.
          {contactEmail ? (
            <>
              {" "}
              Email <a className="text-amber-400 underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
