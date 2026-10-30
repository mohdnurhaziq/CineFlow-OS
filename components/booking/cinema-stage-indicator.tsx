"use client";

interface CinemaStageIndicatorProps {
  brandColor?: string | null;
}

export function CinemaStageIndicator({ brandColor }: CinemaStageIndicatorProps) {
  const color = brandColor || "#f59e0b";

  return (
    <div className="relative w-full max-w-3xl mx-auto my-8 text-center select-none">
      {/* Top ambient arc */}
      <div
        className="w-full h-8 border-t-2 rounded-t-[100px] border-zinc-700/80 transition-all"
        style={{
          boxShadow: `0 -12px 30px ${color}25`,
          borderColor: `${color}60`,
        }}
      />

      <div className="relative -top-4 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#121215] border border-zinc-800 text-[11px] font-mono tracking-wider uppercase text-zinc-300 shadow-md">
        <span className="size-2 rounded-full animate-pulse" style={{ backgroundColor: color }} />
        <span>STUDIO CYCLORAMA WALL &amp; MAIN PRODUCTION STAGE</span>
      </div>
    </div>
  );
}
