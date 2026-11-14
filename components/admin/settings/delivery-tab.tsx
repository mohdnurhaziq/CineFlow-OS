"use client";

import { useState } from "react";
import { SaveBar, SettingsForm, SettingsSection, useSettingsSave, useUnsavedGuard, type StudioTenantData } from "./settings-ui";

const OPTIONS = [
  {
    value: false,
    title: "Watermarked until paid",
    body: "Clients view watermarked previews and pick favourites. Full-resolution downloads unlock when the balance is paid.",
  },
  {
    value: true,
    title: "Full resolution right away",
    body: "Clients view and download the full-resolution photos as soon as you upload them. The balance stays due.",
  },
];

/** Photo delivery tab: what clients get before the balance is paid. */
export function DeliveryTab({ tenant }: { tenant: StudioTenantData }) {
  const initial = tenant.releaseFilesBeforePayment ?? false;
  const [release, setRelease] = useState(initial);
  const dirty = release !== initial;
  useUnsavedGuard(dirty);
  const { save, saving } = useSettingsSave(tenant);

  return (
    <SettingsForm
      onSubmit={() => save({ releaseFilesBeforePayment: release })}
      footer={<SaveBar dirty={dirty} saving={saving} onDiscard={() => setRelease(initial)} />}
    >
      <SettingsSection
        title="Before the balance is paid"
        description="What clients get when you upload their final photos. Paying the balance always releases everything."
      >
        <fieldset className="grid gap-3 lg:grid-cols-2">
          <legend className="sr-only">Photo delivery before the balance is paid</legend>
          {OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                release === opt.value ? "border-amber-500 bg-amber-500/5" : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <input type="radio" name="release" checked={release === opt.value} onChange={() => setRelease(opt.value)} className="mt-1 accent-amber-500" />
              <span>
                <span className="block text-sm font-semibold text-white">{opt.title}</span>
                <span className="block text-sm text-zinc-400 mt-1 leading-relaxed">{opt.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsSection>
    </SettingsForm>
  );
}
