import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The frame every signed-in page sits in, so padding and width are the same from page to page.
 *  - wide:     lists and dashboards
 *  - detail:   one record (a client, a booking, a gallery)
 *  - document: a single paper-width column (an invoice)
 */
const WIDTHS = {
  wide: "max-w-7xl",
  detail: "max-w-5xl",
  document: "max-w-3xl",
} as const;

interface PageShellProps {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}

export function PageShell({ width = "wide", className, children }: PageShellProps) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6", WIDTHS[width], className)}>
      {children}
    </div>
  );
}

interface BackLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

/** "← Bookings": the way back to the list a detail page came from. */
export function BackLink({ href, children, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 min-h-9 text-xs font-medium text-zinc-400 hover:text-white transition-colors print:hidden",
        className
      )}
    >
      <ArrowLeft className="size-3.5 text-amber-400" aria-hidden="true" />
      {children}
    </Link>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  /** One or two plain sentences on what the page is for. */
  description?: ReactNode;
  icon?: LucideIcon;
  /** Small line above the title, e.g. the studio name. */
  eyebrow?: ReactNode;
  /** Shown beside the title, e.g. a status badge. */
  badge?: ReactNode;
  /** Buttons on the right; the main action goes last. */
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}

/** The title block at the top of a page: same size, weight, spacing and divider everywhere. */
export function PageHeader({ title, description, icon: Icon, eyebrow, badge, actions, back, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="min-w-0">
          {eyebrow ? (
            <span className="block mb-1 text-[10px] font-mono uppercase tracking-widest text-amber-400">{eyebrow}</span>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 min-w-0">
              {Icon ? <Icon className="size-6 shrink-0 text-amber-400" aria-hidden="true" /> : null}
              <span className="break-words min-w-0">{title}</span>
            </h1>
            {badge}
          </div>
          {description ? <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** The one thing to do next, usually a button. */
  action?: ReactNode;
  className?: string;
}

/** What a list shows when it has nothing in it: what's missing and what to do about it. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-zinc-800 bg-[#121215]/60 px-6 py-12 flex flex-col items-center text-center gap-3",
        className
      )}
    >
      {Icon ? (
        <div className="size-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        {description ? <p className="text-xs text-zinc-400 max-w-sm mx-auto">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
