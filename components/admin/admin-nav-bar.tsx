"use client";

import { useEffect, useRef, useState } from "react";
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
  CalendarCheck,
  Receipt,
} from "lucide-react";

interface AdminNavBarProps {
  tenantSlug: string;
  pendingVerificationCount: number;
}

export function AdminNavBar({ tenantSlug, pendingVerificationCount }: AdminNavBarProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // Which edges have more tabs scrolled out of view; those edges fade out as a hint.
  const [overflow, setOverflow] = useState({ left: false, right: false });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () =>
      setOverflow({
        left: nav.scrollLeft > 1,
        right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      });
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // Keep the current section's tab visible when it sits past the fold (e.g. Settings).
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  const fade = 32;
  const mask = `linear-gradient(to right, ${overflow.left ? "transparent" : "#000"} 0, #000 ${
    overflow.left ? fade : 0
  }px, #000 calc(100% - ${overflow.right ? fade : 0}px), ${overflow.right ? "transparent" : "#000"} 100%)`;

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
      href: `/${tenantSlug}/admin/bookings`,
      label: "Bookings",
      icon: CalendarCheck,
    },
    {
      href: `/${tenantSlug}/admin/invoices`,
      label: "Invoices",
      icon: Receipt,
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
    <nav
      ref={navRef}
      aria-label="Studio admin sections"
      className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap ${
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
