"use client";

import { useEffect, useRef, useState } from "react";

interface LoopVideoProps {
  mp4: string | null;
  mp4Portrait?: string | null;
  poster: string;
  alt: string;
  /** The hero: its poster is the page's largest image, so load it first. */
  priority?: boolean;
  /** Must position the box (absolute or relative): the poster and video fill it. */
  className?: string;
}

/**
 * A silent looping clip over its poster. The poster is real markup (so it paints first and is all that
 * shows without a video file, on reduced motion, or with Save-Data); the <video> is added on the client,
 * and plays only while it is on screen.
 */
export function LoopVideo({ mp4, mp4Portrait = null, poster, alt, priority = false, className = "" }: LoopVideoProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!mp4) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setAllowed(!reduced && !conn?.saveData);
  }, [mp4]);

  useEffect(() => {
    const el = video.current;
    const box = wrap.current;
    if (!allowed || !el || !box) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    });
    io.observe(box);
    return () => io.disconnect();
  }, [allowed]);

  return (
    <div ref={wrap} className={`overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt={alt} className="absolute inset-0 size-full object-cover" fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} decoding="async" />
      {allowed && mp4 && (
        <video ref={video} className="absolute inset-0 size-full object-cover" muted loop playsInline preload="metadata" poster={poster} aria-hidden="true">
          {mp4Portrait && <source src={mp4Portrait} type="video/mp4" media="(max-width: 640px)" />}
          <source src={mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
