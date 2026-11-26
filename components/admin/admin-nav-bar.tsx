"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessMap } from "@/lib/auth/access";
import type { PlanFeature } from "@/lib/billing/plans";
import { visibleNavItems, type AdminNavEntry, type NavBadge } from "@/components/admin/admin-nav-items";

interface AdminNavBarProps {
  tenantSlug: string;
  /** What this person may open: items below their level are hidden. */
  access: AccessMap;
  /** The studio owner (or super-admin): Settings is theirs alone. */
  isOwner: boolean;
  pendingVerificationCount: number;
  /** Print orders paid (or free) and waiting for the studio to start. */
  newPrintOrderCount?: number;
  /** Features the studio's plan lacks: their menu items get a lock (they still open, to show how to upgrade). */
  lockedFeatures?: PlanFeature[];
}

type NavGroup = Extract<AdminNavEntry, { kind: "group" }>;

const topLinkClass = (active: boolean) =>
  cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border whitespace-nowrap",
    active
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-sm shadow-amber-500/10"
      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-transparent"
  );

export function AdminNavBar({ tenantSlug, access, isOwner, pendingVerificationCount, newPrintOrderCount = 0, lockedFeatures = [] }: AdminNavBarProps) {
  const isLocked = (feature?: PlanFeature) => !!feature && lockedFeatures.includes(feature);
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const entries = useMemo(() => visibleNavItems(tenantSlug, access, isOwner), [tenantSlug, access, isOwner]);
  const badgeOf = (badge: NavBadge | undefined): number | null => {
    const n = badge === "printOrders" ? newPrintOrderCount : badge === "verification" ? pendingVerificationCount : 0;
    return n > 0 ? n : null;
  };
  // A group's badge counts what its visible items show.
  const groupBadge = (group: NavGroup): number | null => {
    const n = group.items.reduce((sum, sub) => sum + (badgeOf(sub.badge) ?? 0), 0);
    return n > 0 ? n : null;
  };
  const isActive = (href: string, exact = false) => pathname === href || (!exact && pathname.startsWith(href + "/"));

  // The group the current page belongs to, for the one-click bar below the menu.
  const activeDomain =
    entries.find((e): e is NavGroup => e.kind === "group" && e.items.some((item) => isActive(item.href))) ?? null;

  return (
    <div className="space-y-2">
      {/* Primary Clean Navigation Bar */}
      <nav aria-label="Studio admin sections" className="flex items-center gap-1.5 flex-wrap">
        {entries.map((entry) => {
          if (entry.kind === "link") {
            const active = isActive(entry.href, entry.id === "overview");
            const LinkIcon = entry.icon;
            return (
              <Link
                key={entry.id}
                href={entry.href}
                data-tour={entry.tour}
                aria-current={active ? "page" : undefined}
                className={topLinkClass(active)}
              >
                <LinkIcon className={cn("size-3.5", active ? "text-amber-400" : "text-zinc-400")} />
                <span>{entry.label}</span>
              </Link>
            );
          }

          const domain = entry;
          const isDomainActive = activeDomain?.id === domain.id;
          const badge = groupBadge(domain);
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
                <DomainIcon className={cn("size-3.5", isDomainActive ? "text-amber-400" : "text-zinc-400")} />
                <span>{domain.label}</span>
                {badge !== null && (
                  <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500 text-black ml-0.5">
                    {badge}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3 text-zinc-400 transition-transform duration-200 ml-0.5",
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
                  <div className="px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                    <span>{domain.label}</span>
                    <span className="text-[11px] text-zinc-400 lowercase">{domain.items.length} tools</span>
                  </div>

                  <div className="space-y-0.5">
                    {domain.items.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = isActive(sub.href);
                      const subBadge = badgeOf(sub.badge);

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
                                {isLocked(sub.feature) && <Lock className="size-3 text-zinc-400 inline ml-1.5" aria-label="Not on your plan" />}
                                {subBadge !== null && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500 text-black">
                                    {subBadge}
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
      </nav>

      {/* Contextual Sub-Domain 1-Click Bar (Shown when inside Production, Finance, or Catalog) */}
      {activeDomain && (
        <div className="flex items-center gap-1 pt-1.5 pb-0.5 border-t border-zinc-800/50 overflow-x-auto scrollbar-none">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mr-1.5 flex-shrink-0">
            {activeDomain.label}:
          </span>
          <div className="flex items-center gap-1">
            {activeDomain.items.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = isActive(sub.href);
              const subBadge = badgeOf(sub.badge);

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
                  <SubIcon className={cn("size-3", isSubActive ? "text-amber-400" : "text-zinc-400")} />
                  <span>{sub.label}</span>
                  {isLocked(sub.feature) && <Lock className="size-3 text-zinc-400" aria-label="Not on your plan" />}
                  {subBadge !== null && (
                    <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500 text-black">
                      {subBadge}
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
