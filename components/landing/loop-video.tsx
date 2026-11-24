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
   * doesn't match its first. 0 (the default) is a plain loop. Not used with `mp4Portrait`.
   */
  crossfade?: number;
}

/** A chapter clip starts downloading when it is this close to the screen, not when the page opens. */
const FETCH_MARGIN = "800px 0px";

/**
 * A silent looping clip over its poster. The poster is real markup (so it paints first and is all that
 * shows without a video file, on reduced motion, or with Save-Data); the <video> is added on the client,
 * and plays only while it is on screen.
 *
 * The clip is fetched late on purpose, so it never competes with the page for a slow connection: the
 * hero waits until the page has finished loading, and a chapter clip until it is near the screen.
 */
export function LoopVideo({ mp4, mp4Portrait = null, poster, alt, priority = false, className = "", crossfade = 0 }: LoopVideoProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const twin = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [near, setNear] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blend = crossfade > 0;

  // The device allows motion; the hero then waits for the page to finish loading.
  useEffect(() => {
    if (!mp4) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (reduced || conn?.saveData) return;
    if (!priority || document.readyState === "complete") {
      setAllowed(true);
      return;
    }
    const start = () => setAllowed(true);
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [mp4, priority]);

  // A chapter clip is only fetched once it is near the screen.
  useEffect(() => {
    const box = wrap.current;
    if (!allowed || !box) return;
    if (priority) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: FETCH_MARGIN }
    );
    io.observe(box);
    return () => io.disconnect();
  }, [allowed, priority]);

  // A dissolved loop plays two copies of the clip: fetch the file once and give both the same data,
  // so the page doesn't download it twice.
  useEffect(() => {
    if (!allowed || !near || !blend || !mp4) return;
    let url: string | null = null;
    let cancelled = false;
    fetch(mp4)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("clip not found"))))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [allowed, near, blend, mp4]);

  const ready = allowed && near && !!mp4 && (!blend || !!blobUrl);

  // A plain loop: the browser repeats the clip; it plays only while on screen.
  useEffect(() => {
    const el = video.current;
    const box = wrap.current;
    if (!ready || blend || !el || !box) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    });
    io.observe(box);
    return () => io.disconnect();
  }, [ready, blend]);

  // A dissolved loop: two copies of the clip; the second fades in over the first as it ends, then they swap.
  useEffect(() => {
    const first = video.current;
    const second = twin.current;
    const box = wrap.current;
    if (!ready || !blend || !first || !second || !box) return;
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
  }, [ready, blend, crossfade]);

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
      {ready && (
        <>
          <video ref={video} className="absolute inset-0 size-full object-cover" src={blend ? (blobUrl ?? undefined) : undefined} muted loop={!blend} playsInline preload={blend ? "auto" : "metadata"} poster={poster} aria-hidden="true">
            {!blend && sources}
          </video>
          {blend && (
            <video ref={twin} className="absolute inset-0 size-full object-cover" src={blobUrl ?? undefined} style={{ opacity: 0 }} muted playsInline preload="auto" poster={poster} aria-hidden="true" />
          )}
        </>
      )}
    </div>
  );
}
