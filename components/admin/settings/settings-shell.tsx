"use client";

import { tabClass, tabListClass } from "@/components/ui/tabs";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DirtyContext, type StudioTenantData } from "./settings-ui";
import { StudioTab } from "./studio-tab";
import { PaymentsTab } from "./payments-tab";
import { DeliveryTab, type ShippingZoneRow } from "./delivery-tab";
import { TeamTab } from "./team-tab";
import type { TeamRoleRow } from "./team-role-dialog";
import { PlanTab } from "./plan-tab";
import { SETTINGS_TABS, type SettingsTabId } from "./tabs";


/**
 * Settings, one area per tab. Each tab has its own Save; switching away from unsaved edits asks first.
 */
export function SettingsShell({ tenant, tab, host, zones, roles }: { tenant: StudioTenantData; tab: SettingsTabId; host: string; zones: ShippingZoneRow[]; roles: TeamRoleRow[] }) {
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
      <div className="space-y-6">
        <PageHeader icon={Settings} title="Settings" description="Your studio, how clients pay you, and how their photos are delivered." className="[&>div]:border-b-0 [&>div]:pb-0" />

        {/* The grey base line is an inset shadow, so the active tab's underline covers it without
            spilling outside the bar (which made the browser show a scrollbar). The bar still scrolls
            sideways on a very narrow phone, with the scrollbar hidden. */}
        <nav
          aria-label="Settings sections"
          className={cn(tabListClass, "-mx-4 px-4 sm:mx-0 sm:px-0")}
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
              className={tabClass(t.id === tab)}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <h2 className="sr-only">{current.label}</h2>
        <div className="max-w-4xl space-y-6">
        {tab === "studio" && <StudioTab tenant={tenant} host={host} />}
        {tab === "payments" && <PaymentsTab tenant={tenant} />}
        {tab === "delivery" && <DeliveryTab tenant={tenant} zones={zones} />}
        {tab === "team" && <TeamTab tenant={{ id: tenant.id, slug: tenant.slug }} roles={roles} />}
        {tab === "plan" && <PlanTab tenant={tenant} />}
        </div>
      </div>
      {confirmDialog}
    </DirtyContext.Provider>
  );
}
