"use client";

import { useEffect, useRef, useState } from "react";
import { crossfadeOpacity } from "@/lib/landing/crossfade";

interface LoopVideoProps {
  mp4: string | null;
  mp4Portrait?: string | null;
  poster: string;
  alt: string;
  /** The hero: its poster is the page's largest image, so load it first. */
  priority?: boolean;
  /** Must position the box (absolute or relative): the poster and video fill it. */
  className?: string;
  /**
   * Seconds over which the end of the clip dissolves into its start, for a clip whose last frame
   * doesn't match its first. 0 (the default) is a plain loop.
   */
  crossfade?: number;
}

/**
 * A silent looping clip over its poster. The poster is real markup (so it paints first and is all that
 * shows without a video file, on reduced motion, or with Save-Data); the <video> is added on the client,
 * and plays only while it is on screen.
 */
export function LoopVideo({ mp4, mp4Portrait = null, poster, alt, priority = false, className = "", crossfade = 0 }: LoopVideoProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const twin = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const blend = crossfade > 0;

  useEffect(() => {
    if (!mp4) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setAllowed(!reduced && !conn?.saveData);
  }, [mp4]);

  // A plain loop: the browser repeats the clip; it plays only while on screen.
  useEffect(() => {
    const el = video.current;
    const box = wrap.current;
    if (!allowed || blend || !el || !box) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    });
    io.observe(box);
    return () => io.disconnect();
  }, [allowed, blend]);

  // A dissolved loop: two copies of the clip; the second fades in over the first as it ends, then they swap.
  useEffect(() => {
    const first = video.current;
    const second = twin.current;
    const box = wrap.current;
    if (!allowed || !blend || !first || !second || !box) return;
    const copies = [first, second];
    let front = 0;
    let blending = false;
    let frame = 0;

    // The copy in front plays; the other waits on top of it, invisible, parked at the start.
    const park = (v: HTMLVideoElement) => {
      v.pause();
      v.currentTime = 0;
      v.style.opacity = "0";
      v.style.zIndex = "2";
    };
    first.style.opacity = "1";
    first.style.zIndex = "1";
    park(second);

    const tick = () => {
      const cur = copies[front]!;
      const next = copies[1 - front]!;
      const length = cur.duration;
      if (Number.isFinite(length) && length > 0) {
        const shown = crossfadeOpacity(length - cur.currentTime, crossfade);
        if (shown > 0 && !blending) {
          blending = true;
          if (next.currentTime > 0.05) next.currentTime = 0;
          void next.play().catch(() => undefined);
        }
        if (blending) next.style.opacity = String(shown);
        if (cur.ended || shown >= 1) {
          // The second copy is now the clip; the first goes back to waiting at the start.
          next.style.opacity = "1";
          next.style.zIndex = "1";
          park(cur);
          front = 1 - front;
          blending = false;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry?.isIntersecting) {
        void copies[front]!.play().catch(() => undefined);
        if (blending) void copies[1 - front]!.play().catch(() => undefined);
        frame = requestAnimationFrame(tick);
      } else {
        copies.forEach((v) => v.pause());
      }
    });
    io.observe(box);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [allowed, blend, crossfade]);

  const sources = (
    <>
      {mp4Portrait && <source src={mp4Portrait} type="video/mp4" media="(max-width: 640px)" />}
      <source src={mp4 ?? undefined} type="video/mp4" />
    </>
  );

  return (
    <div ref={wrap} className={`overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt={alt} className="absolute inset-0 size-full object-cover" fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} decoding="async" />
      {allowed && mp4 && (
        <>
          <video ref={video} className="absolute inset-0 size-full object-cover" muted loop={!blend} playsInline preload={blend ? "auto" : "metadata"} poster={poster} aria-hidden="true">
            {sources}
          </video>
          {blend && (
            <video ref={twin} className="absolute inset-0 size-full object-cover" style={{ opacity: 0 }} muted playsInline preload="auto" poster={poster} aria-hidden="true">
              {sources}
            </video>
          )}
        </>
      )}
    </div>
  );
}
