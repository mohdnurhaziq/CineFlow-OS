import { PLANS, cheapestPlanWith, type PlanFeature } from "@/lib/billing/plans";
import { GRACE_DAYS, TRIAL_DAYS } from "@/lib/billing/state";
import type { LandingMode } from "@/lib/landing/mode";

/**
 * Everything the landing page says about the product, as data, so tests can scan every sentence.
 * Each line maps to something the app really does (see the claims table in the design doc).
 * Plan names, prices and team sizes are never written here: components read them from PLANS.
 */

export interface Chapter {
  n: string;
  key: "book" | "pay" | "sign" | "shoot" | "deliver" | "print";
  title: string;
  body: string;
  /** The feature that needs a paid plan, or null when every plan has it. */
  feature: PlanFeature | null;
  shot: { desktop: string; phone?: string; alt: string };
  video?: "shoot" | "deliver" | "print";
}

export const CHAPTERS: Chapter[] = [
  {
    n: "01",
    key: "book",
    title: "Your client books online",
    body: "They pick a time on your own booking page. The slot is held while they check out, so two clients can never take the same time.",
    feature: null,
    shot: { desktop: "/landing/shots/book-desktop.webp", phone: "/landing/shots/book-phone.webp", alt: "A studio's booking page with open time slots" },
  },
  {
    n: "02",
    key: "pay",
    title: "They pay the way they already do",
    body: "Invoices for a deposit and the balance. Clients pay by bank transfer or DuitNow and upload their slip; you approve it in one tap.",
    feature: null,
    shot: { desktop: "/landing/shots/pay-desktop.webp", phone: "/landing/shots/pay-phone.webp", alt: "The studio's list of payment slips waiting for approval" },
  },
  {
    n: "03",
    key: "sign",
    title: "Proposals they sign online",
    body: "Send a proposal with add-ons the client can pick. They review it, sign it on their phone, and the project and invoice are created for you.",
    feature: "proposals",
    shot: { desktop: "/landing/shots/sign-desktop.webp", phone: "/landing/shots/sign-phone.webp", alt: "A proposal with add-ons ready for the client to sign" },
  },
  {
    n: "04",
    key: "shoot",
    title: "A crew that knows the plan",
    body: "Assign your team to each shoot, share call sheets, and send calendar invites so everyone turns up at the right place and time.",
    feature: "callSheets",
    shot: { desktop: "/landing/shots/shoot-desktop.webp", phone: "/landing/shots/shoot-phone.webp", alt: "A call sheet and shot list for a shoot day" },
    video: "shoot",
  },
  {
    n: "05",
    key: "deliver",
    title: "Delivery that gets you paid",
    body: "Clients preview their photos with a watermark in their own gallery. The full-resolution files unlock when the final balance is paid.",
    feature: null,
    shot: { desktop: "/landing/shots/deliver-desktop.webp", phone: "/landing/shots/deliver-phone.webp", alt: "A client's gallery of delivered photos" },
    video: "deliver",
  },
  {
    n: "06",
    key: "print",
    title: "Prints on their wall",
    body: "Clients see your frames on their own photos, pick a size and frame, and order prints from you, all inside the gallery.",
    feature: "wallArt",
    shot: { desktop: "/landing/shots/print-desktop.webp", phone: "/landing/shots/print-phone.webp", alt: "The wall-art visualizer showing a framed photo" },
    video: "print",
  },
];

/** "Studio plan" for a feature that needs one, taken from the plans themselves. */
export function planBadge(feature: PlanFeature | null): string | null {
  return feature ? `${PLANS[cheapestPlanWith(feature)].name} plan` : null;
}

/** A line of the "rest of the day-to-day" list. `needs` hides it until that setting is on. */
export interface Extra {
  title: string;
  body: string;
  feature: PlanFeature | null;
  needs?: "google";
}

export const EXTRAS: Extra[] = [
  { title: "Team roles and access", body: "Invite your crew with roles, and choose what each person can open.", feature: "team" },
  {
    title: "A portal for every client",
    body: "Bookings, invoices, proposals and galleries in one place they sign in to, with a short tour the first time they do.",
    feature: null,
  },
  {
    title: "One login for every studio",
    body: "Own a studio, shoot for another, book a third as a client? One email and one sign-in cover them all, and a switcher moves you between studios. Each studio's information stays separate.",
    feature: null,
  },
  {
    title: "Sign in with Google",
    body: "Studio owners, teams and clients can sign in or sign up with Google, or keep using an email and a password.",
    feature: null,
    needs: "google",
  },
  {
    title: "A guided start",
    body: "A new studio gets a setup checklist that ticks itself off and a short tour of the admin. Clients get a quick tour of their portal the first time they sign in.",
    feature: null,
  },
  {
    title: "Framed prints are optional",
    body: "If you don't sell framed prints, switch them off at sign-up or later in Settings, and they disappear from your site and your clients' galleries.",
    feature: "wallArt",
  },
  { title: "Gear and kits", body: "Track your equipment, group it into kits and reserve it for shoots.", feature: "gear" },
  { title: "Email reminders", body: "Clients and your team get clear emails for bookings, payments and delivery.", feature: null },
  { title: "Made for phones", body: "Clients book, pay and view galleries on their phone without installing anything.", feature: null },
];

/** The lines of the extras list that apply: the Google one only once Google sign-in is set up. */
export function extrasFor(googleOn: boolean): Extra[] {
  return EXTRAS.filter((e) => e.needs !== "google" || googleOn);
}

export function faqItems(mode: LandingMode, email: string, googleOn = false): { q: string; a: string }[] {
  const items: { q: string; a: string }[] = [
    {
      q: "Is there a free trial?",
      a: `Yes. A new studio starts with a ${TRIAL_DAYS}-day free trial with everything unlocked, then moves to the plan you chose.`,
    },
    {
      q: "How do I pay for a plan?",
      a: `By bank transfer or DuitNow. We record your payment and your plan runs to the day we enter. We email you 7 days before it ends.`,
    },
    {
      q: "What happens if my plan ends?",
      a: `Everything keeps working for ${GRACE_DAYS} more days, with a notice at the top. After that your studio becomes read-only and closed to new online bookings until you renew. Your clients can still open their galleries and pay what they owe, and nothing is deleted.`,
    },
    {
      q: "Can I change plans?",
      a: "Yes, any time. Moving to a smaller plan deletes nothing; you just can't add new things the plan doesn't include.",
    },
    {
      q: "Can I use my own web address?",
      a: `Yes, on the ${PLANS[cheapestPlanWith("customDomain")].name} plan and above, so clients visit your own domain instead of ours.`,
    },
    {
      q: "I'm also a photographer at another studio. Do I need a second account?",
      a: "No. One email and one sign-in work at every studio you belong to, whether you own it, shoot for it or book it as a client. A switcher in your account menu moves you between studios, and each studio's information stays separate.",
    },
  ];
  if (googleOn) {
    items.push({
      q: "Can I sign in with Google?",
      a: "Yes. Studio owners, teams and clients can sign in or sign up with Google instead of a password, or keep using an email and password. Google only tells us your name and email address.",
    });
  }
  items.push({
    q: "Do I have to sell framed prints?",
    a: "No. On the plan with wall art you can switch framed prints off at sign-up or later in Settings, and they are hidden from your site and your clients' galleries. Plans without wall art don't show prints at all.",
  });
  if (mode !== "TRIAL") {
    items.push({
      q: "How do I join?",
      a: "CineFlow OS is in a private beta. Request an invite below and we'll email you a code to create your studio.",
    });
  }
  items.push({ q: "I have another question.", a: `Email us at ${email} and a real person will reply.` });
  return items;
}

/** Words and links that must never appear on the public landing page, nav or footer. */
export const BANNED_PHRASES: (string | RegExp)[] = [
  "< 60s",
  /\b60s\b/,
  "solar",
  "CRUD",
  /\$/,
  "USD",
  "Starter",
  "Pro tier",
  "MRR",
  "telemetry",
  "PRODUCTION MANAGEMENT SYSTEM",
  "/super-admin",
];
