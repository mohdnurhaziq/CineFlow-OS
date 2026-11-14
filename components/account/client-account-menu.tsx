"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/lib/auth/session";

interface ClientAccountMenuProps {
  tenantSlug: string;
  /** The signed-in client of this studio, or null when signed out. */
  client?: { name: string; email: string } | null;
  /** The signed-in staff/owner of this studio, or null if not staff. */
  staff?: { name: string; email?: string; role?: string } | null;
  /** Where to come back to after signing in (defaults to the current page). */
  returnTo?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Header control: "Studio Admin" when staff is signed in, "My account" when client is signed in, otherwise "Sign in". */
export function ClientAccountMenu({ tenantSlug, client, staff, returnTo }: ClientAccountMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (staff) {
    return (
      <div className="inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10">
        <Link
          href={`/${tenantSlug}/admin`}
          title={`Signed in as ${staff.name}`}
          aria-label={`Studio admin (signed in as ${staff.name})`}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-2.5 sm:pr-3 py-1.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded-l-lg text-xs font-semibold text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 transition-colors"
        >
          <ShieldCheck className="size-3.5 text-amber-400" />
          <span className="hidden sm:inline max-w-[10rem] truncate">{staff.name}</span>
          <span className="hidden sm:inline text-amber-400/80">· Studio Admin</span>
          <span className="sm:hidden font-mono text-[11px]">Admin</span>
        </Link>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await logoutAction();
              router.refresh();
            })
          }
          title="Sign out"
          aria-label="Sign out"
          className="inline-flex items-center justify-center px-2 py-1.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 self-stretch border-l border-amber-500/20 rounded-r-lg text-amber-400/80 hover:text-white hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  }

  if (!client) {
    const hasSpecificReturn =
      returnTo && returnTo !== `/${tenantSlug}` && returnTo !== `/${tenantSlug}/`;
    const loginHref = hasSpecificReturn
      ? `/${tenantSlug}/login?callbackUrl=${encodeURIComponent(returnTo)}`
      : `/${tenantSlug}/login`;
    return (
      <Link
        href={loginHref}
        aria-label="Sign in"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-11 sm:min-h-0 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-[#121215] text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
      >
        <LogIn className="size-3.5 text-amber-400" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-zinc-800 bg-[#121215]">
      <Link
        href={`/${tenantSlug}/account`}
        title={`Signed in as ${client.email}`}
        aria-label={`My account (signed in as ${client.name})`}
        className="inline-flex items-center gap-2 pl-1.5 pr-1.5 sm:pr-3 py-1 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded-l-lg text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-800/60 transition-colors"
      >
        <span
          aria-hidden
          className="size-6 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center justify-center"
        >
          {initials(client.name)}
        </span>
        <span className="hidden sm:inline max-w-[10rem] truncate">{client.name}</span>
        <span className="hidden sm:inline text-zinc-500">· My account</span>
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await logoutAction();
            router.refresh();
          })
        }
        title="Sign out"
        aria-label="Sign out"
        className="inline-flex items-center justify-center px-2 py-1.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 self-stretch border-l border-zinc-800 rounded-r-lg text-zinc-500 hover:text-white hover:bg-zinc-800/60 disabled:opacity-50 transition-colors"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
