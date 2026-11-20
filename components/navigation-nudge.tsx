"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Makes sure a link click actually shows its page.
 *
 * Found on the admin Clients list (2026-11-21, Next.js 15.5 / React 19): a link clicked in the first
 * seconds after a page opens fetches its page but the screen never switches, until any other update
 * happens on the page (opening a menu, typing, a filter). Mouse moves and plain clicks don't count.
 *
 * So when a same-site link was clicked and the address still hasn't changed a moment later, this
 * makes that small update itself (a state change here, applied at once). It does nothing when the
 * page has already changed, and nothing for links to other sites, new tabs or downloads.
 */
export function NavigationNudge() {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      const from = window.location.href;
      if (to.href === from) return;

      clear();
      timers = [300, 800, 1500, 3000].map((ms) =>
        window.setTimeout(() => {
          if (window.location.href === from) flushSync(() => setTick((n) => n + 1));
        }, ms)
      );
    };

    // Capture phase: runs even when the link's own handler stops the click from bubbling.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  return null;
}
