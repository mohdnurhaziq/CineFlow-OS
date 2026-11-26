"use client";

import { buttonVariants } from "@/components/ui/button";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { APP_DOMAIN, studioSubdomainsOn, studioUrl } from "@/lib/domain-name";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Camera,
  Film,
  Aperture,
  Lock,
  Mail,
  User,
  Phone,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import { toast } from "sonner";
import { checkInvite, checkSignupCode, checkSlugAvailability, googleAvailable, onboardStudio, readGoogleTicket, studioSignupStatus } from "@/lib/actions/onboarding";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { googleErrorMessage } from "@/lib/auth/google-messages";
import { platformUrl } from "@/lib/domain-name";
import type { OnboardStudioInput } from "@/lib/validations/onboarding";
import { disciplineLabel } from "@/lib/labels";
import { PLANS } from "@/lib/billing/plans";
import { slugFromName } from "@/lib/studio-slug";
import { draftToStore, isFullEmail, parseDraft, reachableStep, stepForField } from "@/lib/onboarding/wizard-draft";
import { ReviewSummary } from "@/components/onboarding/review-summary";

/** "Continue with Google" for the owner step: to the platform's Google start, then back here with a ticket. */
const GOOGLE_SIGNUP_HREF = `${platformUrl("/auth/google/start")}?intent=signup`;
/** The wizard's answers, kept while Google has the browser (sessionStorage; never the password). */
const SAVE_KEY = "cineflow:create-studio";

const COLOR_PRESETS = [
  { name: "Warm Amber", hex: "#f59e0b" },
  { name: "Cyan Slate", hex: "#06b6d4" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose Noir", hex: "#f43f5e" },
  { name: "Electric Violet", hex: "#8b5cf6" },
];

export default function CreateStudioPage() {
  // With studio subdomains on, a studio's address is <slug>.<domain>.
  const subdomains = studioSubdomainsOn();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form state
  const [formData, setFormData] = useState<OnboardStudioInput>({
    name: "",
    slug: "",
    discipline: "HYBRID",
    currency: "MYR",
    tagline: "",
    bio: "",
    brandColor: "#f59e0b",
    logoUrl: "",
    ownerName: "",
    ownerEmail: "",
    password: "",
    ownerPhone: "",
    subscriptionTier: "PRO",
    offersPrints: true,
  });

  // Whether sign-up is open, and whether it needs the beta's invite code (studioSignupStatus).
  const [signup, setSignup] = useState<{ open: boolean; needsCode: boolean } | null>(null);
  useEffect(() => {
    studioSignupStatus()
      .then(setSignup)
      .catch(() => setSignup({ open: true, needsCode: false }));
  }, []);

  // Google sign-in for the owner: whether it is set up, and what Google confirmed (a signed ticket).
  const [googleOn, setGoogleOn] = useState(false);
  const [googleSignedIn, setGoogleSignedIn] = useState(false);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);
  useEffect(() => {
    googleAvailable()
      .then(setGoogleOn)
      .catch(() => setGoogleOn(false));
  }, []);

  const [slugChecking, setSlugChecking] = useState<boolean>(false);
  /** The answer for one address: `slug` says which, so an old answer is never shown for a new one. */
  const [slugStatus, setSlugStatus] = useState<{ slug?: string; available?: boolean; error?: string }>({});
  // Once the owner types an address of their own, it stops following the name.
  const [addressEdited, setAddressEdited] = useState(false);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, name: val, slug: addressEdited ? prev.slug : slugFromName(val) }));
  };

  // The address is checked whenever it changes, however it was filled in.
  useEffect(() => {
    const slug = formData.slug;
    if (slug.length < 3) {
      setSlugStatus(slug ? { slug, available: false, error: "At least 3 characters" } : {});
      setSlugChecking(false);
      return;
    }
    let stale = false;
    setSlugChecking(true);
    const timer = window.setTimeout(() => {
      checkSlugAvailability(slug)
        .then((result) => {
          if (!stale) setSlugStatus({ slug, ...result });
        })
        // Can't ask right now: the server checks again when the studio is made.
        .catch(() => {
          if (!stale) setSlugStatus({ slug });
        })
        .finally(() => {
          if (!stale) setSlugChecking(false);
        });
    }, 350);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [formData.slug]);

  // A personal invite link (from an approved invite request): it opens sign-up for that email, with no code.
  const [invite, setInvite] = useState<{ token: string; email: string } | null>(null);
  const [inviteState, setInviteState] = useState<"none" | "checking" | "dead">("none");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  /** Why the server last refused, kept on screen until the answer it was about changes. */
  const [submitError, setSubmitError] = useState<{ message: string; field?: string } | null>(null);
  useEffect(() => {
    setSubmitError(null);
  }, [formData.slug, formData.ownerEmail, formData.password, formData.signupCode, formData.ownerName]);
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const [logoUploading, setLogoUploading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Must match what /api/upload accepts from visitors without an account (no SVG).
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Please choose a PNG, JPG or WebP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be 5MB or smaller");
      return;
    }

    setLogoUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "logos");
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Upload failed");
      }
      setFormData((prev) => ({ ...prev, logoUrl: json.url }));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  // Step 1 Validation: Continue waits for the answer about this very address.
  const addressChecked = slugStatus.slug === formData.slug && !slugChecking;
  const isStep1Valid =
    addressChecked &&
    slugStatus.available !== false &&
    formData.name.trim().length >= 2 &&
    formData.slug.trim().length >= 3 &&
    (!signup?.needsCode || invite !== null || (formData.signupCode ?? "").trim().length > 0);

  // A wrong invite code is caught here, not after the whole form is filled in.
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);
  const continueFromStep1 = async () => {
    if (signup?.needsCode && !invite) {
      setCodeChecking(true);
      try {
        const res = await checkSignupCode(formData.signupCode ?? "");
        if (!res.valid) {
          setCodeError(res.message ?? "That invite code isn't right.");
          return;
        }
      } catch {
        setCodeError("Couldn't check the invite code. Please try again.");
        return;
      } finally {
        setCodeChecking(false);
      }
    }
    setCodeError(null);
    goToStep(2);
  };

  // Step 3 Validation: a password, unless Google confirmed the owner's email.
  const isStep3Valid =
    formData.ownerName.trim().length >= 2 &&
    isFullEmail(formData.ownerEmail) &&
    (googleSignedIn || (formData.password ?? "").length >= 8);

  // The steps are in the browser's history, so Back and Forward move between them.
  const goToStep = (step: number) => {
    if (step === currentStep) return;
    window.history.pushState({ wizardStep: step, wizardFrom: currentStep }, "", `?step=${step}`);
    setCurrentStep(step);
    window.scrollTo({ top: 0 });
  };
  /** The wizard's own Back: the browser's, when that leads to the same step, so history doesn't pile up. */
  const goBack = (step: number) => {
    if (window.history.state?.wizardFrom === step) window.history.back();
    else goToStep(step);
  };

  // What the history listener needs to know, as it is right now.
  const ready = useRef({ hasStudio: false, owner: false });
  ready.current = { hasStudio: formData.name.trim().length >= 2 && formData.slug.length >= 3, owner: isStep3Valid };
  useEffect(() => {
    const onPop = () => {
      const wanted = Number(new URLSearchParams(window.location.search).get("step") ?? 1);
      setCurrentStep(ready.current.hasStudio ? reachableStep(wanted, ready.current.owner) : 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The answers are kept in this tab (never the password), through refresh, Back and a trip to Google.
  const [draftReady, setDraftReady] = useState(false);
  const finished = useRef(false);
  useEffect(() => {
    if (!draftReady || finished.current) return;
    try {
      if (!formData.name && !formData.ownerEmail) return;
      window.sessionStorage.setItem(SAVE_KEY, draftToStore({ step: currentStep, form: formData, addressEdited, google: googleSignedIn }));
    } catch {
      // Without storage the answers just aren't remembered.
    }
  }, [draftReady, currentStep, formData, addressEdited, googleSignedIn]);

  // On arrival: bring back what was typed. An invite link says who it is for; coming back from
  // Google, the ticket says who the owner is.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("google");
    const linked = params.get("invite");
    let draft: ReturnType<typeof parseDraft> = null;
    try {
      draft = parseDraft(window.sessionStorage.getItem(SAVE_KEY));
    } catch {
      draft = null;
    }
    if (draft) {
      const saved = draft.form;
      setFormData((prev) => ({ ...prev, ...saved, password: "" }));
      setAddressEdited(draft.addressEdited);
    }
    const hasStudio = (draft?.form.name?.trim().length ?? 0) >= 2 && (draft?.form.slug?.length ?? 0) >= 3;
    const show = (step: number) => {
      window.history.replaceState(window.history.state, "", step > 1 ? `?step=${step}` : window.location.pathname);
      setCurrentStep(step);
    };

    /** The invite the sign-up is under: from the link just opened, or kept from before. */
    const openInvite = async (): Promise<string | null> => {
      const token = linked ?? draft?.form.inviteToken;
      if (!token) return null;
      setInviteState("checking");
      const info = await checkInvite(token).catch(() => ({ valid: false as const, message: "" }));
      if (!info.valid) {
        // A dead link just opened says so; one only remembered is quietly forgotten.
        setInviteState(linked ? "dead" : "none");
        setInviteMessage(info.message || null);
        setFormData((prev) => ({ ...prev, inviteToken: undefined }));
        return null;
      }
      setInvite({ token, email: info.email });
      setInviteState("none");
      // Filled in from their request; anything they have typed already stays.
      setFormData((prev) => {
        const name = prev.name || info.studioName;
        const kind = info.kind === "PHOTO" ? "PHOTOGRAPHY" : info.kind === "VIDEO" ? "VIDEOGRAPHY" : "HYBRID";
        return {
          ...prev,
          inviteToken: token,
          ownerEmail: info.email,
          ownerName: prev.ownerName || info.name,
          name,
          slug: prev.slug || slugFromName(name),
          discipline: prev.name ? prev.discipline : (kind as OnboardStudioInput["discipline"]),
        };
      });
      return info.email;
    };

    void (async () => {
      const invitedEmail = await openInvite();
      const reason = returned ? googleErrorMessage(returned) : null;
      if (reason) {
        setGoogleMessage(reason);
        show(Math.min(reachableStep(draft?.step ?? 1, false), 3));
        return;
      }
      if (!returned && !draft?.google) {
        // The password isn't kept, so the review waits until it is typed again.
        show(draft && hasStudio ? reachableStep(draft.step, false) : 1);
        return;
      }
      const who = await readGoogleTicket();
      if (!who) {
        if (returned) setGoogleMessage(googleErrorMessage("failed"));
        show(draft && hasStudio ? reachableStep(draft.step, false) : 1);
        return;
      }
      if (invitedEmail && who.email.toLowerCase() !== invitedEmail) {
        setGoogleMessage(`This invite is for ${invitedEmail}. Choose that Google account, or use a password.`);
        show(3);
        return;
      }
      setGoogleSignedIn(true);
      setFormData((prev) => ({ ...prev, ownerEmail: who.email, ownerName: prev.ownerName || who.name || "" }));
      // Straight back from Google: the owner step. After a refresh: where they were.
      show(returned ? 3 : reachableStep(draft?.step ?? 3, true));
    })()
      .catch(() => setGoogleMessage(googleErrorMessage("failed")))
      .finally(() => setDraftReady(true));
  }, []);

  const handleSubmit = () => {
    startTransition(async () => {
      setSubmitError(null);
      const res = await onboardStudio(googleSignedIn ? { ...formData, password: undefined, googleSignup: true } : formData);
      if (res.success && res.slug) {
        toast.success("Studio workspace launched successfully!");
        finished.current = true;
        try {
          window.sessionStorage.removeItem(SAVE_KEY);
        } catch {
          // Nothing was kept.
        }
        // A full page load: with studio subdomains on, the new studio's admin is on another host.
        window.location.href = res.redirectUrl || studioUrl(res.slug, "/admin");
        return;
      }
      const message = res.error || "Failed to create studio workspace";
      // Go to the answer that needs fixing, and keep the reason on screen there.
      goToStep(stepForField(res.field));
      if (res.field === "slug") setSlugStatus({ slug: formData.slug, available: false, error: "Not available" });
      if (/Google sign-in expired/.test(message)) setGoogleSignedIn(false);
      if (res.field === "invite") {
        setInviteState("dead");
        setInviteMessage(message);
      }
      setSubmitError({ message, field: res.field });
    });
  };

  if (inviteState !== "none") {
    return (
      <div className="min-h-[70vh] bg-[#09090b] text-[#fafafa] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-3">
          {inviteState === "checking" ? (
            <p role="status" className="text-sm text-zinc-300">
              Checking your invite…
            </p>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-tight text-white">This invite link doesn&apos;t work any more</h1>
              <p className="text-sm text-zinc-400">
                {inviteMessage?.startsWith("Too many") ? inviteMessage : "It may have expired, been used, or been replaced by a newer one. Check for a newer email from us, or ask for an invite again."}
              </p>
              <Link href="/#invite" className="inline-flex min-h-11 items-center text-sm text-amber-400 underline underline-offset-2 hover:text-amber-300">
                Back to CineFlow OS
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  // Production without an invite code: sign-up is closed during the beta.
  if (signup && !signup.open && !invite) {
    return (
      <div className="min-h-[70vh] bg-[#09090b] text-[#fafafa] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-3">
          <h1 className="text-xl font-bold tracking-tight text-white">Studio sign-up is closed for now</h1>
          <p className="text-sm text-zinc-400">
            CineFlow OS is in a private beta. If you&apos;d like to join, ask us for an invite.
          </p>
          <Link href="/" className="inline-block text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
            ← Back to CineFlow OS
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb / Top Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex min-h-11 sm:min-h-0 items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
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
            Provision your branded showcase, online booking calendar, and delivery paywall in 60 seconds.
          </p>
        </div>

        {/* Step Indicator Rail */}
        <div className="grid grid-cols-4 gap-2 border-b border-zinc-800 pb-4">
          {[
            { num: 1, title: "Studio Identity" },
            { num: 2, title: "Brand Styling" },
            { num: 3, title: "Owner Access" },
            { num: 4, title: "Review & Plan" },
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
            {googleMessage && (
              <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                {googleMessage}
              </div>
            )}
            {submitError && (
              <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-200">
                {submitError.message}
              </div>
            )}
            {/* STEP 1: IDENTITY & DISCIPLINE */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Studio Identity &amp; Discipline</h2>
                  <p className="text-xs text-zinc-400">Name your workspace and choose your creative focus.</p>
                </div>

                <div className="space-y-4">
                  {/* Invite code: during the beta, sign-up needs the code we hand out */}
                  {signup?.needsCode && !invite && (
                    <div className="space-y-1.5">
                      <label htmlFor="signup-code" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Invite code *
                      </label>
                      <input
                        id="signup-code"
                        type="text"
                        autoComplete="off"
                        placeholder="The code we sent you"
                        value={formData.signupCode ?? ""}
                        onChange={(e) => {
                          setCodeError(null);
                          setFormData((prev) => ({ ...prev, signupCode: e.target.value }));
                        }}
                        aria-invalid={codeError ? true : undefined}
                        aria-describedby={codeError ? "signup-code-error" : undefined}
                        className={`w-full px-3.5 py-2.5 rounded-lg border bg-[#18181b] text-white text-sm font-mono focus:outline-none focus:border-amber-500 transition-colors ${codeError ? "border-red-500" : "border-zinc-700"}`}
                        required
                      />
                      {codeError && (
                        <p id="signup-code-error" role="alert" className="text-xs text-red-400">
                          {codeError}
                        </p>
                      )}
                    </div>
                  )}

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
                        {subdomains ? "Studio address" : "Subpath URL Slug"} *
                      </label>
                      {slugChecking && (
                        <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                          <Loader2 className="size-3 animate-spin" /> checking...
                        </span>
                      )}
                      {addressChecked && slugStatus.available === true && (
                        <span className="text-[11px] text-emerald-400 font-mono">✓ Available</span>
                      )}
                      {addressChecked && slugStatus.available === false && (
                        <span className="text-[11px] text-red-400 font-mono">
                          ✕ {slugStatus.error || "Slug taken"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center rounded-lg border border-zinc-700 bg-[#18181b] overflow-hidden focus-within:border-amber-500">
                      {!subdomains && (
                        <span className="px-3 text-xs font-mono text-zinc-400 border-r border-zinc-800">
                          {APP_DOMAIN}/
                        </span>
                      )}
                      <input
                        type="text"
                        placeholder="velox-cinema"
                        value={formData.slug}
                        onChange={(e) => {
                          const typed = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                          // Emptied, it follows the name again.
                          setAddressEdited(typed !== "");
                          setFormData((prev) => ({ ...prev, slug: typed }));
                        }}
                        aria-label="Studio web address"
                        aria-invalid={addressChecked && slugStatus.available === false ? true : undefined}
                        className="w-full min-w-0 px-3 py-2 bg-transparent text-white text-sm font-mono focus:outline-none"
                        required
                      />
                      {subdomains && (
                        <span className="px-3 text-xs font-mono text-zinc-400 border-l border-zinc-800 whitespace-nowrap">
                          .{APP_DOMAIN}
                        </span>
                      )}
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
                                discipline: item.id as OnboardStudioInput["discipline"],
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

                  {/* Currency: Malaysian ringgit for now, so there is nothing to choose */}
                  <p className="text-xs text-zinc-400">
                    Prices, invoices and payments are in Malaysian ringgit (RM).
                  </p>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={!isStep1Valid || codeChecking}
                    onClick={continueFromStep1}
                    className={buttonVariants({ size: "lg" })}
                  >
                    {codeChecking ? "Checking…" : "Continue to Brand"}
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
                          className={`flex min-h-11 sm:min-h-0 items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
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

                  {/* Logo Upload */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Studio Logo (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="size-14 shrink-0 rounded-xl border border-zinc-700 bg-[#18181b] flex items-center justify-center overflow-hidden">
                        {formData.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={formData.logoUrl} alt="Studio logo" className="size-full object-contain" />
                        ) : (
                          <Camera className="size-5 text-zinc-400" />
                        )}
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                        className={`${buttonVariants({ variant: "secondary" })} min-h-11 sm:min-h-0`}
                      >
                        {logoUploading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Upload className="size-3.5" />
                        )}
                        {logoUploading ? "Uploading..." : formData.logoUrl ? "Replace Logo" : "Upload Logo"}
                      </button>
                      {formData.logoUrl && !logoUploading && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, logoUrl: "" }))}
                          className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-red-400"
                        >
                          <X className="size-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">PNG, JPG or WebP, up to 5MB.</p>
                  </div>
                </div>

                <div className="pt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => goBack(1)}
                    className="inline-flex min-h-11 items-center justify-center whitespace-nowrap px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 1
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    className={buttonVariants({ size: "lg" })}
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
                  {googleOn && !googleSignedIn && (
                    <div className="space-y-4">
                      <GoogleButton href={GOOGLE_SIGNUP_HREF} />
                      <OrDivider />
                    </div>
                  )}
                  {/* Owner Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Owner Full Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 size-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="e.g. Maya Lin"
                        value={formData.ownerName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerName: e.target.value }))}
                        onBlur={() => setNameTouched(true)}
                        aria-invalid={nameTouched && formData.ownerName.trim().length < 2 ? true : undefined}
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
                      <Mail className="absolute left-3.5 top-3 size-4 text-zinc-400" />
                      <input
                        type="email"
                        placeholder="e.g. maya@veloxcinema.com"
                        value={formData.ownerEmail}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerEmail: e.target.value }))}
                        onBlur={() => setEmailTouched(true)}
                        aria-invalid={(emailTouched && formData.ownerEmail !== "" && !isFullEmail(formData.ownerEmail)) || submitError?.field === "ownerEmail" ? true : undefined}
                        // Google confirmed this address, or the invite was sent to it: it can't be changed here.
                        readOnly={googleSignedIn || invite !== null}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500 read-only:text-zinc-400"
                        required
                      />
                    </div>
                  </div>

                  {/* Owner Password: not needed when Google confirmed the email */}
                  {googleSignedIn ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs text-emerald-300">
                      Signed in with Google. You won&apos;t need a password: you can add one later from the sign-in page.
                    </div>
                  ) : (
                    <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Password (min 8 chars) *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3 size-4 text-zinc-400" />
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="At least 8 characters"
                          value={formData.password}
                          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm focus:outline-none focus:border-amber-500"
                          autoComplete="new-password"
                          required
                        />
                        <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                      </div>
                      {invite && <p className="text-xs text-zinc-400">Your invite is for this email.</p>}
                      {(formData.password ?? "").length > 0 && (formData.password ?? "").length < 8 && (
                        <p className="text-xs text-rose-300">{8 - (formData.password ?? "").length} more characters needed</p>
                      )}
                      {emailTouched && formData.ownerEmail !== "" && !isFullEmail(formData.ownerEmail) && (
                        <p className="text-xs text-rose-300">Enter a full email address, like name@example.com</p>
                      )}
                      {nameTouched && formData.ownerName.trim().length < 2 && <p className="text-xs text-rose-300">Enter your full name</p>}
                    </div>
                    </>
                  )}

                  {/* Owner Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Contact Mobile (for WhatsApp dispatch)
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3 size-4 text-zinc-400" />
                      <input
                        type="tel"
                        placeholder="e.g. +60 12-345 6789"
                        value={formData.ownerPhone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ownerPhone: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => goBack(2)}
                    className="inline-flex min-h-11 items-center justify-center whitespace-nowrap px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 2
                  </button>
                  <button
                    type="button"
                    disabled={!isStep3Valid}
                    onClick={() => goToStep(4)}
                    className={buttonVariants({ size: "lg" })}
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
                  <h2 className="text-xl font-bold text-white tracking-tight">Review and choose your plan</h2>
                  <p className="text-xs text-zinc-400">Check your answers, then pick the plan you want after your free 14-day trial. The trial has everything included.</p>
                </div>

                <ReviewSummary
                  details={{
                    name: formData.name,
                    address: subdomains ? `${formData.slug}.${APP_DOMAIN}` : `${APP_DOMAIN}/${formData.slug}`,
                    discipline: disciplineLabel(formData.discipline),
                    tagline: formData.tagline ?? "",
                    ownerName: formData.ownerName,
                    ownerEmail: formData.ownerEmail,
                    ownerPhone: formData.ownerPhone ?? "",
                    google: googleSignedIn,
                  }}
                  onChange={goBack}
                />

                <div className="space-y-3">
                  {[
                    { id: "STARTER", name: PLANS.STARTER.name, price: `RM ${PLANS.STARTER.priceMyr}/mo`, detail: "Just you: your studio website, online booking, deposits and client galleries" },
                    { id: "PRO", name: PLANS.PRO.name, price: `RM ${PLANS.PRO.priceMyr}/mo`, detail: "Up to 5 team members, proposals, call sheets, your own domain" },
                    { id: "STUDIO_UNLIMITED", name: PLANS.STUDIO_UNLIMITED.name, price: `RM ${PLANS.STUDIO_UNLIMITED.priceMyr}/mo`, detail: "Unlimited team, wall-art visualizer and print orders, gear inventory" },
                  ].map((tier) => (
                    <button
                      type="button"
                      key={tier.id}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          subscriptionTier: tier.id as OnboardStudioInput["subscriptionTier"],
                          // Only the plan with wall art can choose not to sell prints: another plan starts with them on.
                          offersPrints: tier.id === "STUDIO_UNLIMITED" ? prev.offersPrints : true,
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
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500 text-black font-bold">
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

                {/* Framed prints (the wall-art plan only): set up by default; a studio that sells none skips them and can switch them on later */}
                {formData.subscriptionTier === "STUDIO_UNLIMITED" && (
                  <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-[#18181b] p-4 cursor-pointer has-[:checked]:border-amber-500/60">
                    <input
                      type="checkbox"
                      checked={formData.offersPrints === false}
                      onChange={(e) => setFormData((prev) => ({ ...prev, offersPrints: !e.target.checked }))}
                      className="mt-0.5 size-4 accent-amber-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">I don&apos;t sell framed prints</span>
                      <span className="block text-xs text-zinc-400 mt-0.5">
                        We&apos;ll skip the wall-art setup, and your clients won&apos;t see Wall Art. You can switch it on later in Settings.
                      </span>
                    </span>
                  </label>
                )}

                {/* Provisioning summary list */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-[#09090b] space-y-2 text-xs">
                  <span className="font-mono uppercase tracking-wider text-zinc-400">
                    Auto-Provisioned Digital Assets:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-zinc-300">
                    <div>✓ 4 Standard Campaign Categories</div>
                    {formData.offersPrints !== false && <div>✓ 3 Frame Moldings (Black, Walnut, Gold)</div>}
                    {formData.offersPrints !== false && <div>✓ 3 Wall Print Sizing Specs (8R, 12R, 16R)</div>}
                    <div>✓ 4 Proposal Add-On Templates</div>
                    <div>✓ 1 sample package (hidden until you switch it on)</div>
                    <div>✓ Clash-Free Online Booking Calendar</div>
                  </div>
                </div>

                <p className="pt-2 text-xs text-zinc-400">
                  By deploying your studio you agree to the{" "}
                  <Link href="/terms" target="_blank" className="text-amber-400 underline-offset-2 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and the{" "}
                  <Link href="/privacy" target="_blank" className="text-amber-400 underline-offset-2 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>

                <div className="pt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => goBack(3)}
                    className="inline-flex min-h-11 items-center justify-center whitespace-nowrap px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
                  >
                    ← Back to Step 3
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleSubmit}
                    className={buttonVariants({ size: "lg" })}
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
                  {formData.logoUrl ? (
                    <div className="size-12 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={formData.logoUrl} alt="Studio logo" className="size-full object-contain" />
                    </div>
                  ) : (
                    <div
                      className="size-12 rounded-xl flex items-center justify-center font-bold text-black text-lg shadow-md"
                      style={{ backgroundColor: formData.brandColor || "#f59e0b" }}
                    >
                      {formData.name.slice(0, 1).toUpperCase() || "C"}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {formData.name || "Your Studio Name"}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {formData.tagline || "Your tagline will show here. Leave it blank to show none."}
                    </p>
                  </div>
                </div>

                {/* Subdomain URL Badge */}
                <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span>URL:</span>
                  <span className="text-white">
                    {subdomains
                      ? `${formData.slug || "your-slug"}.${APP_DOMAIN}`
                      : `${APP_DOMAIN}/${formData.slug || "your-slug"}`}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-mono px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: `${formData.brandColor}50`,
                      backgroundColor: `${formData.brandColor}15`,
                      color: formData.brandColor,
                    }}
                  >
                    {disciplineLabel(formData.discipline)}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    Currency: {formData.currency}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    Plan after the trial: {PLANS[formData.subscriptionTier as keyof typeof PLANS]?.name ?? formData.subscriptionTier}
                  </span>
                </div>

                {/* Bio */}
                <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-3">
                  {formData.bio ||
                    "Your studio bio will show here. Leave it blank to show none."}
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
