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

// ─── Studio subdomains ───────────────────────────────────────────────────────────────────────
// With NEXT_PUBLIC_STUDIO_SUBDOMAINS=true (production), each studio lives at <slug>.<domain> and
// its paths carry no slug: lumina-cine.cineflow-os.my/book. Off (dev, staging), studios live at
// <domain>/<slug>/…. Every studio link goes through studioPath / studioUrl, so both work. The
// setting is read inside each function: Next inlines it, and tests can switch it.

/** Whether studios live on their own subdomain (NEXT_PUBLIC_STUDIO_SUBDOMAINS=true). */
export function studioSubdomainsOn(): boolean {
  return process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS === "true";
}

function appUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
}

function withSlash(p: string): string {
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * A studio page's path within the site: "/book" with subdomains on (the page is on the studio's
 * own host), "/lumina-cine/book" with them off. Query and fragment pass through.
 */
export function studioPath(slug: string, path = "/"): string {
  const p = withSlash(path);
  if (studioSubdomainsOn()) return p;
  return p === "/" ? `/${slug}` : `/${slug}${p}`;
}

/** A studio page's full address, for emails and anywhere outside the site. */
export function studioUrl(slug: string, path = "/"): string {
  const app = appUrl();
  if (studioSubdomainsOn()) return `${app.protocol}//${slug}.${app.host}${withSlash(path)}`;
  return `${app.origin}${studioPath(slug, path)}`;
}

/**
 * Whether `p` is a path on this site, never another site: it starts with one "/", and has no
 * backslash (browsers read "/\" as "//") and no control characters (the URL parser drops tabs and
 * line breaks, so "/\t/evil.com" would become "//evil.com").
 */
export function isSafeRelativePath(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !/[\u0000-\u001f\u007f]/.test(p);
}

/**
 * Whether `p` is a path to one of this studio's own pages, safe to continue to after a sign-in or
 * sign-up: never another site (//host, a backslash, a full address) and, with subdomains off,
 * never another studio (/lumina-cinema is not /lumina-cine).
 */
export function isStudioPath(slug: string, p: string): boolean {
  if (!isSafeRelativePath(p)) return false;
  if (studioSubdomainsOn()) return true;
  const lower = p.toLowerCase();
  const root = `/${slug.toLowerCase()}`;
  return lower === root || (lower.startsWith(root) && /^[/?#]/.test(lower.charAt(root.length)));
}

/**
 * A studio page as linked from a platform page (home, super-admin console): its subdomain address
 * when studios are on subdomains, otherwise its path (so the link stays on the site).
 */
export function studioLink(slug: string, path = "/"): string {
  return studioSubdomainsOn() ? studioUrl(slug, path) : studioPath(slug, path);
}

/** A platform page (home, sign-up, super-admin) as linked from anywhere: absolute when studios are on subdomains. */
export function platformUrl(path = "/"): string {
  return studioSubdomainsOn() ? `${appUrl().origin}${withSlash(path)}` : withSlash(path);
}

const hostname = (host: string) => (host.split(":")[0] ?? "").toLowerCase().replace(/\.$/, "");

/** The platform's own host: the domain itself, or its www. or app. form (port ignored). */
export function isPlatformHost(host: string): boolean {
  const h = hostname(host);
  return h === APP_BASE_DOMAIN || h === `www.${APP_BASE_DOMAIN}` || h === `app.${APP_BASE_DOMAIN}`;
}

/** The studio slug for a `<slug>.<domain>` host (port ignored), or null. */
export function studioSubdomainOf(host: string): string | null {
  const h = hostname(host);
  if (!h.endsWith(`.${APP_BASE_DOMAIN}`)) return null;
  const label = h.slice(0, -(APP_BASE_DOMAIN.length + 1));
  return label && !label.includes(".") && label !== "www" && label !== "app" ? label : null;
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
