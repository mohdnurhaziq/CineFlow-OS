import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Lightbulb, type LucideIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { studioPath } from "@/lib/domain-name";

/**
 * Building blocks for admin manual pages, so every page reads the same way: sections with
 * anchors, plain paragraphs, numbered steps, tables and call-outs. Server components only.
 */

interface ManualSectionProps {
  /** Anchor for the page's "On this page" list. */
  id: string;
  title: string;
  children: ReactNode;
}

export function ManualSection({ id, title, children }: ManualSectionProps) {
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function ManualP({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-zinc-300">{children}</p>;
}

/** A label exactly as it appears on screen (a button, a status, a menu item). */
export function Ui({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-white whitespace-nowrap">{children}</span>;
}

export function ManualList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-zinc-300 list-disc pl-5 marker:text-amber-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function ManualSteps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
          <span
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-mono font-bold flex items-center justify-center"
          >
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

interface ManualCalloutProps {
  tone?: "tip" | "warning";
  title: string;
  children: ReactNode;
}

export function ManualCallout({ tone = "tip", title, children }: ManualCalloutProps) {
  const Icon = tone === "warning" ? AlertTriangle : Lightbulb;
  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex gap-3",
        tone === "warning" ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-[#121215]"
      )}
    >
      <Icon className={cn("size-4 shrink-0 mt-0.5", tone === "warning" ? "text-amber-400" : "text-emerald-400")} aria-hidden="true" />
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <div className="text-sm leading-relaxed text-zinc-300">{children}</div>
      </div>
    </div>
  );
}

interface ManualTableProps {
  head: string[];
  rows: ReactNode[][];
}

export function ManualTable({ head, rows }: ManualTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm text-left">
        <thead className="bg-[#121215] text-[11px] font-mono uppercase tracking-wider text-zinc-400">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-4 py-3 leading-relaxed", j === 0 ? "text-white font-medium" : "text-zinc-300")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A question with its answer, for the "Common questions" part of a page. */
export function ManualQa({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-white">{question}</h3>
      <div className="text-sm leading-relaxed text-zinc-300 space-y-2">{children}</div>
    </div>
  );
}

/** "On this page": jump links to a page's sections. */
export function ManualContents({ items }: { items: { id: string; title: string }[] }) {
  return (
    <nav aria-label="On this page" className="rounded-xl border border-zinc-800 bg-[#121215] p-4">
      <p className="text-[11px] font-mono uppercase tracking-widest text-amber-400 mb-2">On this page</p>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="text-zinc-300 hover:text-white transition-colors">
              <span className="font-mono text-xs text-zinc-400 mr-2">{String(i + 1).padStart(2, "0")}</span>
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A link to another admin page or manual page, inside manual text. */
export function ManualLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-amber-400 hover:underline whitespace-nowrap">
      {children}
    </Link>
  );
}

/** A bold phrase inside manual text. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="text-white">{children}</strong>;
}

interface ManualPageProps {
  tenantSlug: string;
  icon: LucideIcon;
  /** The part of the admin console the page belongs to, e.g. "Payments". */
  area: string;
  title: string;
  description: string;
  sections: { id: string; title: string }[];
  children: ReactNode;
}

/** The frame every manual topic page shares: header, way back to the manual, "On this page". */
export function ManualPage({ tenantSlug, icon, area, title, description, sections, children }: ManualPageProps) {
  return (
    <PageShell width="document">
      <PageHeader
        icon={icon}
        eyebrow={`Manual · ${area}`}
        title={title}
        description={description}
        back={{ href: studioPath(tenantSlug, "/admin/manual"), label: "Manual" }}
      />
      <ManualContents items={sections} />
      {children}
    </PageShell>
  );
}
