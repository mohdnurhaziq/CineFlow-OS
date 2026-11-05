/**
 * Domain-name helpers for studio custom domains. No database access, so safe to import
 * from validation schemas and client code.
 */

/** Hosts the platform itself runs on. A studio can never claim these. */
export const PLATFORM_BASE_DOMAINS = ["cineflow.app", "cineflow.local", "localhost"];

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * "https://Studio.Example.com/book" -> "studio.example.com". Returns null for anything
 * that isn't a plain domain name, or that belongs to the platform.
 */
export function normalizeDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (!HOSTNAME.test(host)) return null;
  if (PLATFORM_BASE_DOMAINS.some((base) => host === base || host.endsWith(`.${base}`))) return null;
  return host;
}

/** The studio slug for a `<slug>.cineflow.app`-style platform subdomain, or null. */
export function platformSubdomainSlug(host: string): string | null {
  for (const base of PLATFORM_BASE_DOMAINS) {
    if (host.endsWith(`.${base}`)) {
      const label = host.slice(0, -(base.length + 1));
      if (label && !label.includes(".") && label !== "www" && label !== "app") return label;
    }
  }
  return null;
}
