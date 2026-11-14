"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Building2,
  CreditCard,
  QrCode,
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  ExternalLink,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { saveGatewayCredentials, removeGatewayCredentials } from "@/lib/actions/admin-payments";
import { disciplineLabel } from "@/lib/labels";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";

function GatewaySettings({
  tenantId,
  tenantSlug,
  configured,
  initialCategoryCode,
  currency,
}: {
  tenantId: string;
  tenantSlug: string;
  configured: boolean;
  initialCategoryCode: string;
  /** The saved studio currency. Toyyibpay only charges in ringgit. */
  currency: string;
}) {
  const supported = currency === "MYR";
  const router = useRouter();
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [categoryCode, setCategoryCode] = useState(initialCategoryCode);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveGatewayCredentials({ tenantId, tenantSlug, secretKey: secretKey || undefined, categoryCode });
      if (res.success) {
        toast.success("Online payment settings saved.");
        setSecretKey("");
        router.refresh();
      } else {
        toast.error(res.message || "Could not save payment settings.");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await removeGatewayCredentials({ tenantId, tenantSlug });
      if (res.success) {
        toast.success("Online payments disabled.");
        setCategoryCode("");
        setSecretKey("");
        router.refresh();
      } else {
        toast.error(res.message || "Could not remove payment settings.");
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500";

  return (
    <div className="p-6 rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-5">
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <CreditCard className="size-5 text-amber-400" />
        <h2 className="text-base font-bold text-white tracking-tight">Online Payments (Toyyibpay)</h2>
        <span
          className={`ml-auto text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
            configured ? "text-emerald-400 border-emerald-500/30" : "text-zinc-400 border-zinc-700"
          }`}
        >
          {!supported ? "MYR only" : configured ? "Connected" : "Not connected"}
        </span>
      </div>
      {!supported && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3.5 py-2.5 leading-relaxed">
          Toyyibpay only charges in Malaysian Ringgit, and your studio is priced in {currency}. Clients can pay by QR
          or cash. To take FPX or card payments, set the studio currency to MYR and save first.
        </p>
      )}
      <p className="text-xs text-zinc-400 leading-relaxed">
        Let clients pay by FPX online banking or card. Payments go straight to your own Toyyibpay account. Find the
        secret key and a category code in your Toyyibpay dashboard. Without this, clients can only pay by QR or cash.
      </p>
      {supported && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">User Secret Key</span>
            <span className="relative block">
              <input
                type={showSecretKey ? "text" : "password"}
                autoComplete="off"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={configured ? "Saved (leave blank to keep)" : "xxxxxxxx-xxxx-xxxx-xxxx"}
                className={`${inputCls.replace("px-3.5", "pl-3.5")} pr-10`}
              />
              <PasswordVisibilityToggle
                visible={showSecretKey}
                onToggle={() => setShowSecretKey((v) => !v)}
                what="secret key"
              />
            </span>
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Category Code</span>
            <input
              type="text"
              autoComplete="off"
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              placeholder="e.g. a1b2c3d4"
              className={inputCls}
            />
          </label>
        </div>
      )}
      <div className="flex gap-3">
        {supported && (
          <button
            type="button"
            onClick={save}
            disabled={busy || !categoryCode.trim() || (!configured && !secretKey)}
            className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Connecting..." : configured ? "Update connection" : "Connect Toyyibpay"}
          </button>
        )}
        {configured && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

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
  subscriptionTier: string;
  subscriptionStatus: string;
  gatewayConfigured?: boolean;
  gatewayCategoryCode?: string | null;
}

interface StudioSettingsFormProps {
  tenant: StudioTenantData;
}

const BRAND_PRESET_COLORS = [
  { label: "Cinema Amber", hex: "#f59e0b" },
  { label: "Crimson Red", hex: "#ef4444" },
  { label: "Emerald Film", hex: "#10b981" },
  { label: "Midnight Cyan", hex: "#06b6d4" },
  { label: "Royal Indigo", hex: "#6366f1" },
  { label: "Rose Gold", hex: "#f43f5e" },
];

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "MYR", symbol: "RM", label: "Malaysian Ringgit (RM)" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar (S$)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
];

const DISCIPLINES = ["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"];

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
}

function ImageUploadField({
  label,
  folder,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  folder: "logos" | "qrcodes";
  value: string;
  onChange: (url: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPG, WebP or SVG)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller");
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
      toast.success("Image uploaded. Save settings to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-xs font-mono text-zinc-400 block mb-1.5">{label}</label>
      <div className="flex items-center gap-3 mb-2">
        <div className="size-14 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 flex items-center justify-center overflow-hidden">
          {value && isValidImageUrl(value) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="size-full object-contain" />
          ) : (
            <Upload className="size-5 text-zinc-600" />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-amber-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? "Uploading..." : value ? "Replace Image" : "Upload Image"}
        </button>
        {value && !uploading && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-red-400"
          >
            <X className="size-3.5" />
            Remove
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
      />
      <p className="text-[11px] text-zinc-500 mt-1">PNG, JPG, WebP or SVG, up to 5MB. Or paste a URL.</p>
    </div>
  );
}

export function StudioSettingsForm({ tenant }: StudioSettingsFormProps) {
  const router = useRouter();

  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [customDomain, setCustomDomain] = useState(tenant.customDomain || "");
  const [discipline, setDiscipline] = useState<"PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID">(
    (tenant.discipline as any) || "HYBRID"
  );
  const [tagline, setTagline] = useState(tenant.tagline || "");
  const [bio, setBio] = useState(tenant.bio || "");
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl || "");
  const [brandColor, setBrandColor] = useState(tenant.brandColor || "#f59e0b");
  const [currency, setCurrency] = useState<"USD" | "MYR" | "SGD" | "EUR" | "GBP">(
    (tenant.currency as any) || "USD"
  );
  const [qrCodeUrl, setQrCodeUrl] = useState(tenant.qrCodeUrl || "");
  const [bankDetails, setBankDetails] = useState(tenant.bankDetails || "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedTenantId, setCopiedTenantId] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(tenant.id);
    setCopiedTenantId(true);
    setTimeout(() => setCopiedTenantId(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await updateStudioSettings({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        name,
        newSlug: slug,
        customDomain: customDomain || null,
        discipline,
        tagline: tagline || null,
        bio: bio || null,
        logoUrl: logoUrl || null,
        brandColor,
        currency,
        qrCodeUrl: qrCodeUrl || null,
        bankDetails: bankDetails || null,
      });

      if (!res.success) {
        setErrorMessage(res.message || "Failed to update studio settings.");
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage("Studio settings and payment credentials saved successfully!");

      if (res.slugChanged && res.newSlug) {
        // Redirect to new admin settings path
        setTimeout(() => {
          router.push(`/${res.newSlug}/admin/settings`);
        }, 1500);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="size-6 text-amber-400" />
            <span>Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Your studio name and look, web address, and how clients pay you.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/10 shrink-0"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>Save settings</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5 animate-in fade-in-0">
          <AlertCircle className="size-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5 animate-in fade-in-0">
          <Check className="size-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Section 1: Studio Identity & Branding */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
          <Building2 className="size-5 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight">Studio Identity & Branding</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1.5">
              Studio Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1.5">
              URL Path Slug *
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {slug !== tenant.slug && (
              <p className="text-[11px] text-amber-400 mt-1">
                Warning: Modifying your slug will change your public studio URL from /{tenant.slug} to /{slug}.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1.5">
              Production Discipline *
            </label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {disciplineLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1.5">
              Studio Currency *
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1.5">
              Custom Domain (Optional)
            </label>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="studio.example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Point the domain at this platform with your DNS provider. It starts working within a minute of saving.
            </p>
          </div>
        </div>

        {/* Brand Accent Color */}
        <div>
          <label className="text-xs font-mono text-zinc-400 block mb-2">
            Brand Accent Color (Hex)
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="size-10 rounded-xl cursor-pointer border border-zinc-700 bg-transparent p-0.5"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="w-32 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center gap-1.5">
              {BRAND_PRESET_COLORS.map((preset) => (
                <button
                  type="button"
                  key={preset.hex}
                  onClick={() => setBrandColor(preset.hex)}
                  className="size-7 rounded-full border border-zinc-600 transition-transform hover:scale-110"
                  style={{ backgroundColor: preset.hex }}
                  title={preset.label}
                />
              ))}
            </div>
          </div>
        </div>

        <ImageUploadField
          label="Studio Logo"
          folder="logos"
          value={logoUrl}
          onChange={setLogoUrl}
          placeholder="/uploads/logos/lumina-logo.png"
        />

        <div>
          <label className="text-xs font-mono text-zinc-400 block mb-1.5">
            Studio Tagline
          </label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Cinematic brand campaigns and heirloom visual narratives."
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-mono text-zinc-400 block mb-1.5">
            Studio Bio & Mission Statement
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Detailed background about the production team, studio philosophy, and equipment fleet..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
          />
        </div>
      </div>

      {/* Section 2: Bank Transfer & Payment Wire Info */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
          <CreditCard className="size-5 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight">Direct Wire & Bank Transfer Details</h2>
        </div>

        <p className="text-xs text-zinc-400">
          These details are shown on the client checkout page when customers choose the QR / Bank Wire payment option.
        </p>

        <div>
          <label className="text-xs font-mono text-zinc-400 block mb-1.5">
            Bank Credentials String *
          </label>
          <input
            type="text"
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            placeholder="e.g. JPMorgan Chase / Lumina CineWorks LLC / Routing: 021000021 / Account: 8492019482"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Live Bank Mockup Preview */}
        {bankDetails && (
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
              Client Checkout Preview
            </span>
            <div className="p-3 rounded-lg bg-black/40 border border-zinc-700 font-mono text-zinc-300 flex items-center justify-between">
              <span className="truncate">{bankDetails}</span>
              <span className="text-[10px] text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded shrink-0 ml-2">
                Copy Button
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Payment QR Code Asset */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
          <QrCode className="size-5 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight">Studio Payment QR Code Asset</h2>
        </div>

        <p className="text-xs text-zinc-400">
          Upload or link your studio&apos;s payment QR code (DuitNow, PromptPay, Venmo, CashApp, or direct banking QR).
        </p>

        <ImageUploadField
          label="QR Code Image"
          folder="qrcodes"
          value={qrCodeUrl}
          onChange={setQrCodeUrl}
          placeholder="/uploads/qrcodes/studio-duitnow.png"
        />

        {/* Live QR Preview */}
        {qrCodeUrl && isValidImageUrl(qrCodeUrl) && (
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
              QR Code Preview
            </span>
            <div className="size-36 rounded-xl border border-zinc-700 bg-white p-2 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- any URL the owner pastes; next/image needs allow-listed hosts */}
              <img
                src={qrCodeUrl}
                alt="Studio QR Code"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Workspace & License Information */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-[#0d0d10] space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
          <ShieldCheck className="size-5 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight">Plan</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-500 uppercase block">
              Subscription Tier
            </span>
            <span className="text-sm font-bold font-mono text-white mt-0.5 block">
              {tenant.subscriptionTier}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-500 uppercase block">
              License Status
            </span>
            <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block flex items-center gap-1">
              <Check className="size-3.5" /> {tenant.subscriptionStatus}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-500 uppercase block">
              Studio ID
            </span>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className="text-xs font-mono text-zinc-400 truncate">{tenant.id}</span>
              <button
                type="button"
                onClick={handleCopyId}
                className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                title="Copy ID"
              >
                {copiedTenantId ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom save bar, so the button is in reach after editing any section above. */}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-[#09090b]/95 backdrop-blur flex items-center justify-end gap-3 border-t border-zinc-800">
        <span className="text-[11px] text-zinc-500 mr-auto">Saves everything above. Online payments are set up separately below.</span>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          <span>{isSubmitting ? "Saving..." : "Save settings"}</span>
        </button>
      </div>
    </form>

    {/* Online payments live outside the settings form: they save on their own (the secret
        key never travels with the rest of the settings) and Enter in them must not submit it. */}
      <GatewaySettings
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        configured={Boolean(tenant.gatewayConfigured)}
        initialCategoryCode={tenant.gatewayCategoryCode ?? ""}
        currency={tenant.currency}
      />

    </div>
  );
}
