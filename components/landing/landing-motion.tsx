"use client";

import { useEffect, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * The landing page's motion: smooth scrolling, elements that rise in as they arrive, and slow drift on
 * product shots. It only adds motion; every element is fully visible in the markup, so nothing depends
 * on this running. With "reduce motion" on, it does nothing at all (the browser's own scrolling and
 * anchor jumps apply).
 *
 *   data-split             a SplitHeading: its words rise in one by one
 *   data-reveal            fades up when it scrolls into view (data-reveal-delay="0.15" to stagger)
 *   data-parallax="40"     drifts by that many pixels over its time on screen
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-split]").forEach((heading) => {
        gsap.from(heading.querySelectorAll(".w"), {
          yPercent: 110,
          duration: 0.9,
          ease: "power4.out",
          stagger: 0.07,
          scrollTrigger: { trigger: heading, start: "top 90%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 36,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          delay: Number(el.dataset.revealDelay ?? 0),
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const distance = Number(el.dataset.parallax) || 40;
        gsap.fromTo(el, { y: distance }, { y: -distance, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
      });
    });

    // In-page links glide to their section, below the sticky nav. Links to another page are left alone.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
      const target = document.querySelector<HTMLElement>(url.hash);
      if (!target) return;
      e.preventDefault();
      // Sections carry scroll-mt-20, which Lenis honours, so the offset is already the nav's height.
      lenis.scrollTo(target, { duration: 1.2 });
      history.replaceState(null, "", url.hash);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
