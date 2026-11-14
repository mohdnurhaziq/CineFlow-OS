"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DirtyContext, type StudioTenantData } from "./settings-ui";
import { StudioTab } from "./studio-tab";
import { PaymentsTab } from "./payments-tab";
import { DeliveryTab } from "./delivery-tab";
import { PlanTab } from "./plan-tab";
import { SETTINGS_TABS, type SettingsTabId } from "./tabs";


/**
 * Settings, one area per tab. Each tab has its own Save; switching away from unsaved edits asks first.
 */
export function SettingsShell({ tenant, tab, host }: { tenant: StudioTenantData; tab: SettingsTabId; host: string }) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const dirtyForms = useRef(new Set<string>());
  const [, rerender] = useState(0);

  const report = useCallback((key: string, dirty: boolean) => {
    const had = dirtyForms.current.has(key);
    if (dirty === had) return;
    if (dirty) dirtyForms.current.add(key);
    else dirtyForms.current.delete(key);
    rerender((n) => n + 1);
  }, []);

  const go = async (next: SettingsTabId) => {
    if (next === tab) return;
    if (
      dirtyForms.current.size > 0 &&
      !(await confirm({ title: "Leave without saving?", message: "Your changes on this tab will be lost.", confirmLabel: "Leave" }))
    ) {
      return;
    }
    dirtyForms.current.clear();
    router.push(next === "studio" ? `/${tenant.slug}/admin/settings` : `/${tenant.slug}/admin/settings?tab=${next}`);
  };

  const current = SETTINGS_TABS.find((t) => t.id === tab)!;

  return (
    <DirtyContext.Provider value={report}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">Your studio, how clients pay you, and how their photos are delivered.</p>
        </div>

        {/* The grey base line is an inset shadow, so the active tab's underline covers it without
            spilling outside the bar (which made the browser show a scrollbar). The bar still scrolls
            sideways on a very narrow phone, with the scrollbar hidden. */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shadow-[inset_0_-1px_0_#27272a] -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {SETTINGS_TABS.map((t) => (
            <a
              key={t.id}
              href={t.id === "studio" ? `/${tenant.slug}/admin/settings` : `/${tenant.slug}/admin/settings?tab=${t.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                void go(t.id);
              }}
              aria-current={t.id === tab ? "page" : undefined}
              className={`shrink-0 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                t.id === tab ? "border-amber-500 text-white" : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <h2 className="sr-only">{current.label}</h2>
        {tab === "studio" && <StudioTab tenant={tenant} host={host} />}
        {tab === "payments" && <PaymentsTab tenant={tenant} />}
        {tab === "delivery" && <DeliveryTab tenant={tenant} />}
        {tab === "plan" && <PlanTab tenant={tenant} />}
      </div>
      {confirmDialog}
    </DirtyContext.Provider>
  );
}
