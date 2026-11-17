"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveShippingZones } from "@/lib/actions/admin-shipping";
import { errorMessageOf } from "@/lib/action-error";
import { MY_STATES } from "@/lib/prints/states";
import { formatMoney } from "@/lib/money";
import { SaveBar, SettingsForm, SettingsSection, inputCls, labelCls, helpCls, useUnsavedGuard } from "@/components/admin/settings/settings-ui";

export interface ShippingZoneRow {
  name: string;
  fee: number;
  states: string[];
}

interface DraftZone {
  key: number;
  name: string;
  fee: string;
  states: string[];
}

interface ShippingZonesFormProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  zones: ShippingZoneRow[];
  /** Catalog MANAGE: may change the zones. Read-only without it. */
  canManage: boolean;
}

const TITLE = "Shipping zones";
const DESCRIPTION = "A flat shipping fee for wall art orders, by state. States not in any zone can only choose pickup.";

const toDraft = (zones: ShippingZoneRow[]): DraftZone[] =>
  zones.map((z, i) => ({ key: i, name: z.name, fee: String(z.fee), states: z.states }));

/** Wall art shipping, on Frames & Prints: a flat fee per group of states. States in no zone can only choose pickup. */
export function ShippingZonesForm({ canManage, ...props }: ShippingZonesFormProps) {
  return canManage ? <ZonesEditor {...props} /> : <ZonesList zones={props.zones} currency={props.currency} />;
}

/** Catalog VIEW: the zones as they are. */
function ZonesList({ zones, currency }: { zones: ShippingZoneRow[]; currency: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{TITLE}</h2>
        <p className="text-sm text-zinc-400 mt-1">{DESCRIPTION}</p>
      </div>
      {zones.length === 0 ? (
        <p className="text-sm text-zinc-400">No zones yet. Clients can only choose pickup.</p>
      ) : (
        <ul className="space-y-3">
          {zones.map((zone) => (
            <li key={zone.name} className="rounded-xl border border-zinc-800 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-white">{zone.name}</span>
                <span className="text-sm font-mono text-amber-400">{formatMoney(currency, zone.fee)}</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1.5">{zone.states.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Catalog MANAGE: add, change and remove zones, saved together. */
function ZonesEditor({ tenantId, tenantSlug, currency, zones }: Omit<ShippingZonesFormProps, "canManage">) {
  const router = useRouter();
  const snapshot = (d: DraftZone[]) => JSON.stringify(d.map(({ key: _k, ...z }) => z));
  const [saved, setSaved] = useState(() => snapshot(toDraft(zones)));
  const [draft, setDraft] = useState<DraftZone[]>(() => toDraft(zones));
  const [nextKey, setNextKey] = useState(zones.length);
  const [saving, setSaving] = useState(false);
  const dirty = snapshot(draft) !== saved;
  useUnsavedGuard(dirty);

  const patch = (key: number, change: Partial<DraftZone>) => setDraft((d) => d.map((z) => (z.key === key ? { ...z, ...change } : z)));
  const toggleState = (zone: DraftZone, state: string) =>
    patch(zone.key, { states: zone.states.includes(state) ? zone.states.filter((s) => s !== state) : [...zone.states, state] });

  async function submit() {
    setSaving(true);
    try {
      const res = await saveShippingZones({
        tenantId,
        tenantSlug,
        zones: draft.map((z) => ({ name: z.name, fee: Number(z.fee), states: z.states })),
      });
      if (!res.success) {
        toast.error(res.message || "Could not save. Please try again.");
        return;
      }
      setSaved(snapshot(draft));
      toast.success("Shipping zones saved.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessageOf(err) || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsForm
      onSubmit={submit}
      footer={<SaveBar dirty={dirty} saving={saving} onDiscard={() => setDraft(JSON.parse(saved).map((z: Omit<DraftZone, "key">, i: number) => ({ ...z, key: i })))} />}
    >
      <SettingsSection title={TITLE} description={DESCRIPTION}>
        {draft.length === 0 && <p className="text-sm text-zinc-400">No zones yet. Clients can only choose pickup.</p>}
        {draft.map((zone, idx) => (
          <div key={zone.key} className="rounded-xl border border-zinc-800 p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] items-end">
              <div>
                <label htmlFor={`zone-name-${zone.key}`} className={labelCls}>Zone name</label>
                <input id={`zone-name-${zone.key}`} value={zone.name} onChange={(e) => patch(zone.key, { name: e.target.value })} placeholder="e.g. Peninsular" className={inputCls} />
              </div>
              <div>
                <label htmlFor={`zone-fee-${zone.key}`} className={labelCls}>Fee ({currency})</label>
                <input id={`zone-fee-${zone.key}`} type="number" inputMode="decimal" min="0" step="0.01" value={zone.fee} onChange={(e) => patch(zone.key, { fee: e.target.value })} className={inputCls} />
              </div>
              <button type="button" onClick={() => setDraft((d) => d.filter((z) => z.key !== zone.key))} aria-label={`Remove zone ${idx + 1}`} className="p-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800">
                <Trash2 className="size-4" />
              </button>
            </div>
            <fieldset>
              <legend className={labelCls}>States</legend>
              <div className="flex flex-wrap gap-2">
                {MY_STATES.map((state) => {
                  const checked = zone.states.includes(state);
                  const elsewhere = !checked && draft.some((z) => z.key !== zone.key && z.states.includes(state));
                  return (
                    <label
                      key={state}
                      className={`px-3 py-1.5 rounded-full border text-sm select-none ${
                        checked ? "border-amber-500 bg-amber-500/10 text-white cursor-pointer" : elsewhere ? "border-zinc-800 text-zinc-600 cursor-not-allowed" : "border-zinc-700 text-zinc-300 hover:border-zinc-500 cursor-pointer"
                      }`}
                    >
                      <input type="checkbox" className="sr-only" checked={checked} disabled={elsewhere} onChange={() => toggleState(zone, state)} />
                      {state}
                    </label>
                  );
                })}
              </div>
              <p className={helpCls}>A greyed-out state is already in another zone.</p>
            </fieldset>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setDraft((d) => [...d, { key: nextKey, name: "", fee: "", states: [] }]);
            setNextKey((k) => k + 1);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-zinc-200 border border-zinc-700 hover:bg-zinc-800"
        >
          <Plus className="size-4" /> Add zone
        </button>
      </SettingsSection>
    </SettingsForm>
  );
}
