import { db } from "@/lib/db";
import { normalizeDomain } from "@/lib/domain-name";

export { normalizeDomain, platformSubdomainSlug, PLATFORM_BASE_DOMAINS } from "@/lib/domain-name";

/**
 * Studio custom domains.
 *
 * A studio can point its own domain (e.g. studio.example.com) at the platform and set it
 * in Admin > Settings. The middleware looks the request's host up here and serves that
 * studio's pages.
 */

// Every page request on a custom domain resolves its host, so remember answers briefly.
// A domain saved in Settings starts working within CACHE_MS.
const CACHE_MS = 60_000;
const cache = new Map<string, { slug: string | null; at: number }>();

/** The slug of the studio that owns custom domain `host`, or null. */
export async function tenantSlugForDomain(host: string): Promise<string | null> {
  const domain = normalizeDomain(host);
  if (!domain) return null;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.slug;
  const tenant = await db.tenant.findUnique({ where: { customDomain: domain }, select: { slug: true } });
  const slug = tenant?.slug ?? null;
  cache.set(domain, { slug, at: Date.now() });
  return slug;
}
