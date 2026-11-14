"use client";

import { useState } from "react";
import { disciplineLabel } from "@/lib/labels";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ImageUploadField,
  SaveBar,
  SettingsForm,
  SettingsSection,
  helpCls,
  inputCls,
  labelCls,
  useSettingsSave,
  useUnsavedGuard,
  type StudioTenantData,
} from "./settings-ui";

type Discipline = "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID";
const DISCIPLINES: Discipline[] = ["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"];

const ACCENT_PRESETS = [
  { label: "Amber", hex: "#f59e0b" },
  { label: "Red", hex: "#ef4444" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Cyan", hex: "#06b6d4" },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Rose", hex: "#f43f5e" },
];

/** Studio tab: name, web address, look and about text. */
export function StudioTab({ tenant, host }: { tenant: StudioTenantData; host: string }) {
  const initial = {
    name: tenant.name,
    slug: tenant.slug,
    discipline: ((tenant.discipline as Discipline) || "HYBRID") as Discipline,
    customDomain: tenant.customDomain ?? "",
    brandColor: tenant.brandColor || "#f59e0b",
    logoUrl: tenant.logoUrl ?? "",
    tagline: tenant.tagline ?? "",
    bio: tenant.bio ?? "",
  };
  const [v, setV] = useState(initial);
  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => v[k] !== initial[k]);
  useUnsavedGuard(dirty);
  const { save, saving } = useSettingsSave(tenant);
  const { confirm, confirmDialog } = useConfirm();
  const slugChanged = v.slug !== tenant.slug;

  const submit = async () => {
    if (
      slugChanged &&
      !(await confirm({
        title: "Change your studio address?",
        message: `Links you've already sent clients (bookings, galleries, invoices) use ${host}/${tenant.slug} and will stop working. New links will use ${host}/${v.slug}.`,
        confirmLabel: "Change address",
      }))
    ) {
      return;
    }
    await save({
      name: v.name,
      newSlug: v.slug,
      discipline: v.discipline,
      customDomain: v.customDomain,
      brandColor: v.brandColor,
      logoUrl: v.logoUrl,
      tagline: v.tagline,
      bio: v.bio,
    });
  };

  return (
    <>
      <SettingsForm onSubmit={submit} footer={<SaveBar dirty={dirty} saving={saving} onDiscard={() => setV(initial)} />}>
        <SettingsSection title="Studio" description="How your studio is named and what it does.">
          <div>
            <label htmlFor="studio-name" className={labelCls}>
              Studio name
            </label>
            <input id="studio-name" required minLength={2} value={v.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="studio-discipline" className={labelCls}>
              What you shoot
            </label>
            <select id="studio-discipline" value={v.discipline} onChange={(e) => set("discipline", e.target.value as Discipline)} className={inputCls}>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {disciplineLabel(d)}
                </option>
              ))}
            </select>
          </div>
        </SettingsSection>

        <SettingsSection title="Web address" description="Where clients find your studio, book and see their photos.">
          <div>
            <label htmlFor="studio-slug" className={labelCls}>
              Studio address
            </label>
            <div className="flex items-stretch rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-amber-500 overflow-hidden">
              <span className="px-3 flex items-center text-sm text-zinc-500 border-r border-zinc-700 select-none">{host}/</span>
              <input
                id="studio-slug"
                required
                minLength={2}
                value={v.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                aria-describedby="studio-slug-help"
                className="flex-1 min-w-0 px-3 py-2.5 bg-transparent text-sm text-white focus:outline-none"
              />
            </div>
            <p id="studio-slug-help" className={slugChanged ? "text-xs text-amber-300 mt-1.5" : helpCls}>
              {slugChanged
                ? `Links you've already shared use ${host}/${tenant.slug} and will stop working.`
                : "Lowercase letters, numbers and hyphens."}
            </p>
          </div>
          <div>
            <label htmlFor="studio-domain" className={labelCls}>
              Custom domain <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              id="studio-domain"
              value={v.customDomain}
              onChange={(e) => set("customDomain", e.target.value)}
              placeholder="studio.example.com"
              aria-describedby="studio-domain-help"
              className={inputCls}
            />
            <p id="studio-domain-help" className={helpCls}>
              Point the domain at this platform with your DNS provider. It starts working within a minute of saving.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection title="Look" description="Your logo and accent colour on your public pages and emails.">
          <ImageUploadField id="studio-logo" label="Logo" folder="logos" value={v.logoUrl} onChange={(url) => set("logoUrl", url)} />
          <fieldset>
            <legend className={labelCls}>Accent colour</legend>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                aria-label="Pick a colour"
                value={/^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#f59e0b"}
                onChange={(e) => set("brandColor", e.target.value)}
                className="size-10 rounded-lg cursor-pointer border border-zinc-700 bg-transparent p-0.5"
              />
              <input
                aria-label="Colour code"
                value={v.brandColor}
                onChange={(e) => set("brandColor", e.target.value)}
                className={inputCls.replace("w-full", "w-28")}
              />
              <div className="flex items-center gap-1.5">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.hex}
                    onClick={() => set("brandColor", p.hex)}
                    aria-label={p.label}
                    aria-pressed={v.brandColor.toLowerCase() === p.hex}
                    className={`size-7 rounded-full transition-transform hover:scale-110 ${
                      v.brandColor.toLowerCase() === p.hex ? "ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0e]" : ""
                    }`}
                    style={{ backgroundColor: p.hex }}
                  />
                ))}
              </div>
            </div>
          </fieldset>
        </SettingsSection>

        <SettingsSection title="About" description="Shown on your public studio page.">
          <div>
            <label htmlFor="studio-tagline" className={labelCls}>
              Tagline
            </label>
            <input
              id="studio-tagline"
              value={v.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Wedding and portrait photography in Kuala Lumpur"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="studio-bio" className={labelCls}>
              About the studio
            </label>
            <textarea
              id="studio-bio"
              rows={4}
              value={v.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Who you are, how you work, what clients can expect."
              className={`${inputCls} resize-y`}
            />
          </div>
        </SettingsSection>
      </SettingsForm>
      {confirmDialog}
    </>
  );
}
