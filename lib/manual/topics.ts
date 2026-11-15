/**
 * The admin manual's table of contents. Each topic is a page at
 * `/[tenantSlug]/admin/manual/<slug>` (the admin layout keeps it to the studio's team).
 * Add a topic here and create its page; the manual's front page lists whatever is here.
 */
export interface ManualTopic {
  slug: string;
  title: string;
  /** One sentence on what the page answers, shown on the manual's front page. */
  summary: string;
  /** The part of the admin console the topic belongs to. */
  area: "Bookings & Calendar" | "Payments" | "Galleries & Prints" | "Studio setup";
}

export const MANUAL_TOPICS: ManualTopic[] = [
  {
    slug: "slot-hold",
    title: "Slot holds: how the calendar prevents double bookings",
    summary:
      "What happens behind the scenes when a client selects a time, how long a slot stays reserved at each step, what you see in the Calendar, and what to do when a slot looks stuck.",
    area: "Bookings & Calendar",
  },
];

export function manualTopicHref(tenantSlug: string, slug: string): string {
  return `/${tenantSlug}/admin/manual/${slug}`;
}
