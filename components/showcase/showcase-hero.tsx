import { Sparkles, MapPin, Award } from "lucide-react";

interface ShowcaseHeroProps {
  tenant: {
    name: string;
    discipline: string;
    tagline?: string | null;
    bio?: string | null;
    brandColor?: string | null;
    currency: string;
  };
}

export function ShowcaseHero({ tenant }: ShowcaseHeroProps) {
  const brandColor = tenant.brandColor || "#f59e0b";

  return (
    <section className="relative pt-16 pb-12 sm:pt-20 sm:pb-16 overflow-hidden border-b border-zinc-800/60 bg-gradient-to-b from-[#121215] to-[#09090b]">
      {/* Background ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] rounded-full blur-[120px] pointer-events-none opacity-15"
        style={{ backgroundColor: brandColor }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6 text-center max-w-4xl mx-auto">
        {/* Status pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-mono text-zinc-300">
          <span className="size-2 rounded-full" style={{ backgroundColor: brandColor }} />
          <span>{tenant.discipline} CREATIVE STUDIO // {tenant.currency}</span>
        </div>

        {/* Studio Name & Tagline */}
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            {tenant.name}
          </h1>
          {tenant.tagline && (
            <p className="text-lg sm:text-xl text-zinc-400 font-light max-w-2xl mx-auto">
              {tenant.tagline}
            </p>
          )}
        </div>

        {/* Bio */}
        {tenant.bio && (
          <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            {tenant.bio}
          </p>
        )}

        {/* Quick studio accolades */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Award className="size-3.5 text-amber-400" />
            <span>Award-Winning Color Grading</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-cyan-400" />
            <span>4K Cinema &amp; Medium Format</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">10-Min</span>
            <span>Cinema Booking Hold Active</span>
          </div>
        </div>
      </div>
    </section>
  );
}
