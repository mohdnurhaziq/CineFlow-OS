"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import type { UpdateStudioSettingsInput } from "@/lib/validations/admin-settings";
import { errorMessageOf } from "@/lib/action-error";

/** What the settings screen knows about the studio. Never the encrypted gateway secret. */
export interface StudioTenantData {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  discipline: string;
  tagline?: string | null;
  bio?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  currency: string;
  qrCodeUrl?: string | null;
  bankDetails?: string | null;
  releaseFilesBeforePayment?: boolean;
  subscriptionTier: string;
  subscriptionStatus: string;
  gatewayConfigured?: boolean;
  gatewayCategoryCode?: string | null;
}

export const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors";
export const labelCls = "text-sm font-medium text-zinc-200 block mb-2";
export const helpCls = "text-xs text-zinc-400 mt-1.5";

// ---------------------------------------------------------------------------
// Unsaved changes: the tab bar asks before leaving a tab with edits.
// ---------------------------------------------------------------------------

/** Each form on the screen reports under its own key, so two forms on one tab don't overwrite each other. */
export const DirtyContext = createContext<(key: string, dirty: boolean) => void>(() => {});

/** Reports this form's unsaved state to the tab bar, and warns before closing the page. */
export function useUnsavedGuard(dirty: boolean) {
  const report = useContext(DirtyContext);
  const key = useId();
  useEffect(() => {
    report(key, dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, report, key]);
  useEffect(() => () => report(key, false), [report, key]);
}

// ---------------------------------------------------------------------------
// Saving: each tab sends only its own fields.
// ---------------------------------------------------------------------------

type TabFields = Omit<UpdateStudioSettingsInput, "tenantId" | "tenantSlug">;

export function useSettingsSave(tenant: StudioTenantData) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const save = async (fields: TabFields): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await updateStudioSettings({ tenantId: tenant.id, tenantSlug: tenant.slug, ...fields });
      if (!res.success) {
        toast.error(res.message || "Could not save. Please try again.");
        return false;
      }
      if (res.slugChanged && res.newSlug) {
        toast.success("Saved. Taking you to your new studio address…");
        router.push(`/${res.newSlug}/admin/settings`);
      } else {
        toast.success("Saved.");
        router.refresh();
      }
      return true;
    } catch (err) {
      toast.error(errorMessageOf(err) || "Could not save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** One settings row: what it is on the left, its fields on the right (stacked on a phone). */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10 py-8 first:pt-2 border-t border-zinc-800/80 first:border-t-0">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{description}</p>}
      </div>
      <div className="space-y-5 min-w-0">{children}</div>
    </section>
  );
}

/**
 * The one Save for a tab, at the foot of its form. It stays in reach while the form is on screen,
 * says whether anything changed, and offers to undo the edits.
 */
export function SaveBar({ dirty, saving, onDiscard, label = "Save changes" }: { dirty: boolean; saving: boolean; onDiscard: () => void; label?: string }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-5 py-3 bg-[#0d0d10] border-t border-zinc-800 sm:rounded-b-2xl flex items-center gap-3">
      <span className={`text-sm mr-auto ${dirty ? "text-amber-300" : "text-zinc-500"}`} aria-live="polite">
        {dirty ? "You have unsaved changes" : "All changes saved"}
      </span>
      {dirty && (
        <button type="button" onClick={onDiscard} disabled={saving} className="px-3.5 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-50">
          Discard
        </button>
      )}
      <button
        type="submit"
        disabled={!dirty || saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-400 transition-colors"
      >
        {saving && <Loader2 className="size-4 animate-spin" />}
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

/** A tab's form: its sections, then its Save bar. */
export function SettingsForm({ onSubmit, footer, children }: { onSubmit: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-2xl border border-zinc-800 bg-[#0b0b0e]"
    >
      <div className="px-4 sm:px-6 pb-2">{children}</div>
      {footer}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Image field (logo, QR code)
// ---------------------------------------------------------------------------

export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
}

export function ImageUploadField({
  id,
  label,
  folder,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  folder: "logos" | "qrcodes";
  value: string;
  onChange: (url: string) => void;
  help?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG, JPG, WebP or SVG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("The image must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
      onChange(json.url);
      toast.success("Image uploaded. Save to use it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span id={`${id}-label`} className={labelCls}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="size-14 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 flex items-center justify-center overflow-hidden">
          {value && isValidImageUrl(value) ? (
            // eslint-disable-next-line @next/next/no-img-element -- any URL the owner uploads or pastes
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <Upload className="size-5 text-zinc-600" aria-hidden />
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} className="hidden" aria-labelledby={`${id}-label`} />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          aria-describedby={`${id}-help`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:border-zinc-500 text-sm text-white disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </button>
        {value && !uploading && (
          <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-red-400">
            <X className="size-4" /> Remove
          </button>
        )}
      </div>
      <p id={`${id}-help`} className={helpCls}>
        {help ?? "PNG, JPG, WebP or SVG, up to 5 MB."}
      </p>
    </div>
  );
}
