/**
 * The admin manual's table of contents. Each topic is a page at
 * `/[tenantSlug]/admin/manual/<slug>` (the admin layout keeps it to the studio's team).
 * Add a topic here and create its page; the manual's front page lists whatever is here,
 * grouped by area in the order of MANUAL_AREAS.
 */
export const MANUAL_AREAS = [
  "Start here",
  "Bookings & Calendar",
  "Payments",
  "Galleries & Prints",
  "Clients & Sales",
  "Production",
  "Studio setup",
] as const;

export interface ManualTopic {
  slug: string;
  title: string;
  /** One sentence on what the page answers, shown on the manual's front page. */
  summary: string;
  /** The part of the admin console the topic belongs to. */
  area: (typeof MANUAL_AREAS)[number];
}

export const MANUAL_TOPICS: ManualTopic[] = [
  {
    slug: "getting-started",
    title: "Start here: how the system fits together",
    summary:
      "The whole system on one page: what a client goes through from booking to framed print, where each job is done in the admin menu, how to set up a new studio, and what to check every day.",
    area: "Start here",
  },
  {
    slug: "bookings",
    title: "Bookings and the Calendar",
    summary:
      "How to open times for clients, take bookings online or by hand, what each booking status means, and how to move, finish or cancel a booking.",
    area: "Bookings & Calendar",
  },
  {
    slug: "slot-hold",
    title: "Slot holds: how the calendar prevents double bookings",
    summary:
      "What happens behind the scenes when a client selects a time, how long a slot stays reserved at each step, what you see in the Calendar, and what to do when a slot looks stuck.",
    area: "Bookings & Calendar",
  },
  {
    slug: "payments",
    title: "Payments, invoices and verification",
    summary:
      "The three ways a client pays, how the owner approves or rejects a payment, what each invoice and status means, and how refunds and late payments are handled.",
    area: "Payments",
  },
  {
    slug: "galleries",
    title: "Galleries and photo delivery",
    summary:
      "How to upload a client's photos and tell them they are ready, what the client can do in their gallery, and how previews, the balance and full-resolution downloads fit together.",
    area: "Galleries & Prints",
  },
  {
    slug: "prints",
    title: "Framed prints and wall art",
    summary:
      "How to set up sizes, frames and shipping, include prints in a package, and fulfil a client's print order from payment to pickup or delivery.",
    area: "Galleries & Prints",
  },
  {
    slug: "clients-and-proposals",
    title: "Clients and proposals",
    summary:
      "The client directory and the three kinds of client account, and how to quote a larger job with a proposal the client signs online.",
    area: "Clients & Sales",
  },
  {
    slug: "production",
    title: "Shoot days, crew and gear",
    summary:
      "How to plan a production: shoot days and call sheets, the on-set shot list, signed release forms, and reserving and checking equipment.",
    area: "Production",
  },
  {
    slug: "services-and-website",
    title: "Services and your website",
    summary:
      "How categories, packages and calendar slots fit together, how to set prices, and what visitors see on your public studio page.",
    area: "Studio setup",
  },
  {
    slug: "team",
    title: "Team, roles and assigning shoots",
    summary:
      "How to invite team members, give each role the access it needs, remove or bring back people, assign who shoots each booking, and what team members see in My schedule.",
    area: "Studio setup",
  },
  {
    slug: "settings-and-team",
    title: "Settings and your team",
    summary:
      "What every setting does, who can sign in to the admin console, and who can do what.",
    area: "Studio setup",
  },
];

export function manualTopicHref(tenantSlug: string, slug: string): string {
  return `/${tenantSlug}/admin/manual/${slug}`;
}
