"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, LogIn, PlayCircle } from "lucide-react";
import { logoutAction, type SessionUser } from "@/lib/auth/session";
import { signedOutHref } from "@/lib/auth/signed-out";
import { studioPath } from "@/lib/domain-name";
import { SessionMenu } from "@/components/auth/session-menu";
import type { SwitcherEntry } from "@/lib/auth/switcher";

interface AdminUserNavProps {
  tenantSlug: string;
  user: SessionUser | null;
  /** Shown under the name: "Studio owner", the team member's role, or the account type. */
  roleLabel?: string;
  /** The person's studios (empty unless they have a login). */
  switcher?: SwitcherEntry[];
}

export function AdminUserNav({ tenantSlug, user, roleLabel, switcher = [] }: AdminUserNavProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
    router.push(signedOutHref(studioPath(tenantSlug, "/login")));
    router.refresh();
  };

  if (!user) {
    return (
      <Link
        href={studioPath(tenantSlug, "/login")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
      >
        <LogIn className="size-3.5" />
        <span>Studio Login</span>
      </Link>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <div data-tour="account" className="flex items-center gap-2.5">
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-amber-400">
          {initials}
        </div>
        <div className="hidden md:flex flex-col text-left">
          <span className="text-xs font-medium text-white line-clamp-1">{user.name}</span>
          <span className="text-[9px] font-mono text-zinc-400 uppercase">{roleLabel ?? user.role.replace(/_/g, " ")}</span>
        </div>
      </div>

      <Link
        href={studioPath(tenantSlug, "/admin?tour=1")}
        title="Take the tour"
        aria-label="Take the tour"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <PlayCircle className="size-3.5" />
      </Link>

      <SessionMenu tenantSlug={tenantSlug} entries={switcher} />

      <button
        type="button"
        onClick={handleLogout}
        title="Sign Out"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
