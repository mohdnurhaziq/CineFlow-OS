"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Copy,
  Check,
  MapPin,
  Car,
  HeartPulse,
  Printer,
  FileSignature,
  Calendar,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Info,
} from "lucide-react";
import type { SolarTimes } from "@/lib/solar";
import { SolarHudStrip } from "./solar-hud-strip";
import { CrewRosterCard } from "./crew-roster-card";
import { ShotListHud, type ShotItemData } from "./shot-list-hud";

export interface CallSheetDetails {
  id: string;
  projectId: string;
  title: string;
  shootDate: Date | string;
  generalCallTime: string;
  locationName: string;
  locationAddress: string;
  locationPinUrl?: string | null;
  parkingNotes?: string | null;
  hospitalName?: string | null;
  hospitalAddress?: string | null;
  weatherSummary?: string | null;
  temperature?: string | null;
  sunriseTime?: string | null;
  sunsetTime?: string | null;
  goldenHourMorning?: string | null;
  goldenHourEvening?: string | null;
  notes?: string | null;
  crewJson?: string | null;
  project: {
    id: string;
    title: string;
    projectNumber: string;
    discipline: string;
    status: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
    shotItems: ShotItemData[];
  };
}

interface CallSheetShellProps {
  callSheet: CallSheetDetails;
  solarTimes: SolarTimes;
  whatsappUrl: string;
  whatsappPreview: string;
}

export function CallSheetShell({
  callSheet,
  solarTimes,
  whatsappUrl,
  whatsappPreview,
}: CallSheetShellProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(whatsappPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formattedDate =
    callSheet.shootDate instanceof Date
      ? callSheet.shootDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : String(callSheet.shootDate);

  const tenantSlug = callSheet.project.tenant.slug;
  const projectId = callSheet.project.id;

  return (
    <div className="space-y-6">
      {/* Set Companion Header */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-80 h-32 bg-amber-500/5 blur-3xl pointer-events-none rounded-full" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                {callSheet.project.projectNumber}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                {callSheet.project.tenant.name}
              </span>
              <span className="text-xs text-zinc-600">•</span>
              <span className="text-xs font-mono text-emerald-400">
                ON-SET ACTIVE COMPANION
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              {callSheet.title}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-zinc-500" />
                <span>{formattedDate}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-amber-400 font-bold">
                <Clock className="size-3.5 text-amber-400" />
                <span>General Call: {callSheet.generalCallTime}</span>
              </span>
            </p>
          </div>

          {/* Quick Action Dispatch Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1-Click WhatsApp Dispatch Button */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer active:scale-95"
            >
              <MessageSquare className="size-4 fill-black" />
              <span>1-Click WhatsApp Dispatch</span>
            </a>

            {/* Copy Dispatch Summary */}
            <button
              type="button"
              onClick={handleCopySummary}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-zinc-400" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            {/* Digital Releases Link */}
            <Link
              href={`/${tenantSlug}/releases/${projectId}`}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-amber-400 hover:border-amber-500/40 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <FileSignature className="size-3.5" />
              <span>Digital Releases</span>
            </Link>

            {/* Print Friendly */}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Print Call Sheet"
            >
              <Printer className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Solar & Golden Hour Calculation Engine Strip */}
      <SolarHudStrip
        solarTimes={solarTimes}
        temperature={callSheet.temperature}
        weatherSummary={callSheet.weatherSummary}
      />

      {/* Logistics & Safety Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Location & Map Directions */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
              <MapPin className="size-4" />
              <span className="font-semibold uppercase tracking-wider">Filming Location</span>
            </div>
            <h4 className="text-base font-bold text-white leading-snug">
              {callSheet.locationName}
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {callSheet.locationAddress}
            </p>
          </div>

          {callSheet.locationPinUrl && (
            <div className="mt-4 pt-3 border-t border-zinc-800/80">
              <a
                href={callSheet.locationPinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-amber-400 hover:text-amber-300 hover:underline"
              >
                <span>Open Google Maps Pin</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>

        {/* Card 2: Parking & Basecamp Notes */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-2">
              <Car className="size-4 text-zinc-300" />
              <span className="font-semibold uppercase tracking-wider">Parking & Basecamp</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {callSheet.parkingNotes || "Free on-site parking at facility lot. Loading dock available for grip van."}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
            <Info className="size-3" />
            <span>Heavy equipment unload at Bay 2</span>
          </div>
        </div>

        {/* Card 3: Emergency Medical Hospital */}
        <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-red-400 mb-2">
              <HeartPulse className="size-4" />
              <span className="font-semibold uppercase tracking-wider">Nearest Emergency Hospital</span>
            </div>
            <h4 className="text-sm font-bold text-white leading-snug">
              {callSheet.hospitalName || "Emergency Hospital"}
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {callSheet.hospitalAddress || "Dial 911 in emergency"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-red-500/20 flex items-center gap-1.5 text-[11px] font-mono text-red-400">
            <ShieldAlert className="size-3" />
            <span>24/7 Level 1 Trauma Care</span>
          </div>
        </div>
      </div>

      {/* Crew Roster & Call Schedule */}
      <CrewRosterCard
        crewJson={callSheet.crewJson}
        generalCallTime={callSheet.generalCallTime}
      />

      {/* Mobile Shot List HUD with 48px Touch Targets */}
      <ShotListHud
        initialShots={callSheet.project.shotItems}
        tenantSlug={tenantSlug}
      />

      {/* Production Notes */}
      {callSheet.notes && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
          <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
            <Info className="size-3.5 text-amber-400" />
            <span>Production Notes & On-Set Protocol</span>
          </h4>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
            {callSheet.notes}
          </p>
        </div>
      )}
    </div>
  );
}
