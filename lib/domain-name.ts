/**
 * Domain-name helpers for studio custom domains. No database access, so safe to import
 * from validation schemas and client code.
 */

/**
 * The platform's own domain, read from NEXT_PUBLIC_APP_DOMAIN (e.g. "mystudioapp.com" or
 * "localhost:3000"). The port is dropped. NEXT_PUBLIC_* values are inlined at build time,
 * so this works in middleware and client code alike; a change needs a rebuild.
 */
export const APP_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || "cineflow.app")
  .trim()
  .toLowerCase()
  .replace(/^[a-z]+:\/\//, "")
  .replace(/[/?#].*$/, "")
  .replace(/^www\./, "");

/** APP_DOMAIN without its port, i.e. the bare hostname. */
export const APP_BASE_DOMAIN = APP_DOMAIN.replace(/:\d+$/, "");

/** Hosts the platform itself runs on. A studio can never claim these. */
export const PLATFORM_BASE_DOMAINS = Array.from(new Set([APP_BASE_DOMAIN, "cineflow.local", "localhost"]));

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

/** The studio slug for a `<slug>.<APP_DOMAIN>`-style platform subdomain, or null. */
export function platformSubdomainSlug(host: string): string | null {
  for (const base of PLATFORM_BASE_DOMAINS) {
    if (host.endsWith(`.${base}`)) {
      const label = host.slice(0, -(base.length + 1));
      if (label && !label.includes(".") && label !== "www" && label !== "app") return label;
    }
  }
  return null;
}
