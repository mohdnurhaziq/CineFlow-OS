/**
 * Tier 34: Security fixes before the beta (docs/superpowers/specs/2026-11-19-beta-security-design.md)
 * Each test first reproduces a hole the pre-beta audit found, then pins the fix.
 */

import { TestHarness } from "./test-harness";
import { clientIpFrom } from "@/lib/client-ip";
import { isRateLimited, rateLimiterSize } from "@/lib/rate-limit";
import { loginWithCredentials } from "@/lib/auth/session";
import { withRequest } from "./mocks/session";
import { NextRequest } from "next/server";
import { rm } from "node:fs/promises";
import path from "node:path";
import { POST as uploadPOST } from "@/app/api/upload/route";

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

  // ── Task 2: uploads can't fill the disk ──────────────────────────────────────

  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const uploadAs = (ip: string, spoof: string) => {
    const form = new FormData();
    form.append("file", new File([PNG], "slip.png", { type: "image/png" }));
    form.append("folder", "receipts");
    return withRequest(() =>
      uploadPOST(new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: form, headers: { "cf-connecting-ip": ip, "x-forwarded-for": spoof } }))
    );
  };

  await harness.test("T34-UPLOAD-01: a visitor can't dodge the upload limit by faking X-Forwarded-For", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    const statuses: number[] = [];
    const saved: string[] = [];
    try {
      for (let i = 0; i < 21; i++) {
        const res = await uploadAs(ip, `10.0.${i}.1`);
        statuses.push(res.status);
        if (res.status === 201) saved.push(((await res.json()) as { url: string }).url);
      }
    } finally {
      for (const url of saved) await rm(path.join(process.cwd(), "public", url.replace(/^\//, "")), { force: true });
    }
    harness.assertEqual(statuses.slice(0, 20).filter((s) => s === 201).length, 20, "The first 20 go through");
    harness.assertEqual(statuses[20], 429, "The 21st from the same visitor is refused, whatever X-Forwarded-For says");
  });

  await harness.test("T34-UPLOAD-02: an oversized anonymous upload is refused before it's read, even without a declared size", async () => {
    const big = new Uint8Array(30 * 1024 * 1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = big.subarray(pulled, pulled + 1024 * 1024);
        pulled += chunk.length;
        if (chunk.length === 0) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const res = await withRequest(() =>
      uploadPOST(
        new NextRequest("http://localhost:3000/api/upload", {
          method: "POST",
          body,
          headers: { "content-type": "multipart/form-data; boundary=x" },
          duplex: "half",
        } as ConstructorParameters<typeof NextRequest>[1])
      )
    );
    harness.assertEqual(res.status, 413, "Refused as too large");
    harness.assert(pulled <= 13 * 1024 * 1024, "…reading no more than the cap and a chunk of the 30 MB", String(pulled));
  });
}
