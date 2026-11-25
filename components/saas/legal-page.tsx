import Link from "next/link";
import type { ReactNode } from "react";

/** The page shell for the Privacy Policy and Terms of Service: a title, a contents list, then the sections. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  children,
}: {
  title: string;
  /** e.g. "26 November 2026" */
  updated: string;
  intro: ReactNode;
  sections: { id: string; title: string }[];
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">Last updated {updated}</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">{title}</h1>
      <div className="mt-5 space-y-3 text-base leading-relaxed text-zinc-300">{intro}</div>

      <nav aria-label="On this page" className="mt-8 rounded-2xl border border-zinc-800 bg-[#121215] p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">On this page</p>
        <ol className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center gap-2 text-zinc-300 hover:text-amber-400 sm:min-h-8">
                <span className="font-mono text-xs text-zinc-500">{i + 1}.</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-12">{children}</div>

      <p className="mt-16 border-t border-zinc-800 pt-6 text-sm text-zinc-400">
        <Link href="/" className="text-amber-400 hover:text-amber-300">
          ← Back to CineFlow OS
        </Link>
      </p>
    </article>
  );
}

/** One numbered section. `number` is its place in the contents list. */
export function LegalSection({ id, number, title, children }: { id: string; number: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
        <span className="mr-2 font-mono text-base text-amber-400/90">{number}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-zinc-500">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
