/**
 * Tier 8: Transactional Email Delivery (Resend)
 * Verifies real-provider dispatch behaviour with `fetch` stubbed (no network):
 * skip without a key, request shape, channel routing, failure isolation,
 * and HTML-escaping of untrusted values in outgoing mail.
 */

import { TestHarness } from "./test-harness";
import { sendNotification, type NotificationPayload } from "../../lib/notifications";

type FetchCall = { url: string; init: RequestInit };

export async function runTier8EmailDeliveryTests(harness: TestHarness) {
  harness.setSuite("Tier 8", "Transactional Email Delivery (Resend)");

  const realFetch = globalThis.fetch;
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.RESEND_FROM_EMAIL;
  const originalError = console.error;

  harness.registerTeardown(() => {
    globalThis.fetch = realFetch;
    console.error = originalError;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = savedFrom;
  });

  const stubFetch = (respond: (call: FetchCall) => Response | Promise<Response>) => {
    const calls: FetchCall[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const call = { url: String(url), init: init ?? {} };
      calls.push(call);
      return respond(call);
    }) as typeof fetch;
    return calls;
  };

  const payload = (over: Partial<Record<string, string>> = {}): NotificationPayload => ({
    event: "PAYMENT_REJECTED",
    studioName: "Lumina CineWorks",
    studioSlug: "lumina-cine",
    clientName: "Aisha Rahman",
    clientEmail: "aisha@example.test",
    clientPhone: "+60123456789",
    invoiceNumber: "INV-1001",
    amount: 250,
    currency: "MYR",
    reason: "Receipt unreadable",
    reuploadUrl: "https://cineflow.app/lumina-cine/my-booking",
    ...over,
  });

  const ok = () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 });

  await harness.test("T8-EML-01: without RESEND_API_KEY the email is skipped and nothing is fetched", async () => {
    delete process.env.RESEND_API_KEY;
    const calls = stubFetch(ok);
    const res = await sendNotification(payload());
    harness.assertEqual(calls.length, 0, "No network call made");
    harness.assertEqual(res.emailDelivery, "SKIPPED", "emailDelivery is SKIPPED");
    harness.assert(res.success === true, "Notification still reports success (no provider configured)");
    harness.assert(res.emailHtml.length > 0, "Email content is still generated for audit/preview");
  });

  await harness.test("T8-EML-02: with a key, sends one authenticated POST to Resend with the rendered email", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Lumina <noreply@lumina.test>";
    const calls = stubFetch(ok);
    const res = await sendNotification(payload());
    harness.assertEqual(calls.length, 1, "Exactly one request");
    harness.assertEqual(calls[0]!.url, "https://api.resend.com/emails", "Targets the Resend API");
    harness.assertEqual(calls[0]!.init.method, "POST", "Uses POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    harness.assertEqual(headers.Authorization, "Bearer re_test_key", "Bearer auth header");
    const body = JSON.parse(String(calls[0]!.init.body));
    harness.assertDeepEqual(body.to, ["aisha@example.test"], "Recipient is the client");
    harness.assertEqual(body.from, "Lumina <noreply@lumina.test>", "Uses RESEND_FROM_EMAIL");
    harness.assert(String(body.subject).includes("INV-1001"), "Subject carries the invoice number");
    harness.assert(String(body.html).includes("Receipt unreadable"), "HTML body carries the reviewer note");
    harness.assert(typeof body.text === "string" && body.text.length > 0, "Plain-text alternative included");
    harness.assertEqual(res.emailDelivery, "SENT", "emailDelivery is SENT");
    harness.assert(res.success === true, "success true");
  });

  await harness.test("T8-EML-03: WHATSAPP-only channel never sends email", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(ok);
    const res = await sendNotification(payload(), "WHATSAPP");
    harness.assertEqual(calls.length, 0, "No email request");
    harness.assertEqual(res.emailDelivery, "SKIPPED", "SKIPPED");
    harness.assert(!!res.whatsappUrl, "WhatsApp link still generated");
  });

  await harness.test("T8-EML-04: provider errors and network failures are reported, never thrown", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    console.error = () => undefined; // silence expected error logs
    stubFetch(() => new Response(JSON.stringify({ message: "domain not verified" }), { status: 422 }));
    const rejected = await sendNotification(payload());
    harness.assertEqual(rejected.emailDelivery, "FAILED", "422 -> FAILED");
    harness.assert(rejected.success === false, "success false on provider rejection");
    harness.assert(String(rejected.emailError).includes("422"), "Error mentions status");
    harness.assert(!String(rejected.emailError).includes("re_test_key"), "API key never leaks into the error");

    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const dropped = await sendNotification(payload());
    harness.assertEqual(dropped.emailDelivery, "FAILED", "Network error -> FAILED");
    harness.assert(dropped.success === false, "success false on network error");
    console.error = originalError;
  });

  await harness.test("T8-EML-05: untrusted values are HTML-escaped in the email body but not in plain text", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(ok);
    const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>`;
    await sendNotification(payload({ clientName: evil, reason: evil, studioName: evil }));
    const body = JSON.parse(String(calls[0]!.init.body));
    harness.assert(!String(body.html).includes("<script>"), "No raw <script> in HTML");
    harness.assert(!String(body.html).includes("<img src=x"), "No raw <img> injection in HTML");
    harness.assert(String(body.html).includes("&lt;script&gt;"), "Script text is escaped, not dropped");
    harness.assert(!/<(p|div|table|strong)\b/i.test(String(body.text)), "Plain-text part contains no HTML markup");
    harness.assert(String(body.text).includes("INV-1001"), "Plain-text part still carries the invoice number");
  });

  await harness.test("T8-EML-06: line breaks in values cannot inject extra subject/header lines", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(ok);
    await sendNotification(payload({ invoiceNumber: "INV-1\r\nBcc: attacker@evil.test" }));
    const body = JSON.parse(String(calls[0]!.init.body));
    harness.assert(!/[\r\n]/.test(String(body.subject)), "Subject has no CR/LF");
  });

  await harness.test("T8-EML-07: notification with no recipient email is skipped safely", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(ok);
    const res = await sendNotification(payload({ clientEmail: "" }));
    harness.assertEqual(calls.length, 0, "No request without a recipient");
    harness.assertEqual(res.emailDelivery, "SKIPPED", "SKIPPED");
  });
}
