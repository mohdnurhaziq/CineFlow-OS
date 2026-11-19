/**
 * Minimal in-memory attempt limiter. Fine for a single Node process; swap for
 * a shared store (e.g. Redis) before running multiple instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Keys often include values a visitor chooses (emails, IPs): drop expired ones so it can't grow forever. */
const SWEEP_AT = 5000;

function sweep(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}

/** Returns true when `key` has exceeded `max` attempts within `windowMs`. */
export function isRateLimited(key: string, max = 10, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  if (buckets.size >= SWEEP_AT) sweep(now);
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

/** How many keys the limiter holds (for tests). */
export function rateLimiterSize(): number {
  return buckets.size;
}
