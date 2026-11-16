"use client";

import { useEffect, useRef } from "react";

/** Space between the bottom of a header and a pop-up message. */
const GAP_PX = 12;

/**
 * Put this inside every sticky page header. It tells the app's pop-up messages (see the
 * Toaster in app/layout.tsx) how tall the header is, so a message appears just below the
 * header instead of on top of its links. Pages with no sticky header keep the default spot
 * near the top of the screen.
 */
export function ToastAnchor() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;

    const root = document.documentElement;
    let applied = "";
    const apply = () => {
      applied = `${Math.round(header.getBoundingClientRect().height) + GAP_PX}px`;
      root.style.setProperty("--toast-top", applied);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);

    return () => {
      observer.disconnect();
      // Only clear our own value: moving between areas mounts the next header's anchor too.
      if (root.style.getPropertyValue("--toast-top") === applied) root.style.removeProperty("--toast-top");
    };
  }, []);

  return <span ref={ref} hidden />;
}
