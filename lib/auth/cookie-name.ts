import { APP_BASE_DOMAIN, isPlatformHost, studioSubdomainOf, studioSubdomainsOn } from "@/lib/domain-name";

/**
 * Which session cookie belongs to a request's host. Plain module (no server-only imports), so the
 * middleware and the server code share one definition.
 *
 * With studio subdomains on, the platform domain and every studio subdomain share one sign-in:
 * a cookie for the whole domain, under its own name, so it never meets staging's host-only
 * cookie on staging.<domain>. A studio's own domain (studio.com) can't receive a cookie for
 * <domain>, so it keeps its own host-only cookie, as everywhere when subdomains are off.
 */

export const COOKIE_NAME = "cineflow_session";
export const SHARED_COOKIE_NAME = "cineflow_session_shared";

export function sessionCookieFor(host: string): { name: string; domain?: string } {
  if (studioSubdomainsOn() && (isPlatformHost(host) || studioSubdomainOf(host))) {
    return { name: SHARED_COOKIE_NAME, domain: APP_BASE_DOMAIN };
  }
  return { name: COOKIE_NAME };
}

/** The host a request came to: the first X-Forwarded-Host, else Host. */
export function hostFrom(get: (name: string) => string | null): string {
  return (get("x-forwarded-host") ?? get("host") ?? "").split(",")[0]!.trim();
}
