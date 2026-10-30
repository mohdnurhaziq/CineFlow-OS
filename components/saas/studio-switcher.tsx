"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Film, Camera, Sparkles, Calendar, ExternalLink } from "lucide-react";

interface StudioData {
  id: string;
  name: string;
  slug: string;
  discipline: string;
  tagline: string;
  currency: string;
  brandColor: string;
  bio: string;
  campaigns: Array<{ name: string; icon: string; count: string }>;
  featuredPackages: Array<{ name: string; price: string; turnaround: string }>;
}

const STUDIOS: StudioData[] = [
  {
    id: "lumina",
    name: "Lumina CineWorks",
    slug: "lumina-cine",
    discipline: "HYBRID",
    tagline: "Cinematic Narrative & High-End Visual Storytelling",
    currency: "USD",
    brandColor: "#f59e0b",
    bio: "Boutique production house specializing in luxury brand commercial campaigns and cinematic wedding documentaries.",
    campaigns: [
      { name: "Commercial & Brand", icon: "🎬", count: "4K Master Deliveries" },
      { name: "Weddings & Ceremonies", icon: "💍", count: "Multi-Angle Cinema" },
      { name: "Studio Portraits", icon: "📸", count: "Medium Format Editorial" },
    ],
    featuredPackages: [
      { name: "Cinematic Brand Hero Campaign", price: "$6,500.00", turnaround: "14 Days" },
      { name: "Heirloom Wedding Feature Film", price: "$3,800.00", turnaround: "21 Days" },
      { name: "Executive Editorial Portraiture", price: "$1,200.00", turnaround: "5 Days" },
    ],
  },
  {
    id: "apex",
    name: "Apex Photo & Motion",
    slug: "apex-media",
    discipline: "PHOTOGRAPHY",
    tagline: "Preserving Life's Defining Milestones",
    currency: "MYR",
    brandColor: "#06b6d4",
    bio: "Flagship portraiture studio specializing in University Convocation ceremonies and Hari Raya family heirloom sessions.",
    campaigns: [
      { name: "Convocation Specials", icon: "🎓", count: "Studio Cap & Gown" },
      { name: "Hari Raya Festive Special", icon: "🌙", count: "Syawal Homecoming" },
      { name: "Studio Portraiture", icon: "📸", count: "Family Heirloom" },
      { name: "Commercial Branding", icon: "🎬", count: "Corporate Headshots" },
    ],
    featuredPackages: [
      { name: "Convocation Studio Deluxe Session", price: "RM 450.00", turnaround: "7 Days" },
      { name: "Hari Raya Family Heirloom Session", price: "RM 850.00", turnaround: "10 Days" },
      { name: "Corporate Executive Headshot", price: "RM 300.00", turnaround: "3 Days" },
    ],
  },
];

export function StudioSwitcher() {
  const [activeStudioId, setActiveStudioId] = useState<string>("lumina");
  const activeStudio: StudioData = STUDIOS.find((s) => s.id === activeStudioId) ?? STUDIOS[0]!;

  return (
    <section id="studios" className="py-20 border-t border-zinc-800/60 bg-[#0c0c0f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Heading */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-400">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>LIVE MULTI-TENANT SWITCHBOARD</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Explore Flagship Production Studios
          </h2>
          <p className="text-zinc-400 text-base">
            Switch between real seeded demonstration studios to experience isolated branding, tailored campaign categories, and custom currencies.
          </p>
        </div>

        {/* Studio Switcher Buttons */}
        <div className="flex justify-center">
          <div className="inline-flex p-1.5 rounded-xl border border-zinc-800 bg-[#121215] shadow-lg">
            {STUDIOS.map((studio) => {
              const isActive = studio.id === activeStudioId;
              return (
                <button
                  key={studio.id}
                  onClick={() => setActiveStudioId(studio.id)}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                  }`}
                >
                  {studio.discipline === "HYBRID" ? <Film className="size-4" /> : <Camera className="size-4" />}
                  <span>{studio.name}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive ? "bg-black/20 text-black font-bold" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {studio.currency}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Studio Card Display */}
        <div className="max-w-4xl mx-auto rounded-2xl border border-zinc-800 bg-[#121215] p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all">
          <div
            className="absolute top-0 right-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none opacity-20"
            style={{ backgroundColor: activeStudio.brandColor }}
          />

          <div className="space-y-6 relative z-10">
            {/* Header with Name & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-white tracking-tight">{activeStudio.name}</h3>
                  <span
                    className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border"
                    style={{
                      borderColor: `${activeStudio.brandColor}40`,
                      backgroundColor: `${activeStudio.brandColor}15`,
                      color: activeStudio.brandColor,
                    }}
                  >
                    {activeStudio.discipline}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mt-1">{activeStudio.tagline}</p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/${activeStudio.slug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs sm:text-sm font-semibold transition-all"
                >
                  View Showcase
                  <ExternalLink className="size-3.5" />
                </Link>

                <Link
                  href={`/${activeStudio.slug}/book`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all"
                >
                  <Calendar className="size-3.5" />
                  Cinema Booking
                </Link>
              </div>
            </div>

            {/* Campaign Category Tags */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Campaign Category Specializations
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {activeStudio.campaigns.map((camp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{camp.icon}</span>
                      <span className="text-xs font-semibold text-zinc-200 line-clamp-1">{camp.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-1 font-mono">{camp.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Featured Packages Preview */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Sample Service Packages &amp; Pricing
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {activeStudio.featuredPackages.map((pkg, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-zinc-800 bg-[#16161b]">
                    <div className="text-xs text-zinc-300 font-medium line-clamp-1">{pkg.name}</div>
                    <div className="font-mono text-base font-bold text-amber-400 mt-1 tabular-nums">
                      {pkg.price}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 mt-0.5">Turnaround: {pkg.turnaround}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
