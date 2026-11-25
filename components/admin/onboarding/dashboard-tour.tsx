"use client";

import { useCallback } from "react";
import { GuidedTour, type TourStop } from "@/components/onboarding/guided-tour";
import { markTourSeen } from "@/lib/actions/onboarding-guide";

interface DashboardTourProps {
  tenantSlug: string;
  /** True when this user has never finished or skipped the tour: it then runs once on its own. */
  autoStart: boolean;
}

/** Stops of the dashboard tour. A stop whose element isn't on the page (e.g. the checklist for staff) is skipped. */
const STOPS: TourStop[] = [
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
    description: "What you sell (services, plus frames and prints, if you offer them) and the work shown on your public page.",
  },
  {
    anchor: "nav-settings",
    title: "Settings",
    description: "Your studio's name, logo, domain, and how clients pay you.",
  },
  {
    anchor: "account",
    title: "Your account",
    description: "Switch between your studios or sign out from the arrows button. The play button replays this tour any time.",
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
  const markSeen = useCallback(() => markTourSeen(tenantSlug), [tenantSlug]);
  return <GuidedTour stops={STOPS} autoStart={autoStart} markSeen={markSeen} />;
}
