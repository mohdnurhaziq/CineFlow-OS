"use client";

import Link from "next/link";
import { MessageSquare, Calendar, Aperture, ArrowLeft } from "lucide-react";

interface ShowcaseNavProps {
  tenant: {
    name: string;
    slug: string;
    discipline: string;
    brandColor?: string | null;
  };
  studioLead?: {
    name: string;
    phone?: string | null;
  } | null;
}

export function ShowcaseNav({ tenant, studioLead }: ShowcaseNavProps) {
  const brandColor = tenant.brandColor || "#f59e0b";
  const whatsappNumber = studioLead?.phone ? studioLead.phone.replace(/[^0-9]/g, "") : "60123456789";
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    `Hello ${tenant.name}! I am exploring your CineFlow showcase and would like to inquire about booking a production session.`
  )}`;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#09090b]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Back to Platform Home"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <Link href={`/${tenant.slug}`} className="flex items-center gap-2.5 group">
            <div
              className="size-8 rounded-lg flex items-center justify-center font-bold text-black text-sm shadow-md transition-transform group-hover:scale-105"
              style={{ backgroundColor: brandColor }}
            >
              {tenant.name.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-white text-sm sm:text-base">
                  {tenant.name}
                </span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.2 rounded border"
                  style={{
                    borderColor: `${brandColor}40`,
                    backgroundColor: `${brandColor}15`,
                    color: brandColor,
                  }}
                >
                  {tenant.discipline}
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-[#121215] text-xs font-semibold text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
          >
            <MessageSquare className="size-3.5 text-emerald-400" />
            <span className="hidden sm:inline">WhatsApp Dispatch</span>
            <span className="sm:hidden">WhatsApp</span>
          </a>

          <Link
            href={`/${tenant.slug}/book`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-black shadow-lg active:scale-[0.98] transition-all"
            style={{
              backgroundColor: brandColor,
              boxShadow: `0 4px 14px ${brandColor}30`,
            }}
          >
            <Calendar className="size-3.5" />
            <span>Book Session</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
