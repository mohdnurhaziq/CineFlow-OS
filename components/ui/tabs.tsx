import { cn } from "@/lib/utils";

/**
 * Two ways to switch what a page shows, used the same way everywhere:
 *
 *  - Section tabs: move between parts of a page (Packages / Categories, Equipment / Kits).
 *    Underlined, sit on a thin base line.
 *  - Filter chips: narrow a list (All / Unpaid / Paid). Outlined pills with an optional count.
 *
 * Solid amber is kept for the main action button, so a selected tab or chip never looks like one.
 */

/** The row the section tabs sit in. The base line is an inset shadow, so the active
 *  underline covers it without overflowing (which would show a scrollbar). */
export const tabListClass =
  "flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shadow-[inset_0_-1px_0_#27272a]";

export function tabClass(active: boolean, className?: string) {
  return cn(
    "shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0",
    active ? "border-amber-500 text-white [&_svg]:text-amber-400" : "border-transparent text-zinc-400 hover:text-white",
    className
  );
}

/** The row filter chips sit in; scrolls sideways on a phone instead of wrapping into a block. */
export const chipListClass = "flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1";

export function chipClass(active: boolean, className?: string) {
  return cn(
    "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border whitespace-nowrap transition-colors cursor-pointer",
    active
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border-zinc-800",
    className
  );
}

/** The count inside a chip. `alert` highlights a count that needs attention (e.g. awaiting verification). */
export function chipCountClass(active: boolean, alert = false) {
  return cn(
    "px-1.5 rounded-full text-[11px] tabular-nums",
    alert ? "bg-blue-500 text-white" : active ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-400"
  );
}
