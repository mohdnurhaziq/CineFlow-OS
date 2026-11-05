"use client";

interface CinemaStageIndicatorProps {
  brandColor?: string | null;
}

export function CinemaStageIndicator({ brandColor }: CinemaStageIndicatorProps) {
  const color = brandColor || "#f59e0b";

  // The stage is the "screen"; the slot grid below is the seating.
  return (
    <div className="w-full max-w-3xl mx-auto my-6 text-center select-none" aria-hidden="true">
      <div
        className="h-1 rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color} 20%, ${color} 80%, transparent 100%)`,
          boxShadow: `0 8px 28px ${color}55`,
        }}
      />
      <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-mono tracking-[0.18em] uppercase text-zinc-400">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="sm:hidden">Main production stage</span>
        <span className="hidden sm:inline">Stage · Studio cyclorama wall &amp; main production stage</span>
      </div>
    </div>
  );
}
