"use client";

import Link from "next/link";
import { Camera, CalendarPlus, ArrowUpRight } from "lucide-react";
import { ClientNavBar } from "./client-nav-bar";
import { ClientUserNav } from "./client-user-nav";
import { disciplineLabel } from "@/lib/labels";

interface ClientAccountHeaderProps {
  tenant: {
    id?: string;
    name: string;
    slug: string;
    brandColor?: string | null;
    discipline?: string | null;
  };
  client: {
    name: string;
    email: string;
    phone?: string | null;
  };
  badges: {
    unpaidInvoices: number;
    activeBookings: number;
    projects: number;
    proposals: number;
  };
}

export function ClientAccountHeader({ tenant, client, badges }: ClientAccountHeaderProps) {
  const brandColor = tenant.brandColor || "#f59e0b";

  return (
    <header className="border-b border-zinc-800 bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tier 1: Studio Brand & Client Identity Bar */}
        <div className="h-16 flex items-center justify-between border-b border-zinc-800/60 gap-3">
          {/* Left: Studio Branding & Client Scope */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link
              href={`/${tenant.slug}/account`}
              className="flex items-center gap-2.5 group text-zinc-400 hover:text-white transition-colors min-w-0"
              title="Client Hub Overview"
            >
              <div
                className="size-8 rounded-lg flex items-center justify-center font-bold text-black text-xs shadow-md group-hover:scale-105 transition-transform flex-shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {tenant.name.slice(0, 1)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-tight text-white group-hover:text-amber-400 transition-colors truncate">
                  {tenant.name}
                </span>
                <span className="text-[10px] font-mono text-amber-400/90 uppercase tracking-widest">
                  Client portal
                </span>
              </div>
            </Link>

            {tenant.discipline && (
              <span className="hidden lg:inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700/80 truncate">
                {disciplineLabel(tenant.discipline)}
              </span>
            )}
          </div>

          {/* Right Header Actions: Quick Book, Public Showcase & Client Menu */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Link
              href={`/${tenant.slug}/book`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono tracking-wide transition-all shadow-sm shadow-amber-500/10"
            >
              <CalendarPlus className="size-3.5" />
              <span className="hidden sm:inline">Book Session</span>
              <span className="sm:hidden">Book</span>
            </Link>

            <Link
              href={`/${tenant.slug}`}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              <span>Showcase</span>
              <ArrowUpRight className="size-3 text-zinc-500" />
            </Link>

            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

            <ClientUserNav tenantSlug={tenant.slug} client={client} />
          </div>
        </div>

        {/* Tier 2: Persistent Client Navigation Tabs */}
        <div className="py-1">
          <ClientNavBar tenantSlug={tenant.slug} badges={badges} />
        </div>
      </div>
    </header>
  );
}
