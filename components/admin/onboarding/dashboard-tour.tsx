"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-theme.css";
import { markTourSeen } from "@/lib/actions/onboarding-guide";

interface DashboardTourProps {
  tenantSlug: string;
  /** True when this user has never finished or skipped the tour: it then runs once on its own. */
  autoStart: boolean;
}

/** Stops of the dashboard tour. A stop whose element isn't on the page (e.g. the checklist for staff) is skipped. */
const STOPS: { anchor: string | null; title: string; description: string; readyTitle?: string; readyDescription?: string }[] = [
  {
    anchor: null,
    title: "Welcome to your studio admin",
    description: "Here's a 1-minute look around, so you know where everything lives.",
  },
  {
    anchor: "kpis",
    title: "Your studio at a glance",
    description: "Revenue, bookings and anything that needs your attention. Click a card to open the details.",
  },
  {
    anchor: "nav-production",
    title: "Production",
    description: "Projects, bookings, your calendar and gear: everything about the shoots themselves.",
  },
  {
    anchor: "nav-finance",
    title: "Finance",
    description: "Invoices, payments waiting for your check, and proposals for new clients.",
  },
  {
    anchor: "nav-catalog",
    title: "Catalog & CMS",
    description: "What you sell (services, frames and prints) and the work shown on your public page.",
  },
  {
    anchor: "nav-settings",
    title: "Settings",
    description: "Your studio's name, logo, domain, and how clients pay you.",
  },
  {
    anchor: "account",
    title: "Your account",
    description: "Sign out here. The play button replays this tour any time.",
  },
  {
    anchor: "checklist",
    title: "Start here",
    description: "Work through these steps to get your studio ready. Each one ticks itself off when it's done.",
    // Shown instead when every setup step is already done (the card reads "Your studio is ready").
    readyTitle: "You're all set",
    readyDescription: "Every setup step is done. Close this card with × whenever you like. It won't come back.",
  },
];

export function DashboardTour({ tenantSlug, autoStart }: DashboardTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const running = useRef(false);
  const autoStarted = useRef(false);

  const start = useCallback(() => {
    if (running.current) return;
    const steps: DriveStep[] = STOPS.flatMap((stop) => {
      const el = stop.anchor ? document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`) : null;
      if (stop.anchor && !el) return [];
      const ready = el?.dataset.state === "ready";
      return [
        {
          element: stop.anchor ? `[data-tour="${stop.anchor}"]` : undefined,
          popover: {
            title: (ready && stop.readyTitle) || stop.title,
            description: (ready && stop.readyDescription) || stop.description,
          },
        },
      ];
    });

    running.current = true;
    const tour = driver({
      steps,
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      popoverClass: "cineflow-tour",
      overlayOpacity: 0.65,
      stagePadding: 6,
      onDestroyed: () => {
        running.current = false;
        // Finished or skipped: either way, don't start it on its own again.
        void markTourSeen(tenantSlug);
      },
    });
    tour.drive();
  }, [tenantSlug]);

  // "Take the tour" links land here with ?tour=1; first-time users get it once on their own.
  const requested = searchParams.get("tour") === "1";
  useEffect(() => {
    if (requested) {
      autoStarted.current = true;
      router.replace(pathname, { scroll: false });
      start();
    } else if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
  }, [requested, autoStart, pathname, router, start]);

  return null;
}
