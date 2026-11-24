/** The address shown to studio owners on the public landing page (footer and FAQ). One setting. */
export function publicContactEmail(env: Record<string, string | undefined> = process.env): string {
  return env.PLATFORM_CONTACT_EMAIL?.trim() || "hello@cineflow-os.my";
}
