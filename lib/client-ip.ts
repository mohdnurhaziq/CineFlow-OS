import { headers } from "next/headers";

/**
 * The visitor's IP, for rate limits. Behind the Cloudflare tunnel, Cloudflare sets
 * CF-Connecting-IP itself, so a visitor can't fake it. X-Forwarded-For is never used: Cloudflare
 * appends to whatever the visitor sent, so its first entry is the visitor's choice.
 * Null when no IP is known (a local run without Cloudflare): callers then skip per-IP limits.
 */
export function clientIpFrom(get: (name: string) => string | null): string | null {
  const ip = (get("cf-connecting-ip") ?? get("x-real-ip") ?? "").trim();
  return ip ? ip.slice(0, 64) : null;
}

/** The current request's visitor IP (see clientIpFrom), or null outside a request. */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return clientIpFrom((name) => h.get(name));
  } catch {
    return null;
  }
}
