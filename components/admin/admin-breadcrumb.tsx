import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Omit for a crumb with no page of its own (a menu group such as "Finance") or the current page. */
  href?: string;
}

/**
 * Breadcrumb for admin detail pages, e.g. Finance › Invoices › INV-2026-001.
 * The last crumb is the current page. Long labels are truncated so it stays on one line on phones.
 */
export function AdminBreadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex items-center gap-1 text-xs font-mono text-zinc-500 min-w-0">
        {items.map((item, i) => {
          const isCurrent = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={cn("flex items-center gap-1", isCurrent ? "min-w-0" : "shrink-0")}>
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-zinc-600" aria-hidden="true" />}
              {isCurrent ? (
                <span aria-current="page" className="truncate text-zinc-200" title={item.label}>
                  {item.label}
                </span>
              ) : item.href ? (
                <Link href={item.href} className="text-zinc-400 hover:text-white transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
