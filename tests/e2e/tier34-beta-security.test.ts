/**
 * Tier 34: Security fixes before the beta (docs/superpowers/specs/2026-11-19-beta-security-design.md)
 * Each test first reproduces a hole the pre-beta audit found, then pins the fix.
 */

import { TestHarness } from "./test-harness";
import { clientIpFrom } from "@/lib/client-ip";
import { isRateLimited, rateLimiterSize } from "@/lib/rate-limit";
import { loginWithCredentials } from "@/lib/auth/session";
import { withRequest } from "./mocks/session";

const run = Date.now().toString(36);
const headersOf = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()] ?? null;

export async function runTier34BetaSecurityTests(harness: TestHarness) {
  harness.setSuite("Tier 34", "Security fixes before the beta");

  // ── Task 1: visitor IP, the limiter, sign-in limits ─────────────────────────

  await harness.test("T34-IP-01: the visitor's IP comes from Cloudflare, never from a header the visitor sets", async () => {
    harness.assertEqual(clientIpFrom(headersOf({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })), "203.0.113.7", "Cloudflare's header wins");
    harness.assertEqual(clientIpFrom(headersOf({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" })), null, "X-Forwarded-For alone is never trusted");
    harness.assertEqual(clientIpFrom(headersOf({ "x-real-ip": "198.51.100.2" })), "198.51.100.2", "X-Real-IP is used without Cloudflare");
    harness.assertEqual(clientIpFrom(headersOf({})), null, "No IP known");
  });

  await harness.test("T34-LIMIT-01: the rate limiter forgets expired entries", async () => {
    for (let i = 0; i < 5100; i++) isRateLimited(`t34-sweep-${run}-${i}`, 10, 1);
    await new Promise((r) => setTimeout(r, 10));
    isRateLimited(`t34-sweep-${run}-trigger`, 10, 1);
    harness.assert(rateLimiterSize() < 5000, "Expired entries are dropped", String(rateLimiterSize()));
  });

  await harness.test("T34-LOGIN-01: a made-up studio name doesn't reset the sign-in limit", async () => {
    const email = `t34-guess-${run}@example.test`;
    const replies: Array<{ error?: string }> = [];
    for (let i = 0; i < 11; i++) {
      replies.push(await withRequest(() => loginWithCredentials(email, `wrong-${i}`, `t34-made-up-${run}-${i}`)));
    }
    harness.assertEqual(replies[9]?.error, "INVALID_CREDENTIALS", "Tenth guess: just wrong");
    harness.assertEqual(replies[10]?.error, "RATE_LIMITED", "Eleventh guess, under another studio name: rate-limited");
  });
}
