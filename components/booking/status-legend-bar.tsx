"use client";

interface StatusLegendBarProps {
  brandColor?: string | null;
}

export function StatusLegendBar({ brandColor }: StatusLegendBarProps) {
  const activeColor = brandColor || "#f59e0b";

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-3 px-4 rounded-xl border border-zinc-800 bg-[#121215] text-xs font-mono text-zinc-300">
      {/* Available */}
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-md bg-[#18181b] border border-zinc-600" />
        <span>Available</span>
      </div>

      {/* Your Hold */}
      <div className="flex items-center gap-2">
        <span
          className="size-3 rounded-md border animate-pulse"
          style={{ backgroundColor: activeColor, borderColor: activeColor }}
        />
        <span className="text-white font-bold">Your Hold (Active)</span>
      </div>

      {/* Held by Another */}
      <div className="flex items-center gap-2 text-zinc-400">
        <span className="size-3 rounded-md bg-amber-500/20 border border-amber-500/40 relative overflow-hidden">
          <span className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(245,158,11,0.4)_50%,transparent_75%)] bg-[length:6px_6px]" />
        </span>
        <span>Held by Another</span>
      </div>

      {/* Booked */}
      <div className="flex items-center gap-2 text-zinc-400">
        <span className="size-3 rounded-md bg-zinc-900 border border-zinc-800" />
        <span className="line-through">Booked</span>
      </div>

      {/* Blocked */}
      <div className="flex items-center gap-2 text-zinc-400">
        <span className="size-3 rounded-md bg-zinc-950 border border-dashed border-zinc-700" />
        <span>Maintenance</span>
      </div>
    </div>
  );
}
