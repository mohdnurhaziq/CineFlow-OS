"use client";

import { useState, useTransition } from "react";
import {
  FileCheck2,
  UserCheck,
  Building,
  CheckCircle2,
  Calendar,
  AlertCircle,
  FileSignature,
  Download,
  ExternalLink,
} from "lucide-react";
import { ReleaseSignaturePad } from "./release-signature-pad";
import { submitDigitalRelease } from "@/lib/actions/logistics";

export interface ExistingRelease {
  id: string;
  projectId: string;
  releaseType: string; // TALENT, LOCATION
  signerName: string;
  signerEmail: string;
  signerPhone?: string | null;
  signerRole?: string | null;
  termsContent: string;
  signatureDataUrl: string;
  signedAt: Date | string;
  notes?: string | null;
}

interface ReleaseFormShellProps {
  projectId: string;
  projectTitle: string;
  projectNumber: string;
  tenantSlug: string;
  studioName: string;
  existingReleases: ExistingRelease[];
}

const TALENT_DEFAULT_TERMS = `COMMERCIAL TALENT & LIKENESS APPEARANCE RELEASE

For valuable consideration received, I hereby grant to the Studio, its licensees, agents, and assigns, the irrevocable, unrestricted, worldwide, perpetual right and license to record, photograph, broadcast, reproduce, display, distribute, and otherwise exploit my name, likeness, image, voice, performance, and biographical materials in connection with the Production Project named herein, in any and all media now known or hereafter devised, for commercial, editorial, advertising, and promotional purposes.

I warrant and represent that I am at least 18 years of age (or have authorized parent/guardian consent), have the full legal capacity to execute this agreement, and release the Studio from any claims of defamation, invasion of privacy, or infringement of moral rights.`;

const LOCATION_DEFAULT_TERMS = `LOCATION FILMING & PROPERTY ACCESS AGREEMENT

The undersigned property owner / authorized custodian grants to the Studio, its crew, and production equipment, permission to enter, film, photograph, and record interior and exterior premises of the location specified in this Production. 

The Studio agrees to exercise reasonable commercial care during physical occupancy. The property owner confirms they have the legal right to grant filming access and waives any claims for reasonable production wear, background depiction, or architectural copyright in the completed works.`;

export function ReleaseFormShell({
  projectId,
  projectTitle,
  projectNumber,
  tenantSlug,
  studioName,
  existingReleases: initialReleases,
}: ReleaseFormShellProps) {
  const [releaseType, setReleaseType] = useState<"TALENT" | "LOCATION">("TALENT");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signerRole, setSignerRole] = useState(
    releaseType === "TALENT" ? "Principal Model / Talent" : "Property Owner / Manager"
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [notes, setNotes] = useState("");
  const [releases, setReleases] = useState<ExistingRelease[]>(initialReleases);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleTypeChange = (type: "TALENT" | "LOCATION") => {
    setReleaseType(type);
    setSignerRole(
      type === "TALENT" ? "Principal Model / Talent" : "Property Owner / Manager"
    );
  };

  const currentTerms = releaseType === "TALENT" ? TALENT_DEFAULT_TERMS : LOCATION_DEFAULT_TERMS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!signerName.trim()) {
      setErrorMessage("Please enter signer's legal name.");
      return;
    }
    if (!signerEmail.trim() || !signerEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!signatureDataUrl) {
      setErrorMessage("Digital legal signature is required on the canvas pad.");
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage("You must accept the legal agreement terms to execute.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitDigitalRelease({
          projectId,
          tenantSlug,
          releaseType,
          signerName,
          signerEmail,
          signerPhone: signerPhone || null,
          signerRole: signerRole || null,
          termsContent: currentTerms,
          signatureDataUrl,
          notes: notes || null,
        });

        if (res.success && res.release) {
          setSuccessMessage(
            `Release executed successfully for ${signerName} (${releaseType}).`
          );
          setReleases((prev) => [res.release as ExistingRelease, ...prev]);
          // Reset form
          setSignerName("");
          setSignerEmail("");
          setSignerPhone("");
          setSignatureDataUrl(null);
          setAgreedToTerms(false);
          setNotes("");
        } else {
          setErrorMessage(res.message || "Failed to submit digital release.");
        }
      } catch (err: any) {
        setErrorMessage(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
                {projectNumber}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {studioName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              On-Set Digital Releases & Clearances
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Legally binding touchscreen agreements for {projectTitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">Executed Releases:</span>
            <span className="text-sm font-bold font-mono text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              {releases.length} Signed
            </span>
          </div>
        </div>
      </div>

      {/* Main Dual-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Release Signing Form */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-xl space-y-5"
          >
            {/* Agreement Type Switcher */}
            <div>
              <label className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-2">
                1. Select Clearance Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange("TALENT")}
                  className={`min-h-[48px] px-4 py-3 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    releaseType === "TALENT"
                      ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <UserCheck className="size-4" />
                  <span>Talent & Likeness</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange("LOCATION")}
                  className={`min-h-[48px] px-4 py-3 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    releaseType === "LOCATION"
                      ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Building className="size-4" />
                  <span>Location Filming</span>
                </button>
              </div>
            </div>

            {/* Legal Agreement Clauses Box */}
            <div>
              <label className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-2">
                2. Legal Terms & Clearances
              </label>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 max-h-40 overflow-y-auto font-mono text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-all">
                {currentTerms}
              </div>
            </div>

            {/* Signatory Contact Details */}
            <div className="space-y-3">
              <label className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider block">
                3. Signatory Identification
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Legal Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="e.g. Sophia Bennett"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="sophia@agency.com"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={signerPhone}
                    onChange={(e) => setSignerPhone(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Role / Capacity
                  </label>
                  <input
                    type="text"
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value)}
                    placeholder="e.g. Lead Talent, Property Owner"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  On-Set Notes / Agency Ref (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Ford Models contract ref #8891; shoot day 1 only"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-amber-500 font-normal"
                />
              </div>
            </div>

            {/* Signature Pad */}
            <div>
              <label className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider block mb-2">
                4. Legal Digital Signature *
              </label>
              <ReleaseSignaturePad
                onSignatureChange={(dataUrl) => setSignatureDataUrl(dataUrl)}
                disabled={isPending}
              />
            </div>

            {/* Agreement Consent Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 size-4 accent-amber-500 rounded cursor-pointer"
              />
              <span className="text-xs text-zinc-300 leading-normal">
                I hereby declare that I have read, understood, and voluntarily execute this{" "}
                <strong className="text-white font-medium">
                  {releaseType === "TALENT" ? "Commercial Talent Release" : "Location Filming Agreement"}
                </strong>
                . My digital signature above constitutes an authentic and binding electronic signature.
              </span>
            </label>

            {/* Status Feedback Messages */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* 48px Minimum Touch Target Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full min-h-[48px] px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 select-none active:scale-[0.99]"
            >
              <FileCheck2 className="size-4" />
              <span>
                {isPending ? "Executing Legal Release..." : "Execute & Persist Digital Release"}
              </span>
            </button>
          </form>
        </div>

        {/* Right Column: Executed Releases Archive */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300">
                  <FileSignature className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Executed Clearances Archive
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Production audit trail for legal clearance
                  </p>
                </div>
              </div>
            </div>

            {releases.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs font-mono">
                No releases executed yet for this project.
              </div>
            ) : (
              <div className="space-y-3">
                {releases.map((rel) => {
                  const signedDate =
                    rel.signedAt instanceof Date
                      ? rel.signedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : String(rel.signedAt);

                  return (
                    <div
                      key={rel.id}
                      className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-colors space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-white">
                            {rel.signerName}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {rel.signerRole || "Signatory"} • {rel.signerEmail}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            rel.releaseType === "TALENT"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                          }`}
                        >
                          {rel.releaseType}
                        </span>
                      </div>

                      {/* Signature Preview */}
                      {rel.signatureDataUrl && (
                        <div className="rounded-lg border border-zinc-800 bg-[#070709] p-2 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={rel.signatureDataUrl}
                            alt={`${rel.signerName} signature`}
                            className="max-h-12 object-contain"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          <span>{signedDate}</span>
                        </span>
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="size-3" />
                          <span>Legally Bound</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
