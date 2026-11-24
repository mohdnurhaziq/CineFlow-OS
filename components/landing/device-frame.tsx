import type { ReactNode } from "react";

interface DeviceFrameProps {
  kind: "browser" | "phone";
  children: ReactNode;
  /** Shown in the browser frame's address bar. */
  url?: string;
  className?: string;
}

/** A browser window or a phone drawn in CSS around a screenshot. Nothing to download. */
export function DeviceFrame({ kind, children, url = "your-studio.cineflow-os.my", className = "" }: DeviceFrameProps) {
  if (kind === "phone") {
    return (
      <div className={`relative mx-auto w-[min(100%,260px)] rounded-[2.2rem] border border-zinc-700 bg-zinc-900 p-2 shadow-2xl shadow-black/60 ${className}`}>
        <div aria-hidden="true" className="absolute left-1/2 top-3 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-zinc-800" />
        <div className="overflow-hidden rounded-[1.7rem] bg-black">{children}</div>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-2xl shadow-black/60 ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-zinc-700" />
          <i className="size-2.5 rounded-full bg-zinc-700" />
          <i className="size-2.5 rounded-full bg-zinc-700" />
        </span>
        <span className="mx-auto max-w-[70%] truncate rounded-md bg-zinc-900 px-3 py-0.5 font-mono text-[11px] text-zinc-400">{url}</span>
      </div>
      <div className="bg-black">{children}</div>
    </div>
  );
}
