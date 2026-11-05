"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/session";

interface ClientAccountMenuProps {
  tenantSlug: string;
  /** The signed-in client of this studio, or null when signed out. */
  client: { name: string; email: string } | null;
  /** Where to come back to after signing in (defaults to the current page). */
  returnTo?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Header control for clients: "My account" + sign out when signed in, otherwise "Sign in". */
export function ClientAccountMenu({ tenantSlug, client, returnTo }: ClientAccountMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!client) {
    const back = returnTo ?? `/${tenantSlug}`;
    return (
      <Link
        href={`/${tenantSlug}/login?callbackUrl=${encodeURIComponent(back)}`}
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
