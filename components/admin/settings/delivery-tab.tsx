"use client";

import { useState } from "react";
import Link from "next/link";
import { SaveBar, SettingsForm, SettingsSection, useSettingsSave, useUnsavedGuard, type StudioTenantData } from "./settings-ui";
import { studioPath } from "@/lib/domain-name";

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
    <div className="space-y-6">
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
    {tenant.hasWallArt && <FramedPrintsSwitch tenant={tenant} />}
    <p className="text-sm text-zinc-400">
      Shipping fees for wall art are set in{" "}
      <Link href={studioPath(tenant.slug, "/admin/frames?tab=shipping")} className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
        Frames &amp; Prints → Shipping zones
      </Link>
      .
    </p>
    </div>
  );
}

const PRINT_OPTIONS = [
  {
    value: true,
    title: "Yes, we sell framed prints",
    body: "Clients see Wall Art on your website, can order framed prints from their gallery, and packages can include prints.",
  },
  {
    value: false,
    title: "No, we don't offer prints",
    body: "Wall Art, print ordering and included prints disappear for clients. Nothing is deleted: switch it back on any time. Print orders already placed stay in Print orders for you to finish.",
  },
];

/** Whether the studio sells framed prints. Only for a plan with wall art; saved on its own. */
function FramedPrintsSwitch({ tenant }: { tenant: StudioTenantData }) {
  const initial = tenant.offersPrints ?? true;
  const [offers, setOffers] = useState(initial);
  const dirty = offers !== initial;
  useUnsavedGuard(dirty);
  const { save, saving } = useSettingsSave(tenant);

  return (
    <SettingsForm onSubmit={() => save({ offersPrints: offers })} footer={<SaveBar dirty={dirty} saving={saving} onDiscard={() => setOffers(initial)} />}>
      <SettingsSection title="Framed prints" description="Do you sell framed prints and wall art to your clients?">
        <fieldset className="grid gap-3 lg:grid-cols-2">
          <legend className="sr-only">Whether the studio sells framed prints</legend>
          {PRINT_OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                offers === opt.value ? "border-amber-500 bg-amber-500/5" : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <input type="radio" name="offers-prints" checked={offers === opt.value} onChange={() => setOffers(opt.value)} className="mt-1 accent-amber-500" />
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
