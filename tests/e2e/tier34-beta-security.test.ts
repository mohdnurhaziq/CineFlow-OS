/**
 * Tier 34: Security fixes before the beta (docs/superpowers/specs/2026-11-19-beta-security-design.md)
 * Each test first reproduces a hole the pre-beta audit found, then pins the fix.
 */

import { TestHarness } from "./test-harness";
import { clientIpFrom } from "@/lib/client-ip";
import { isRateLimited, rateLimiterSize } from "@/lib/rate-limit";
import { loginWithCredentials } from "@/lib/auth/session";
import { withIp, withRequest, withSession } from "./mocks/session";
import { NextRequest } from "next/server";
import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { POST as uploadPOST } from "@/app/api/upload/route";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { registerClient } from "@/lib/actions/client-auth";
import { lookupMyBooking } from "@/lib/actions/my-booking";
import { findProp, provideReactGlobal } from "./react-tree";
import StudioHomePage from "@/app/[tenantSlug]/page";
import { UpdateStudioSettingsSchema } from "@/lib/validations/admin-settings";
import { onboardStudio, studioSignupStatus } from "@/lib/actions/onboarding";
import nextConfig from "../../next.config";
import { middleware } from "@/middleware";
import { ProcessBookingCheckoutSchema, ProcessInvoicePaymentSchema } from "@/lib/validations/checkout";
import VisualizerPage from "@/app/[tenantSlug]/visualizer/page";
import BookingPage from "@/app/[tenantSlug]/book/page";
import * as bookingActions from "@/lib/actions/booking";
import { settingsRefusal } from "../../scripts/start";
import { randomId } from "@/lib/random-id";

const run = Date.now().toString(36);
const read34 = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
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

  // ── Task 4: studio text can't become a script ────────────────────────────────

  await harness.test("T34-XSS-01: a studio's bio can't close the search-engine script on its home page", async () => {
    await provideReactGlobal();
    const saved = await db.tenant.findUniqueOrThrow({ where: { id: lumina.id }, select: { bio: true, tagline: true } });
    await db.tenant.update({ where: { id: lumina.id }, data: { bio: "</script><script>alert(document.cookie)</script>", tagline: null } });
    try {
      const tree = await withRequest(() =>
        StudioHomePage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve({}) })
      );
      const html = findProp<{ __html: string }>(tree, "dangerouslySetInnerHTML")?.__html ?? "";
      harness.assert(html.includes("alert(document.cookie)"), "The bio is in the search-engine data", html.slice(0, 120));
      harness.assert(!html.toLowerCase().includes("</script"), "…but can't close the script tag", html.slice(0, 200));
      harness.assertEqual(JSON.parse(html.replace(/\\u003c/g, "<")).description, "</script><script>alert(document.cookie)</script>", "…and still reads back as the same text");
    } finally {
      await db.tenant.update({ where: { id: lumina.id }, data: saved });
    }
  });

  await harness.test("T34-XSS-02: tagline and bio have length limits", async () => {
    const base = { tenantId: lumina.id, tenantSlug: "lumina-cine" };
    harness.assert(!UpdateStudioSettingsSchema.safeParse({ ...base, tagline: "x".repeat(201) }).success, "A 201-character tagline is refused");
    harness.assert(!UpdateStudioSettingsSchema.safeParse({ ...base, bio: "x".repeat(2001) }).success, "A 2001-character bio is refused");
    harness.assert(UpdateStudioSettingsSchema.safeParse({ ...base, tagline: "x".repeat(200), bio: "x".repeat(2000) }).success, "The limits themselves are fine");
  });

  // ── Task 5: studio sign-up needs an invite code ──────────────────────────────

  /** Runs `fn` with these env values (undefined = unset), then puts them back. */
  async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }
  const studioInput = (slug: string, signupCode?: string) => ({
    name: "T34 Signup Studio",
    slug,
    discipline: "HYBRID" as const,
    currency: "USD" as const,
    ownerName: "T34 Owner",
    ownerEmail: `${slug}@studio.test`,
    ownerPhone: "+15559876543",
    password: "StrongPassword123!",
    subscriptionTier: "PRO" as const,
    ...(signupCode === undefined ? {} : { signupCode }),
  });

  await harness.test("T34-SIGNUP-01: with an invite code set, studio sign-up needs it", async () => {
    await withEnv({ STUDIO_SIGNUP_CODE: "beta-friends-2026", APP_ENV: "production" }, async () => {
      harness.assertDeepEqual(await studioSignupStatus(), { open: true, needsCode: true }, "Sign-up asks for a code");
      for (const [label, code] of [["No code", undefined], ["Wrong code", "guess"]] as const) {
        const slug = `t34-signup-${run}-${label === "No code" ? "none" : "wrong"}`;
        const res = await withRequest(() => onboardStudio(studioInput(slug, code)));
        harness.assert(!res.success, `${label}: refused`, JSON.stringify(res));
        harness.assertEqual(await db.tenant.count({ where: { slug } }), 0, `${label}: no studio made`);
      }
      const slug = `t34-signup-${run}-ok`;
      const ok = await withRequest(() => onboardStudio(studioInput(slug, "beta-friends-2026")));
      harness.assert(ok.success, "The right code: the studio is made", JSON.stringify(ok));
      await db.tenant.delete({ where: { slug } }).catch(() => null);
    });
  });

  await harness.test("T34-SIGNUP-02: without a code, sign-up is closed in production and open elsewhere", async () => {
    await withEnv({ STUDIO_SIGNUP_CODE: undefined, APP_ENV: "production" }, async () => {
      harness.assertDeepEqual(await studioSignupStatus(), { open: false, needsCode: false }, "Production: closed");
      const slug = `t34-signup-${run}-closed`;
      const res = await withRequest(() => onboardStudio(studioInput(slug)));
      harness.assert(!res.success, "Production: sign-up refused", JSON.stringify(res));
      harness.assertEqual(await db.tenant.count({ where: { slug } }), 0, "…no studio made");
    });
    await withEnv({ STUDIO_SIGNUP_CODE: undefined, APP_ENV: "development" }, async () => {
      harness.assertDeepEqual(await studioSignupStatus(), { open: true, needsCode: false }, "Dev: open, no code");
    });
  });

  // ── Task 6: framing headers; test headers off in production ──────────────────

  await harness.test("T34-HEAD-01: every page refuses to be framed by other sites, and doesn't name the framework", async () => {
    harness.assertEqual(nextConfig.poweredByHeader, false, "No X-Powered-By header");
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*");
    const value = (key: string) => all?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
    harness.assertEqual(value("X-Frame-Options"), "SAMEORIGIN", "X-Frame-Options");
    harness.assertEqual(value("Content-Security-Policy"), "frame-ancestors 'self'", "frame-ancestors");
    harness.assertEqual(value("Referrer-Policy"), "strict-origin-when-cross-origin", "Referrer-Policy");
    harness.assertEqual(value("X-Content-Type-Options"), "nosniff", "nosniff");
    harness.assert(rules.some((r) => r.source === "/uploads/:path*"), "The uploads' own sandbox rules stay");
  });

  await harness.test("T34-HEAD-02: the test-only studio headers do nothing in production, and only take a plain name", async () => {
    const env = process.env as Record<string, string | undefined>;
    const ask = (headers: Record<string, string>) =>
      middleware(new NextRequest("http://localhost:3000/pricing", { headers: { host: "localhost:3000", ...headers } }));
    const rewritten = async (headers: Record<string, string>) => (await ask(headers)).headers.get("x-middleware-rewrite") ?? "";
    harness.assert((await rewritten({ "x-tenant-slug": "lumina-cine" })).endsWith("/lumina-cine/pricing"), "In tests the header still works");
    harness.assertEqual(await rewritten({ "x-tenant-slug": "victim/." }), "", "A slug with a slash or dot is ignored");
    const saved = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      harness.assertEqual(await rewritten({ "x-tenant-slug": "lumina-cine" }), "", "Production: x-tenant-slug is ignored");
      harness.assertEqual(await rewritten({ "x-custom-domain": "studio.luminacine.com" }), "", "Production: x-custom-domain is ignored");
    } finally {
      env.NODE_ENV = saved;
    }
  });

  // ── Task 7: payment slips, studio data on the visualizer, booking slots ──────

  await harness.test("T34-SLIP-01: a payment slip must be a file uploaded here", async () => {
    for (const schema of [ProcessBookingCheckoutSchema, ProcessInvoicePaymentSchema]) {
      const shape = schema.shape.paymentProofUrl;
      harness.assert(!shape.safeParse("https://evil.example/slip.jpg").success, "An outside link is refused");
      harness.assert(!shape.safeParse("/uploads/receipts/../../x.jpg").success, "A path that climbs out is refused");
      harness.assert(!shape.safeParse("/uploads/logos/a.png").success, "Another folder is refused");
      harness.assert(shape.safeParse("/uploads/receipts/1763600000000-a1b2c3.jpg").success, "An uploaded receipt is fine");
      harness.assert(shape.safeParse(undefined).success, "None at all is fine");
    }
  });

  /** Every object passed as a `tenant` prop anywhere in the tree. */
  const tenantProps = (node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      for (const child of node) tenantProps(child, out);
      return out;
    }
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return out;
    if (props.tenant && typeof props.tenant === "object") out.push(props.tenant as Record<string, unknown>);
    tenantProps(props.children, out);
    return out;
  };

  await harness.test("T34-DATA-01: the visualizer page sends the browser no payment keys or account fields", async () => {
    await provideReactGlobal();
    const tree = await withRequest(() =>
      VisualizerPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve({}) } as Parameters<typeof VisualizerPage>[0])
    );
    const tenants = tenantProps(tree);
    harness.assert(tenants.length > 0, "The page passes studio details to its components");
    for (const key of ["toyyibpaySecretEnc", "toyyibpayCategoryCode", "subscriptionTier", "customDomain"]) {
      harness.assert(!tenants.some((t) => key in t), `No ${key}`);
    }
  });

  await harness.test("T34-SLOT-01: the booking page never shows other visitors' hold ids", async () => {
    await provideReactGlobal();
    const slot = await db.bookingSlot.findFirstOrThrow({ where: { tenantId: lumina.id, status: "AVAILABLE", date: { gte: new Date() } } });
    const secret = `t34-hold-${run}`;
    await db.bookingSlot.update({ where: { id: slot.id }, data: { status: "HELD", heldBySessionId: secret, heldUntil: new Date(Date.now() + 10 * 60_000) } });
    try {
      const tree = await withRequest(() =>
        BookingPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve({}) } as Parameters<typeof BookingPage>[0])
      );
      const slots = findProp<Array<{ id: string; heldBySessionId: string | null }>>(tree, "initialSlots") ?? [];
      harness.assert(slots.some((s) => s.id === slot.id), "The held slot is listed");
      harness.assert(!JSON.stringify(slots).includes(secret), "…without its hold id");
    } finally {
      await db.bookingSlot.update({ where: { id: slot.id }, data: { status: "AVAILABLE", heldBySessionId: null, heldUntil: null } });
    }
  });

  await harness.test("T34-SLOT-02: one visitor can't hold slots without limit, and the slot-listing action is gone", async () => {
    harness.assert(!("getTenantBookingSlots" in bookingActions), "getTenantBookingSlots is no longer a public action");
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const replies: Array<{ success: boolean; error?: string }> = [];
    await withIp(ip, async () => {
      for (let i = 0; i < 31; i++) {
        replies.push(await bookingActions.holdBookingSlot({ tenantId: lumina.id, slotId: "t34-no-such-slot", sessionId: `t34-${run}` }));
      }
    });
    harness.assert(replies.slice(0, 30).every((r) => r.error !== "RATE_LIMITED"), "The first 30 aren't rate-limited", JSON.stringify(replies[0]));
    harness.assertEqual(replies[30]?.error, "RATE_LIMITED", "The 31st from the same visitor is");
  });

  // ── Task 8: a live address without APP_ENV doesn't start as a demo site ──────

  await harness.test("T34-START-01: a public https address with no APP_ENV refuses to start as a demo", async () => {
    const missing = settingsRefusal({ NEXT_PUBLIC_APP_URL: "https://cineflow-os.app" });
    harness.assert(!!missing && missing.includes("APP_ENV"), "No APP_ENV on the live address: refused, naming APP_ENV", String(missing));
    harness.assert(!!missing && missing.includes("APP_ENV=production"), "…saying what to set");
    harness.assertEqual(settingsRefusal({ NEXT_PUBLIC_APP_URL: "https://cineflow-os.app", APP_ENV: "staging" }), null, "Staging says so: fine");
    harness.assertEqual(settingsRefusal({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), null, "Dev on this computer: fine");
    harness.assertEqual(settingsRefusal({ NEXT_PUBLIC_APP_URL: "http://cineflow.localhost:3300" }), null, "A local test copy: fine");
    harness.assertEqual(settingsRefusal({ NEXT_PUBLIC_APP_URL: "https://app.example.com" }), null, "An example address: fine");
    harness.assertEqual(settingsRefusal({}), null, "No address at all (dev defaults): fine");
    const compose = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    const app = compose.slice(compose.indexOf("\n  app:"), compose.indexOf("\n  mailpit:"));
    const runtime = app.slice(app.indexOf("environment:"));
    harness.assert(/APP_ENV: \$\{APP_ENV:-\}/.test(runtime), "Docker passes APP_ENV through as given, never filling in development", runtime.slice(0, 200));
  });

  // ── Final review fixes ───────────────────────────────────────────────────────

  await harness.test("T34-FIX-01: the invite code can't be guessed over and over", async () => {
    await withEnv({ STUDIO_SIGNUP_CODE: "a-long-beta-code-2026", APP_ENV: "production" }, async () => {
      const ip = `192.0.2.${Math.floor(Math.random() * 200) + 20}`;
      const replies: Array<{ success: boolean; error?: string }> = [];
      await withIp(ip, async () => {
        for (let i = 0; i < 6; i++) replies.push(await withRequest(() => onboardStudio(studioInput(`t34-guess-${run}-${i}`, `guess-${i}`))));
      });
      harness.assert(replies.slice(0, 5).every((r) => !r.success && !/too many/i.test(r.error ?? "")), "The first wrong guesses are just wrong");
      harness.assert(/too many/i.test(replies[5]?.error ?? ""), "After 5 wrong guesses from one visitor, it stops answering", JSON.stringify(replies[5]));
    });
  });

  await harness.test("T34-FIX-02: signed-in clients don't share the anonymous upload limit; IPv6 visitors are grouped", async () => {
    const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "CLIENT", passwordHash: { not: null } } });
    const clientUser = { id: client.id, email: client.email, name: client.name, role: client.role, tenantId: client.tenantId, tenantSlug: "lumina-cine" };
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    const statuses: number[] = [];
    const saved: string[] = [];
    try {
      for (let i = 0; i < 22; i++) {
        const form = new FormData();
        form.append("file", new File([PNG], "slip.png", { type: "image/png" }));
        form.append("folder", "receipts");
        const res = await withSession(clientUser, () =>
          uploadPOST(new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: form, headers: { "cf-connecting-ip": ip } }))
        );
        statuses.push(res.status);
        if (res.status === 201) saved.push(((await res.json()) as { url: string }).url);
      }
    } finally {
      for (const url of saved) await rm(path.join(process.cwd(), "public", url.replace(/^\//, "")), { force: true });
    }
    harness.assert(statuses.every((s) => s === 201), "A signed-in client's 22 slips all go through", statuses.join(","));
    harness.assertEqual(
      clientIpFrom(headersOf({ "cf-connecting-ip": "2001:db8:1:2:aaaa::1" })),
      clientIpFrom(headersOf({ "cf-connecting-ip": "2001:db8:1:2:bbbb:cccc:dddd:9" })),
      "Two IPv6 addresses in one /64 count as one visitor"
    );
    harness.assertEqual(clientIpFrom(headersOf({ "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7", "IPv4 is unchanged");
  });

  await harness.test("T34-FIX-03: a booking attempt counts once, and failed attempts don't use up the limit", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const replies: Array<{ success: boolean; error?: string }> = [];
    await withIp(ip, async () => {
      for (let i = 0; i < 12; i++) {
        replies.push(await bookingActions.createClientBooking({ tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: "t34-no-such-slot" } as unknown as Parameters<typeof bookingActions.createClientBooking>[0]));
      }
    });
    harness.assert(!replies.some((r) => r.error === "RATE_LIMITED"), "12 failed tries from one visitor aren't rate-limited", replies.map((r) => r.error).join(","));
  });

  await harness.test("T34-FIX-04: the booking page makes a hold id even where crypto.randomUUID is missing (plain http)", async () => {
    const real = crypto.randomUUID;
    const ids: string[] = [];
    try {
      (crypto as { randomUUID?: unknown }).randomUUID = undefined;
      ids.push(randomId(), randomId());
    } finally {
      (crypto as { randomUUID: typeof real }).randomUUID = real;
    }
    harness.assert(ids.every((id) => /^[0-9a-f-]{32,}$/.test(id)), "A long random id without randomUUID", ids.join(" "));
    harness.assert(ids[0] !== ids[1], "…different each time");
    harness.assert(read34("components/booking/cinema-booking-shell.tsx").includes("randomId()"), "The booking page uses it");
  });

  await harness.test("T34-FIX-05: APP_ENV=development on a live address refuses too", async () => {
    const refusal = settingsRefusal({ APP_ENV: "development", NEXT_PUBLIC_APP_URL: "https://cineflow-os.app" });
    harness.assert(!!refusal && refusal.includes("APP_ENV=production"), "Refused, saying what to set", String(refusal));
    harness.assertEqual(settingsRefusal({ APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), null, "Dev on this computer: fine");
  });
}
