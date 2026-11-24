import { EXTRAS, planBadge } from "@/lib/landing/content";
import { SplitHeading } from "@/components/landing/split-heading";

/** The smaller things, as a plain list. */
export function Extras() {
  return (
    <section aria-labelledby="extras-h" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SplitHeading text="And the rest of" accent="the day-to-day." className="max-w-2xl text-[clamp(2.25rem,5vw,4rem)]" />
        <h2 id="extras-h" className="sr-only">
          Everything else
        </h2>
        <ul className="mt-14 divide-y divide-zinc-800 border-y border-zinc-800">
          {EXTRAS.map((e) => {
            const badge = planBadge(e.feature);
            return (
              <li key={e.title} data-reveal className="grid gap-2 py-6 sm:grid-cols-12 sm:items-baseline sm:gap-8">
                <h3 className="font-[family-name:var(--font-display)] text-2xl text-white sm:col-span-4">{e.title}</h3>
                <p className="text-zinc-400 sm:col-span-6">{e.body}</p>
                <p className="sm:col-span-2 sm:text-right">
                  {badge && <span className="font-mono text-[11px] uppercase tracking-wider text-amber-300">{badge}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
