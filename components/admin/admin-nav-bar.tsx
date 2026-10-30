"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Package,
  Calendar,
  FileText,
  Layers,
  Frame,
  Sparkles,
  Settings,
} from "lucide-react";

interface AdminNavBarProps {
  tenantSlug: string;
  pendingVerificationCount: number;
}

export function AdminNavBar({ tenantSlug, pendingVerificationCount }: AdminNavBarProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: `/${tenantSlug}/admin`,
      label: "Overview",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: `/${tenantSlug}/admin/verification`,
      label: "Verification",
      icon: Shield,
      badge: pendingVerificationCount > 0 ? pendingVerificationCount : null,
    },
    {
      href: `/${tenantSlug}/admin/services`,
      label: "Services",
      icon: Package,
    },
    {
      href: `/${tenantSlug}/admin/calendar`,
      label: "Calendar",
      icon: Calendar,
    },
    {
      href: `/${tenantSlug}/admin/proposals`,
      label: "Proposals",
      icon: FileText,
    },
    {
      href: `/${tenantSlug}/admin/inventory`,
      label: "Inventory",
      icon: Layers,
    },
    {
      href: `/${tenantSlug}/admin/frames`,
      label: "Frames",
      icon: Frame,
    },
    {
      href: `/${tenantSlug}/admin/cms`,
      label: "Showcase CMS",
      icon: Sparkles,
    },
    {
      href: `/${tenantSlug}/admin/settings`,
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1 scrollbar-none">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap ${
              isActive
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
            }`}
          >
            <Icon className={`size-3.5 ${isActive ? "text-amber-400" : "text-zinc-500"}`} />
            <span>{item.label}</span>
            {item.badge !== null && item.badge !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black ml-0.5">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
