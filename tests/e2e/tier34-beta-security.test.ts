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
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { registerClient } from "@/lib/actions/client-auth";
import { lookupMyBooking } from "@/lib/actions/my-booking";

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

  // ── Task 3: a guest booking can't open someone else's account ────────────────

  const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
  const victimEmail = `t34-victim-${run}@example.test`;
  const victim = await db.user.create({
    data: { tenantId: lumina.id, name: "T34 Victim", email: victimEmail, role: "CLIENT", isQuickCreated: true },
  });
  // What an attacker gets from a guest checkout with the victim's email: a booking on the victim's
  // account, and its tracking code.
  const attackerBooking = await db.clientBooking.create({
    data: {
      tenantId: lumina.id,
      trackingCode: `BK-T34-${run}`.toUpperCase(),
      clientName: "Attacker",
      clientEmail: victimEmail,
      clientPhone: "0123456789",
      discipline: "PHOTOGRAPHY",
      serviceTier: "STANDARD",
      userId: victim.id,
    },
  });
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { clientId: victim.id } });
    await db.clientBooking.deleteMany({ where: { userId: victim.id } });
    await db.user.deleteMany({ where: { id: victim.id } });
  });

  await harness.test("T34-TAKEOVER-01: a booking's tracking code can't set someone's password; the owner gets a link instead", async () => {
    const outbox: { to: string; subject: string; html: string }[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    const savedHost = process.env.SMTP_HOST;
    process.env.SMTP_HOST = "smtp.t34.test";
    setSmtpTransportForTests({
      sendMail: async (m: { to: string; subject: string; html: string }) => {
        outbox.push(m);
        return json.sendMail(m);
      },
    } as unknown as Transporter);
    try {
      const res = await withRequest(() =>
        registerClient({
          tenantSlug: "lumina-cine",
          name: "Attacker",
          email: victimEmail,
          phone: "0123456789",
          password: "attacker-password-1",
          claimCode: attackerBooking.trackingCode,
        } as Parameters<typeof registerClient>[0])
      );
      harness.assert(!res.success, "Registering with someone's booking code doesn't sign you in", JSON.stringify(res));
      harness.assertEqual((res as { error?: string }).error, "CHECK_EMAIL", "…it says to check the email instead");
      const after = await db.user.findUniqueOrThrow({ where: { id: victim.id } });
      harness.assertEqual(after.passwordHash, null, "The account's password isn't set");
      await new Promise((r) => setTimeout(r, 200));
      const mail = outbox.find((m) => String(m.to).includes(victimEmail));
      harness.assert(!!mail, "The real owner is emailed", outbox.map((m) => m.to).join(","));
      harness.assert(!!mail && mail.html.includes("/register?invite="), "…with a link to set their password");
    } finally {
      setSmtpTransportForTests(null);
      if (savedHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = savedHost;
    }
  });

  await harness.test("T34-TAKEOVER-02: 'Find my booking' shows only that booking, not the client's other records", async () => {
    const template = await db.milestoneInvoice.findFirstOrThrow({ where: { tenantId: lumina.id } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = template as typeof template & { updatedAt?: Date };
    const other = await db.milestoneInvoice.create({
      data: {
        ...(rest as typeof rest),
        clientId: victim.id,
        bookingId: null,
        projectId: null,
        proposalId: null,
        invoiceNumber: `INV-T34-${run}`,
      } as Parameters<typeof db.milestoneInvoice.create>[0]["data"],
    });
    const res = await lookupMyBooking({ tenantSlug: "lumina-cine", email: victimEmail, trackingCode: attackerBooking.trackingCode });
    harness.assert(res.success, "The booking is found", JSON.stringify(res).slice(0, 200));
    const invoices = (res as { booking?: { invoices?: { id: string }[] } }).booking?.invoices ?? [];
    harness.assert(Array.isArray((res as { booking?: { invoices?: unknown } }).booking?.invoices), "The result lists invoices");
    harness.assert(!invoices.some((i) => i.id === other.id), "The client's other invoice isn't listed");
  });
}
