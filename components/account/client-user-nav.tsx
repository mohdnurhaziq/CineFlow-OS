"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  LogOut,
  LayoutDashboard,
  FolderLock,
  CalendarClock,
  Receipt,
  ExternalLink,
  UserCheck,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/session";
import { signedOutHref } from "@/lib/auth/signed-out";

interface ClientUserNavProps {
  tenantSlug: string;
  client: {
    name: string;
    email: string;
    phone?: string | null;
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "C";
}

export function ClientUserNav({ tenantSlug, client }: ClientUserNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
      router.push(signedOutHref(`/${tenantSlug}/login`));
      router.refresh();
    });
  };

  const clientInitials = initials(client.name);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        aria-label={`Client account menu for ${client.name}`}
        className="group flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors outline-none cursor-pointer"
      >
        <div className="size-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs font-bold font-mono tracking-tight group-hover:scale-105 transition-transform">
          {clientInitials}
        </div>
        <div className="hidden md:flex flex-col text-left">
          <span className="text-xs font-semibold text-white max-w-[120px] truncate leading-tight">
            {client.name}
          </span>
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider leading-tight">
            Client
          </span>
        </div>
        <ChevronDown
          className={`size-3 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${
            open ? "rotate-180 text-amber-400" : ""
          }`}
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[240px] max-w-[280px] rounded-xl border border-zinc-800 bg-[#121215]/98 backdrop-blur-xl p-1.5 shadow-2xl shadow-black/80 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 focus:outline-none"
        >
          {/* User Profile Header */}
          <div className="px-3 py-2.5 border-b border-zinc-800/80 mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">{client.name}</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <UserCheck className="size-2.5" />
                Verified
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 truncate mt-0.5">{client.email}</div>
          </div>

          {/* Quick Account Navigation */}
          <div className="space-y-0.5">
            <DropdownMenu.Item asChild>
              <Link
                href={`/${tenantSlug}/account`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer outline-none transition-colors"
              >
                <LayoutDashboard className="size-3.5 text-zinc-400" />
                <span>Portal Overview</span>
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Item asChild>
              <Link
                href={`/${tenantSlug}/account?tab=projects`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer outline-none transition-colors"
              >
                <FolderLock className="size-3.5 text-zinc-400" />
                <span>Shoots & Vault</span>
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Item asChild>
              <Link
                href={`/${tenantSlug}/account?tab=bookings`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer outline-none transition-colors"
              >
                <CalendarClock className="size-3.5 text-zinc-400" />
                <span>My Bookings</span>
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Item asChild>
              <Link
                href={`/${tenantSlug}/account?tab=invoices`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer outline-none transition-colors"
              >
                <Receipt className="size-3.5 text-zinc-400" />
                <span>Billing & Invoices</span>
              </Link>
            </DropdownMenu.Item>
          </div>

          <div className="h-px bg-zinc-800/80 my-1" />

          {/* External Public Showcase Link */}
          <DropdownMenu.Item asChild>
            <Link
              href={`/${tenantSlug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer outline-none transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <ExternalLink className="size-3.5 text-zinc-400" />
                <span>Studio Showcase</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Public</span>
            </Link>
          </DropdownMenu.Item>

          <div className="h-px bg-zinc-800/80 my-1" />

          {/* Sign Out Action */}
          <DropdownMenu.Item asChild>
            <button
              type="button"
              disabled={isPending}
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer outline-none transition-colors disabled:opacity-50"
            >
              <LogOut className="size-3.5 text-rose-400" />
              <span>{isPending ? "Signing out..." : "Sign out"}</span>
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
