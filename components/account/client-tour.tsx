"use client";

import { useCallback } from "react";
import { GuidedTour, type TourStop } from "@/components/onboarding/guided-tour";
import { markClientTourSeen } from "@/lib/actions/client-tour";

interface ClientTourProps {
  tenantSlug: string;
  /** True when this client has never finished or skipped the tour: it then runs once on its own. */
  autoStart: boolean;
}

/** Stops of the client portal tour. A tab the client doesn't have (Proposals, until one is sent) is skipped. */
const STOPS: TourStop[] = [
  {
    anchor: null,
    title: "Welcome to your client portal",
    description: "Here's a quick look around, so you know where your bookings, photos and invoices are.",
  },
  {
    anchor: "client-kpis",
    title: "Your portal at a glance",
    description: "Your next sessions, anything you still owe, and how many photos and videos are ready. Click a card to open it.",
  },
  {
    anchor: "client-tab-projects",
    title: "Galleries",
    description:
      "Your photos and videos. Preview them, mark favourites and ask for retouches. Full-size files unlock once your balance is paid, and framed prints are ordered here too, if your studio offers them.",
  },
  {
    anchor: "client-tab-bookings",
    title: "My Bookings",
    description: "Every session you've booked, with its status, its details and what's left to pay.",
  },
  {
    anchor: "client-tab-invoices",
    title: "Invoices & Receipts",
    description: "Pay what's due and keep your receipts. A badge shows when something is waiting for you.",
  },
  {
    anchor: "client-tab-proposals",
    title: "Proposals",
    description: "Quotes your studio has sent you. Read them and accept online.",
  },
  {
    anchor: "client-book",
    title: "Book another session",
    description: "Ready for the next shoot? Pick a time here any time.",
  },
  {
    anchor: "client-account",
    title: "Your account",
    description:
      "Switch between your studios, visit the studio's website or sign out from here. \"Take the tour\" in your account menu replays this tour any time.",
  },
];

export function ClientTour({ tenantSlug, autoStart }: ClientTourProps) {
  const markSeen = useCallback(() => markClientTourSeen(tenantSlug), [tenantSlug]);
  return <GuidedTour stops={STOPS} autoStart={autoStart} markSeen={markSeen} />;
}
