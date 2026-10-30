"use client";

import { Sunrise, Sunset, Sun, Clock, Sparkles } from "lucide-react";
import type { SolarTimes } from "@/lib/solar";

interface SolarHudStripProps {
  solarTimes: SolarTimes;
  temperature?: string | null;
  weatherSummary?: string | null;
}

export function SolarHudStrip({
  solarTimes,
  temperature,
  weatherSummary,
}: SolarHudStripProps) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-96 h-28 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Header with Weather Tag */}
      <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Sun className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5">
              <span>Solar & Golden Hour Windows</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-medium">
                NOAA Pure Math
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Astronomical light timing for precision cinematography
            </p>
          </div>
        </div>

        {(weatherSummary || temperature) && (
          <div className="text-right">
            <div className="text-xs font-mono font-medium text-amber-400">
              {temperature || "Clear"}
            </div>
            <div className="text-[11px] text-zinc-400">
              {weatherSummary || "Clear conditions"}
            </div>
          </div>
        )}
      </div>

      {/* Grid of Key Solar Milestones */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
        {/* Sunrise */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono mb-1">
            <Sunrise className="size-3.5 text-amber-400" />
            <span>Sunrise</span>
          </div>
          <div className="text-lg font-bold text-white font-mono tracking-tight">
            {solarTimes.sunrise}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Civil Dawn: {solarTimes.dawn || "N/A"}</div>
        </div>

        {/* Morning Golden Hour */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 hover:border-amber-500/50 transition-colors relative overflow-hidden">
          <div className="absolute top-1 right-2 text-amber-400/30">
            <Sparkles className="size-4" />
          </div>
          <div className="flex items-center gap-1.5 text-amber-300 text-xs font-mono mb-1 font-semibold">
            <Clock className="size-3.5 text-amber-400" />
            <span>Morning Golden Hour</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-amber-400 font-mono tracking-tight">
            {solarTimes.goldenHourMorning}
          </div>
          <div className="text-[10px] text-amber-400/70 mt-0.5">Warm low-angle sidelight</div>
        </div>

        {/* Evening Golden Hour */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 hover:border-amber-500/50 transition-colors relative overflow-hidden">
          <div className="absolute top-1 right-2 text-amber-400/30">
            <Sparkles className="size-4" />
          </div>
          <div className="flex items-center gap-1.5 text-amber-300 text-xs font-mono mb-1 font-semibold">
            <Clock className="size-3.5 text-amber-400" />
            <span>Evening Golden Hour</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-amber-400 font-mono tracking-tight">
            {solarTimes.goldenHourEvening}
          </div>
          <div className="text-[10px] text-amber-400/70 mt-0.5">Dramatic sunset rimlight</div>
        </div>

        {/* Sunset */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono mb-1">
            <Sunset className="size-3.5 text-amber-400" />
            <span>Sunset</span>
          </div>
          <div className="text-lg font-bold text-white font-mono tracking-tight">
            {solarTimes.sunset}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Civil Dusk: {solarTimes.dusk || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}
