import { headers } from "next/headers";
import { hostFrom } from "./cookie-name";
import { platformSubdomainSlug, tenantSlugForDomain } from "@/lib/tenant-domain";

/** The header the middleware sets on every studio page: which studio the request is for. */
export const STUDIO_HEADER = "x-cineflow-studio";

/**
 * Which studio the current request is for, or null (the platform's own pages, API routes with no
 * studio host, or outside a request). The middleware sets the header (and drops any a visitor
 * sent); without it the host decides: a studio's subdomain, then its own domain.
 * A login session uses this to pick the person's account for that studio.
 */
export async function requestStudioSlug(): Promise<string | null> {
  try {
    const h = await headers();
    const named = h.get(STUDIO_HEADER);
    if (named) return named;
    const host = hostFrom((name) => h.get(name));
    const hostname = (host.split(":")[0] ?? "").toLowerCase();
    if (!hostname) return null;
    return platformSubdomainSlug(hostname) ?? (await tenantSlugForDomain(hostname));
  } catch {
    return null;
  }
}
