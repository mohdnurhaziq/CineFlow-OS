import { disciplineLabel } from "@/lib/labels";

interface ShowcaseIntroProps {
  tenant: {
    name: string;
    discipline: string;
    tagline?: string | null;
    bio?: string | null;
    brandColor?: string | null;
  };
}

/**
 * Who the studio is, right under the portfolio slider (the slider is the first thing a visitor sees).
 * It holds the page's one h1.
 */
export function ShowcaseIntro({ tenant }: ShowcaseIntroProps) {
  const brandColor = tenant.brandColor || "#f59e0b";

  return (
    <section aria-labelledby="studio-name" className="grid gap-6 border-b border-zinc-800/60 pb-12 lg:grid-cols-12 lg:gap-12">
      <div className="space-y-4 lg:col-span-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-mono text-zinc-300">
          <span className="size-2 rounded-full" style={{ backgroundColor: brandColor }} />
          <span>{disciplineLabel(tenant.discipline)} studio</span>
        </div>
        <h1 id="studio-name" className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          {tenant.name}
        </h1>
        {tenant.tagline && <p className="max-w-2xl text-lg sm:text-xl font-light text-zinc-400">{tenant.tagline}</p>}
      </div>

      <div className="space-y-4 lg:col-span-5 lg:pt-9">
        {tenant.bio && <p className="text-sm leading-relaxed text-zinc-400">{tenant.bio}</p>}
        {/* Booking promise (true of every studio; no studio-specific claims here) */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-zinc-400">
          <span className="font-bold text-emerald-400">Online Booking</span>
          <span>Pick a date and time that suits you</span>
        </p>
      </div>
    </section>
  );
}
