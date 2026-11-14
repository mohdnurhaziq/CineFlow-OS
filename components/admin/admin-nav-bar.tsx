"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  LayoutDashboard,
  Clapperboard,
  CalendarCheck,
  Calendar,
  Layers,
  Receipt,
  Shield,
  FileText,
  Package,
  Frame,
  Sparkles,
  Settings,
  ChevronDown,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminNavBarProps {
  tenantSlug: string;
  pendingVerificationCount: number;
}

interface NavSubItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

interface NavDomain {
  id: "production" | "finance" | "catalog";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavSubItem[];
  badge?: number | null;
}

export function AdminNavBar({ tenantSlug, pendingVerificationCount }: AdminNavBarProps) {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const domains: NavDomain[] = useMemo(
    () => [
      {
        id: "production",
        label: "Production",
        icon: Clapperboard,
        items: [
          {
            href: `/${tenantSlug}/admin/projects`,
            label: "Projects",
            description: "Cockpit, shot lists, Set HUD & vault deliverables",
            icon: Clapperboard,
          },
          {
            href: `/${tenantSlug}/admin/bookings`,
            label: "Bookings",
            description: "Client session appointments, deposits & statuses",
            icon: CalendarCheck,
          },
          {
            href: `/${tenantSlug}/admin/calendar`,
            label: "Calendar",
            description: "Shoot dates, slot times & schedule generator",
            icon: Calendar,
          },
          {
            href: `/${tenantSlug}/admin/inventory`,
            label: "Gear & Fleet",
            description: "Equipment inventory, kit bundles & barcode scans",
            icon: Layers,
          },
        ],
      },
      {
        id: "finance",
        label: "Finance",
        icon: Receipt,
        badge: pendingVerificationCount > 0 ? pendingVerificationCount : null,
        items: [
          {
            href: `/${tenantSlug}/admin/invoices`,
            label: "Invoices",
            description: "Milestone invoices, payment receipts & balances",
            icon: Receipt,
          },
          {
            href: `/${tenantSlug}/admin/verification`,
            label: "Verification",
            description: "Offline QR receipts & bank transfer approvals",
            icon: Shield,
            badge: pendingVerificationCount > 0 ? pendingVerificationCount : null,
          },
          {
            href: `/${tenantSlug}/admin/proposals`,
            label: "Proposals",
            description: "Client quotes, custom scopes & digital contracts",
            icon: FileText,
          },
        ],
      },
      {
        id: "catalog",
        label: "Catalog & CMS",
        icon: Package,
        items: [
          {
            href: `/${tenantSlug}/admin/services`,
            label: "Services",
            description: "Package tiers, pricing & campaign categories",
            icon: Package,
          },
          {
            href: `/${tenantSlug}/admin/frames`,
            label: "Frames & Prints",
            description: "Fine art sizes, frame finishes & print labs",
            icon: Frame,
          },
          {
            href: `/${tenantSlug}/admin/cms`,
            label: "Showcase CMS",
            description: "Public landing hero, featured work & portfolio",
            icon: Sparkles,
          },
        ],
      },
    ],
    [tenantSlug, pendingVerificationCount]
  );

  // Determine active domain
  const activeDomain = useMemo(() => {
    for (const d of domains) {
      if (d.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))) {
        return d;
      }
    }
    return null;
  }, [domains, pathname]);

  const isOverviewActive = pathname === `/${tenantSlug}/admin`;
  const clientsHref = `/${tenantSlug}/admin/clients`;
  const isClientsActive = pathname === clientsHref || pathname.startsWith(clientsHref + "/");
  const isSettingsActive =
    pathname === `/${tenantSlug}/admin/settings` || pathname.startsWith(`/${tenantSlug}/admin/settings/`);

  return (
    <div className="space-y-2">
      {/* Primary Clean Navigation Bar */}
      <nav aria-label="Studio admin sections" className="flex items-center gap-1.5 flex-wrap">
        {/* 1. Overview */}
        <Link
          href={`/${tenantSlug}/admin`}
          aria-current={isOverviewActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap",
            isOverviewActive
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
          )}
        >
          <LayoutDashboard className={cn("size-3.5", isOverviewActive ? "text-amber-400" : "text-zinc-500")} />
          <span>Overview</span>
        </Link>

        {/* Clients: their own tab, since a client spans bookings, projects and invoices */}
        <Link
          href={clientsHref}
          aria-current={isClientsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap",
            isClientsActive
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
          )}
        >
          <Users className={cn("size-3.5", isClientsActive ? "text-amber-400" : "text-zinc-500")} />
          <span>Clients</span>
        </Link>

        {/* 2, 3, 4. Domain Dropdown Groups */}
        {domains.map((domain) => {
          const isDomainActive = activeDomain?.id === domain.id;
          const DomainIcon = domain.icon;
          const isOpen = openDropdown === domain.id;

          return (
            <DropdownMenu.Root
              key={domain.id}
              open={isOpen}
              onOpenChange={(open) => setOpenDropdown(open ? domain.id : null)}
            >
              <DropdownMenu.Trigger
                data-tour={`nav-${domain.id}`}
                className={cn(
                  "group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border outline-none select-none whitespace-nowrap",
                  isDomainActive
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent focus-visible:border-zinc-700"
                )}
              >
                <DomainIcon className={cn("size-3.5", isDomainActive ? "text-amber-400" : "text-zinc-500")} />
                <span>{domain.label}</span>
                {domain.badge !== null && domain.badge !== undefined && domain.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black ml-0.5">
                    {domain.badge}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3 text-zinc-500 transition-transform duration-200 ml-0.5",
                    isOpen && "rotate-180 text-amber-400"
                  )}
                />
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="z-50 min-w-[270px] max-w-[320px] rounded-xl border border-zinc-800 bg-[#121215]/98 backdrop-blur-xl p-1.5 shadow-2xl shadow-black/80 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 focus:outline-none"
                >
                  <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                    <span>{domain.label}</span>
                    <span className="text-[9px] text-zinc-400 lowercase">{domain.items.length} tools</span>
                  </div>

                  <div className="space-y-0.5">
                    {domain.items.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = pathname === sub.href || pathname.startsWith(sub.href + "/");

                      return (
                        <DropdownMenu.Item asChild key={sub.href}>
                          <Link
                            href={sub.href}
                            onClick={() => setOpenDropdown(null)}
                            className={cn(
                              "flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer outline-none",
                              isSubActive
                                ? "bg-amber-500/10 text-white font-medium border border-amber-500/20"
                                : "text-zinc-300 hover:text-white hover:bg-zinc-800/80 focus:bg-zinc-800/80 border border-transparent"
                            )}
                          >
                            <div
                              className={cn(
                                "size-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border",
                                isSubActive
                                  ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                                  : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                              )}
                            >
                              <SubIcon className="size-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white tracking-tight">{sub.label}</span>
                                {sub.badge !== null && sub.badge !== undefined && sub.badge > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black">
                                    {sub.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5 font-sans">
                                {sub.description}
                              </p>
                            </div>
                          </Link>
                        </DropdownMenu.Item>
                      );
                    })}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        })}

        {/* 5. Settings */}
        <Link
          href={`/${tenantSlug}/admin/settings`}
          data-tour="nav-settings"
          aria-current={isSettingsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap",
            isSettingsActive
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
          )}
        >
          <Settings className={cn("size-3.5", isSettingsActive ? "text-amber-400" : "text-zinc-500")} />
          <span>Settings</span>
        </Link>
      </nav>

      {/* Contextual Sub-Domain 1-Click Bar (Shown when inside Production, Finance, or Catalog) */}
      {activeDomain && (
        <div className="flex items-center gap-1 pt-1.5 pb-0.5 border-t border-zinc-800/50 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mr-1.5 flex-shrink-0">
            {activeDomain.label}:
          </span>
          <div className="flex items-center gap-1">
            {activeDomain.items.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = pathname === sub.href || pathname.startsWith(sub.href + "/");

              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border whitespace-nowrap",
                    isSubActive
                      ? "bg-zinc-800 text-amber-400 border-zinc-700 font-semibold shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border-transparent"
                  )}
                >
                  <SubIcon className={cn("size-3", isSubActive ? "text-amber-400" : "text-zinc-500")} />
                  <span>{sub.label}</span>
                  {sub.badge !== null && sub.badge !== undefined && sub.badge > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-black">
                      {sub.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
