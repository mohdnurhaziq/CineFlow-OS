import Link from "next/link";
import { ArrowLeft, LayoutDashboard, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";

interface PortalTopBarProps {
  tenant: { id: string; name: string; slug: string };
  /** Where "back" goes. Defaults to the studio's public page. */
  back?: { href: string; label: string };
  /** For staff, a more useful "back" (e.g. the admin project page). Used instead of `back` for staff. */
  staffBack?: { href: string; label: string };
  /** Width of the page below, so the bar lines up with it. */
  width?: "4xl" | "5xl" | "6xl" | "7xl";
}

const WIDTH = { "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", "7xl": "max-w-7xl" } as const;

/**
 * Slim top bar for client-facing pages that sit outside the account and admin shells
 * (checkout, proposal, call sheet, releases): a way back, plus the signed-in person's home.
 */
export async function PortalTopBar({ tenant, back, staffBack, width = "6xl" }: PortalTopBarProps) {
  const session = await getCurrentUser();
  const isStaff =
    !!session && STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenant.id);
  const isClient = session?.role === "CLIENT" && session.tenantId === tenant.id;
  const backLink = (isStaff && staffBack) || back || { href: `/${tenant.slug}`, label: tenant.name };

  return (
    <div className="border-b border-zinc-800/80 bg-[#121215]/80 backdrop-blur-md print:hidden">
      <div className={`${WIDTH[width]} mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between gap-3`}>
        <Link
          href={backLink.href}
          className="inline-flex items-center gap-1.5 min-h-11 text-xs font-mono text-zinc-400 hover:text-white transition-colors truncate"
        >
          <ArrowLeft className="size-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">{backLink.label}</span>
        </Link>
        {isStaff ? (
          <Link
            href={`/${tenant.slug}/admin`}
            className="inline-flex items-center gap-1.5 min-h-11 text-xs font-mono text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <LayoutDashboard className="size-3.5" aria-hidden="true" />
            Studio admin
          </Link>
        ) : isClient ? (
          <Link
            href={`/${tenant.slug}/account`}
            className="inline-flex items-center gap-1.5 min-h-11 text-xs font-mono text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <UserRound className="size-3.5" aria-hidden="true" />
            My account
          </Link>
        ) : null}
      </div>
    </div>
  );
}
