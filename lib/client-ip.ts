import { headers } from "next/headers";

/**
 * The visitor's IP, for rate limits. Behind the Cloudflare tunnel, Cloudflare sets
 * CF-Connecting-IP itself, so a visitor can't fake it. X-Forwarded-For is never used: Cloudflare
 * appends to whatever the visitor sent, so its first entry is the visitor's choice.
 * Null when no IP is known (a local run without Cloudflare): callers then skip per-IP limits.
 */
export function clientIpFrom(get: (name: string) => string | null): string | null {
  const ip = (get("cf-connecting-ip") ?? get("x-real-ip") ?? "").trim().slice(0, 64);
  if (!ip) return null;
  return ip.includes(":") ? ipv6Network(ip) : ip;
}

/**
 * One IPv6 visitor usually holds a whole /64 (billions of addresses), so limits count the network:
 * "2001:db8:1:2:aaaa::1" and "2001:db8:1:2:bbbb::9" are the same visitor, "2001:db8:1:2::/64".
 */
function ipv6Network(ip: string): string {
  const [head = "", tail] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
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
