"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Camera,
  Film,
  Aperture,
  DollarSign,
  Lock,
  Mail,
  User,
  Phone,
  Layers,
  Palette,
  ExternalLink,
  Shield,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { checkSlugAvailability, onboardStudio } from "@/lib/actions/onboarding";
import type { OnboardStudioInput } from "@/lib/validations/onboarding";

const COLOR_PRESETS = [
  { name: "Warm Amber", hex: "#f59e0b" },
  { name: "Cyan Slate", hex: "#06b6d4" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose Noir", hex: "#f43f5e" },
  { name: "Electric Violet", hex: "#8b5cf6" },
];

export default function CreateStudioPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form state
  const [formData, setFormData] = useState<OnboardStudioInput>({
    name: "",
    slug: "",
    discipline: "HYBRID",
    currency: "USD",
    tagline: "",
    bio: "",
    brandColor: "#f59e0b",
    logoUrl: "",
    ownerName: "",
    ownerEmail: "",
    password: "",
    ownerPhone: "",
    subscriptionTier: "PRO",
  });

  const [slugChecking, setSlugChecking] = useState<boolean>(false);
  const [slugStatus, setSlugStatus] = useState<{ available?: boolean; error?: string }>({});

  // Auto-slugify name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    setFormData((prev) => ({
      ...prev,
      name: val,
      slug: prev.slug === "" || prev.slug === autoSlug.slice(0, -1) ? autoSlug : prev.slug,
    }));
  };

  const handleSlugBlur = async () => {
    if (!formData.slug || formData.slug.length < 3) {
      setSlugStatus({ available: false, error: "Slug must be at least 3 characters" });
      return;
    }

    setSlugChecking(true);
    const result = await checkSlugAvailability(formData.slug);
    setSlugChecking(false);
    setSlugStatus(result);
  };

  // Step 1 Validation
  const isStep1Valid =
    formData.name.trim().length >= 2 &&
    formData.slug.trim().length >= 3 &&
    slugStatus.available !== false;

  // Step 3 Validation
  const isStep3Valid =
    formData.ownerName.trim().length >= 2 &&
    formData.ownerEmail.includes("@") &&
    formData.password.length >= 8;

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await onboardStudio(formData);
      if (res.success && res.slug) {
        toast.success("Studio workspace launched successfully!");
        router.push(`/${res.slug}`);
      } else {
        toast.error(res.error || "Failed to create studio workspace");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb / Top Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to Platform
          </Link>
          <div className="text-xs font-mono text-zinc-400">
            STEP 0{currentStep} / 04 // ONBOARDING
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Launch Your Studio Digital Workspace
          </h1>
          <p className="text-sm text-zinc-400">
            Provision your branded showcase, 10-minute cinema booking engine, and delivery paywall in 60 seconds.
          </p>
        </div>

        {/* Step Indicator Rail */}
        <div className="grid grid-cols-4 gap-2 border-b border-zinc-800 pb-4">
          {[
            { num: 1, title: "Studio Identity" },
            { num: 2, title: "Brand Styling" },
            { num: 3, title: "Owner Access" },
            { num: 4, title: "Launch Plan" },
          ].map((s) => (
            <div
              key={s.num}
              className={`flex flex-col gap-1 text-xs transition-colors ${
                currentStep === s.num
                  ? "text-amber-400 font-bold"
                  : currentStep > s.num
                  ? "text-emerald-400 font-medium"
                  : "text-zinc-400"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono">{`0${s.num}.`}</span>
                <span>{s.title}</span>
              </div>
              <div
                className={`h-1 rounded-full ${
                  currentStep === s.num
                    ? "bg-amber-500"
                    : currentStep > s.num
                    ? "bg-emerald-500"
                    : "bg-zinc-800"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Main Content Layout: Form Left, Real-Time Preview Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Wizard Column */}
          <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-[#121215] p-6 sm:p-8 space-y-6">
            {/* STEP 1: IDENTITY & DISCIPLINE */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Studio Identity &amp; Discipline</h2>
                  <p className="text-xs text-zinc-400">Name your workspace and choose your creative focus.</p>
                </div>

                <div className="space-y-4">
                  {/* Studio Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Studio Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Velox Cinema Works"
                      value={formData.name}
                      onChange={handleNameChange}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Slug */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Subpath URL Slug *
                      </label>
                      {slugChecking && (
                        <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                          <Loader2 className="size-3 animate-spin" /> checking...
                        </span>
                      )}
                      {!slugChecking && slugStatus.available === true && (
                        <span className="text-[11px] text-emerald-400 font-mono">✓ Available</span>
                      )}
                      {!slugChecking && slugStatus.available === false && (
                        <span className="text-[11px] text-red-400 font-mono">
                          ✕ {slugStatus.error || "Slug taken"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center rounded-lg border border-zinc-700 bg-[#18181b] overflow-hidden focus-within:border-amber-500">
                      <span className="px-3 text-xs font-mono text-zinc-400 border-r border-zinc-800">
                        cineflow.app/
                      </span>
                      <input
                        type="text"
                        placeholder="velox-cinema"
                        value={formData.slug}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().trim() }))
                        }
                        onBlur={handleSlugBlur}
                        className="w-full px-3 py-2 bg-transparent text-white text-sm font-mono focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Discipline Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Creative Discipline
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "PHOTOGRAPHY", label: "Photography", icon: Camera },
                        { id: "VIDEOGRAPHY", label: "Videography", icon: Film },
                        { id: "HYBRID", label: "Hybrid Studio", icon: Aperture },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = formData.discipline === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                discipline: item.id as any,
                              }))
                            }
                            className={`p-3 rounded-lg border text-left flex flex-col items-center justify-center gap-1.5 transition-all ${
                              isSelected
                                ? "bg-amber-500/10 border-amber-500 text-amber-300 font-bold"
                                : "bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                            }`}
                          >
                            <Icon className="size-5" />
                            <span className="text-xs">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Currency Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Primary Operating Currency
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {["USD", "MYR", "EUR", "GBP"].map((curr) => (
                        <button
                          type="button"
                          key={curr}
                          onClick={() => setFormData((prev) => ({ ...prev, currency: curr as any }))}
                          className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all ${
                            formData.currency === curr
                              ? "bg-amber-500 text-black border-amber-500"
                              : "bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          {curr}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={!isStep1Valid}
                    onClick={() => setCurrentStep(2)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs tracking-tight transition-all"
                  >
                    Continue to Brand
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: BRAND STYLING */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Brand Styling &amp; Narrative</h2>
                  <p className="text-xs text-zinc-400">Establish your visual signature and brand accents.</p>
                </div>

                <div className="space-y-4">
                  {/* Tagline */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Studio Tagline
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cinematic Narrative &amp; High-Fashion Visuals"
                      value={formData.tagline}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tagline: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Studio Bio / Philosophy
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Crafting emotional milestone imagery with medium format precision..."
                      value={formData.bio}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  {/* Brand Color Presets */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Brand Accent Color
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          type="button"
                          key={color.hex}
                          onClick={() => setFormData((prev) => ({ ...prev, brandColor: color.hex }))}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                            formData.brandColor === color.hex
                              ? "border-white bg-zinc-800 text-white"
                              : "border-zinc-800 bg-[#18181b] text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <span
                            className="size-3 rounded-full border border-black/40"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span>{color.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logo URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Studio Logo Asset URL (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. /uploads/logos/my-studio.png"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs tracking-tight transition-all"
                  >
                    Continue to Owner Credentials
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: STUDIO OWNER CREDENTIALS */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Studio Owner Credentials</h2>
                  <p className="text-xs text-zinc-400">Create your administrative account to manage this studio.</p>
                </div>

                <div className="space-y-4">
                  {/* Owner Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Owner Full Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 size-4 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Maya Lin"
                        value={formData.ownerName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerName: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Owner Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Owner Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 size-4 text-zinc-500" />
                      <input
                        type="email"
                        placeholder="maya@veloxcinema.com"
                        value={formData.ownerEmail}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerEmail: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Owner Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Password (min 8 chars) *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 size-4 text-zinc-500" />
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Owner Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Contact Mobile (for WhatsApp dispatch)
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3 size-4 text-zinc-500" />
                      <input
                        type="tel"
                        placeholder="+60 12-345 6789"
                        value={formData.ownerPhone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerPhone: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 2
                  </button>
                  <button
                    type="button"
                    disabled={!isStep3Valid}
                    onClick={() => setCurrentStep(4)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs tracking-tight transition-all"
                  >
                    Continue to Plan
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: PLAN SELECTION & LAUNCH */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Select Launch Plan &amp; Review</h2>
                  <p className="text-xs text-zinc-400">Confirm your subscription plan to deploy your workspace.</p>
                </div>

                <div className="space-y-3">
                  {[
                    { id: "STARTER", name: "Starter", price: "$29/mo", detail: "Solo lead, branded showcase, 10-min slot hold" },
                    { id: "PRO", name: "Pro Studio", price: "$79/mo", detail: "Up to 5 crew, custom domain, proposals, solar HUD" },
                    { id: "STUDIO_UNLIMITED", name: "Studio Unlimited", price: "$199/mo", detail: "Unlimited crew, living room wall visualizer, print orders" },
                  ].map((tier) => (
                    <button
                      type="button"
                      key={tier.id}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          subscriptionTier: tier.id as any,
                        }))
                      }
                      className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        formData.subscriptionTier === tier.id
                          ? "bg-amber-500/10 border-amber-500 text-white"
                          : "bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{tier.name}</span>
                          {tier.id === "PRO" && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500 text-black font-bold">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{tier.detail}</p>
                      </div>
                      <span className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                        {tier.price}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Provisioning summary list */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-[#09090b] space-y-2 text-xs">
                  <span className="font-mono uppercase tracking-wider text-zinc-400">
                    Auto-Provisioned Digital Assets:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-zinc-300">
                    <div>✓ 4 Standard Campaign Categories</div>
                    <div>✓ 3 Frame Moldings (Black, Walnut, Gold)</div>
                    <div>✓ 3 Wall Print Sizing Specs (8R, 12R, 16R)</div>
                    <div>✓ 4 Proposal Add-On Templates</div>
                    <div>✓ 1 Seed Starter Service Package</div>
                    <div>✓ 10-Minute Slot Holding Engine</div>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 3
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-sm tracking-tight shadow-xl shadow-amber-500/20 disabled:opacity-50 transition-all"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Provisioning Workspace...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        Deploy Studio Workspace
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real-Time Live Showcase Preview Column */}
          <div className="lg:col-span-5 sticky top-24 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                LIVE SHOWCASE CARD PREVIEW
              </span>
              <span className="text-[11px] font-mono text-amber-400">REAL-TIME</span>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-[#121215] p-6 shadow-2xl space-y-6 relative overflow-hidden">
              <div
                className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none opacity-20"
                style={{ backgroundColor: formData.brandColor || "#f59e0b" }}
              />

              <div className="space-y-4 relative z-10">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="size-12 rounded-xl flex items-center justify-center font-bold text-black text-lg shadow-md"
                    style={{ backgroundColor: formData.brandColor || "#f59e0b" }}
                  >
                    {formData.name.slice(0, 1).toUpperCase() || "C"}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {formData.name || "Your Studio Name"}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-1">
                      {formData.tagline || "Your cinematic tagline will display here."}
                    </p>
                  </div>
                </div>

                {/* Subdomain URL Badge */}
                <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span>URL:</span>
                  <span className="text-white">
                    cineflow.app/{formData.slug || "your-slug"}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: `${formData.brandColor}50`,
                      backgroundColor: `${formData.brandColor}15`,
                      color: formData.brandColor,
                    }}
                  >
                    {formData.discipline}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    Currency: {formData.currency}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    Tier: {formData.subscriptionTier}
                  </span>
                </div>

                {/* Bio */}
                <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-3">
                  {formData.bio ||
                    "Crafting cinematic visuals, authentic emotion, and timeless milestone imagery."}
                </p>

                {/* Sample Action CTA */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 rounded-lg text-xs font-bold text-black shadow-md opacity-80 cursor-default"
                    style={{ backgroundColor: formData.brandColor || "#f59e0b" }}
                  >
                    Sample Booking CTA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
