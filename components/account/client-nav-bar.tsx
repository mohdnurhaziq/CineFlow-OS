"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FolderLock,
  CalendarClock,
  Receipt,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientNavBarProps {
  tenantSlug: string;
  badges: {
    unpaidInvoices: number;
    activeBookings: number;
    projects: number;
    proposals: number;
  };
}

export function ClientNavBar({ tenantSlug, badges }: ClientNavBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");

  const isInvoiceSubPage = pathname.startsWith(`/${tenantSlug}/account/invoices`);
  const isBaseAccount = pathname === `/${tenantSlug}/account`;

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      href: `/${tenantSlug}/account`,
      icon: LayoutDashboard,
      isActive: isBaseAccount && (!currentTab || currentTab === "overview"),
      badge: null,
      badgeVariant: "default" as const,
    },
    {
      id: "projects",
      label: "Shoots & Vault",
      href: `/${tenantSlug}/account?tab=projects`,
      icon: FolderLock,
      isActive: isBaseAccount && currentTab === "projects",
      badge: badges.projects > 0 ? badges.projects : null,
      badgeVariant: "default" as const,
    },
    {
      id: "bookings",
      label: "My Bookings",
      href: `/${tenantSlug}/account?tab=bookings`,
      icon: CalendarClock,
      isActive: isBaseAccount && currentTab === "bookings",
      badge: badges.activeBookings > 0 ? `${badges.activeBookings}` : null,
      badgeVariant: "default" as const,
    },
    {
      id: "invoices",
      label: "Invoices & Receipts",
      href: `/${tenantSlug}/account?tab=invoices`,
      icon: Receipt,
      isActive: isInvoiceSubPage || (isBaseAccount && currentTab === "invoices"),
      badge: badges.unpaidInvoices > 0 ? `${badges.unpaidInvoices} Due` : null,
      badgeVariant: "action" as const,
    },
    ...(badges.proposals > 0
      ? [
          {
            id: "proposals",
            label: "Proposals",
            href: `/${tenantSlug}/account?tab=proposals`,
            icon: FileText,
            isActive: isBaseAccount && currentTab === "proposals",
            badge: badges.proposals,
            badgeVariant: "default" as const,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Client portal navigation" className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.isActive;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap",
              isActive
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
            )}
          >
            <Icon className={cn("size-3.5", isActive ? "text-amber-400" : "text-zinc-500")} />
            <span>{tab.label}</span>
            {tab.badge !== null && tab.badge !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono tracking-tight",
                  tab.badgeVariant === "action"
                    ? "bg-amber-500 text-black shadow-xs shadow-amber-500/50"
                    : "bg-zinc-800 text-zinc-300 border border-zinc-700/80"
                )}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
