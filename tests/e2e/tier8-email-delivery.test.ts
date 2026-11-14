/**
 * Tier 8: Transactional Email Delivery (Resend)
 * Verifies real-provider dispatch behaviour with `fetch` stubbed (no network):
 * skip without a key, request shape, channel routing, failure isolation,
 * and HTML-escaping of untrusted values in outgoing mail.
 */

import { TestHarness } from "./test-harness";
import nodemailer, { type Transporter } from "nodemailer";
import { sendNotification, type NotificationPayload } from "../../lib/notifications";
import { DEFAULT_NO_AUTH_FROM, formatFrom, setSmtpTransportForTests, smtpConfigFromEnv } from "../../lib/email/smtp";

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
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
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

  // ---- SMTP (e.g. Gmail) ----------------------------------------------------------------
  // Sends go through nodemailer's jsonTransport (builds the full message, sends nothing).
  harness.setSuite("Tier 8", "Transactional Email Delivery (SMTP / Gmail)");
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;
  const savedSmtp = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
  harness.registerTeardown(() => {
    setSmtpTransportForTests(null);
    for (const k of SMTP_KEYS) {
      if (savedSmtp[k] === undefined) delete process.env[k];
      else process.env[k] = savedSmtp[k];
    }
  });
  const gmail = () => {
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "studio.owner@gmail.com";
    process.env.SMTP_PASS = "abcd efgh ijkl mnop";
  };
  type Sent = { from: string; to: string; subject: string; html: string; text: string; built: string };
  const captureSmtp = () => {
    const sent: Sent[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({
      sendMail: async (mail: Sent) => {
        const info = await json.sendMail(mail); // proves the message builds
        sent.push({ ...mail, built: String((info as { message?: unknown }).message ?? "") });
        return info;
      },
    } as unknown as Transporter);
    return sent;
  };
  const failSmtp = (error: Record<string, unknown>) =>
    setSmtpTransportForTests({
      sendMail: async () => {
        throw Object.assign(new Error(String(error.message ?? "smtp failure")), error);
      },
    } as unknown as Transporter);

  await harness.test("T8-SMTP-01: SMTP settings are read from the environment (Gmail defaults)", async () => {
    gmail();
    const c = smtpConfigFromEnv();
    harness.assert(c !== null, "Configured when host, user and password are set");
    harness.assertEqual(c?.port, 465, "Port 465");
    harness.assertEqual(c?.secure, true, "TLS on 465");
    harness.assertEqual(c?.auth?.pass, "abcdefghijklmnop", "App password spaces are removed");
    harness.assertEqual(c?.fromAddress, "studio.owner@gmail.com", "Sender defaults to SMTP_USER");
    process.env.SMTP_PORT = "587";
    harness.assertEqual(smtpConfigFromEnv()?.secure, false, "STARTTLS on 587");
    console.error = () => {};
    try {
      delete process.env.SMTP_PASS;
      harness.assertEqual(smtpConfigFromEnv(), null, "A user without a password is a mistake: SMTP stays off");
      process.env.SMTP_PASS = "abcdefghijklmnop";
      delete process.env.SMTP_USER;
      harness.assertEqual(smtpConfigFromEnv(), null, "A password without a user is a mistake: SMTP stays off");
    } finally {
      console.error = originalError;
    }
  });

  await harness.test("T8-SMTP-06: a server without login (Mailpit) needs only host and port", async () => {
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    const c = smtpConfigFromEnv();
    harness.assert(c !== null, "Configured with host and port only");
    harness.assertEqual(c?.auth, null, "No login");
    harness.assertEqual(c?.secure, false, "Plain SMTP on 1025");
    harness.assertEqual(c?.fromAddress, DEFAULT_NO_AUTH_FROM, "Default sender address");
    const sent = captureSmtp();
    const res = await sendNotification(payload());
    harness.assertEqual(res.emailDelivery, "SENT", "SENT");
    harness.assertEqual(sent[0]?.from, `"Lumina CineWorks" <${DEFAULT_NO_AUTH_FROM}>`, "From: studio name, default address");
    process.env.SMTP_FROM_ADDRESS = "bookings@studio.test";
    harness.assertEqual(smtpConfigFromEnv()?.fromAddress, "bookings@studio.test", "SMTP_FROM_ADDRESS overrides the sender");
  });

  await harness.test("T8-SMTP-02: with SMTP set, email goes over SMTP from the studio's name, not to Resend", async () => {
    gmail();
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(() => new Response("{}", { status: 200 }));
    const sent = captureSmtp();
    const res = await sendNotification(payload());
    harness.assertEqual(res.emailDelivery, "SENT", "SENT over SMTP");
    harness.assertEqual(calls.length, 0, "Resend is not called when SMTP is configured");
    harness.assertEqual(sent.length, 1, "One SMTP message");
    harness.assertEqual(sent[0]?.from, '"Lumina CineWorks" <studio.owner@gmail.com>', "From: studio name, Gmail address");
    harness.assertEqual(sent[0]?.to, "aisha@example.test", "To the client");
    harness.assert((sent[0]?.subject ?? "").length > 0 && (sent[0]?.html ?? "").includes("<html"), "Subject and HTML body present");
    harness.assert((sent[0]?.built ?? "").includes("aisha@example.test"), "nodemailer built the message");
  });

  await harness.test("T8-SMTP-03: a hostile studio name cannot add headers or break the From line", async () => {
    harness.assertEqual(formatFrom('Evil"\r\nBcc: victim@x.test <x>', "a@gmail.com"), '"Evil Bcc: victim@x.test x" <a@gmail.com>', "Quotes, angle brackets and line breaks stripped");
    harness.assertEqual(formatFrom("", "a@gmail.com"), "a@gmail.com", "No name: bare address");
    gmail();
    const sent = captureSmtp();
    await sendNotification({ ...payload(), studioName: "Lumina\r\nBcc: victim@x.test" });
    harness.assert(!/\r|\n/.test(sent[0]?.from ?? "") && !/\r|\n/.test(sent[0]?.subject ?? ""), "No line breaks in From or Subject");
  });

  await harness.test("T8-SMTP-04: SMTP failures are reported in plain words, never thrown", async () => {
    gmail();
    console.error = () => {};
    try {
      failSmtp({ code: "EAUTH", responseCode: 535, response: "535-5.7.8 Username and Password not accepted" });
      const auth = await sendNotification(payload());
      harness.assertEqual(auth.emailDelivery, "FAILED", "Bad login -> FAILED");
      harness.assert(/App Password/.test(auth.emailError ?? ""), "Tells the owner to use a Gmail App Password", auth.emailError);

      failSmtp({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded." });
      const limit = await sendNotification(payload());
      harness.assert(/daily sending limit/i.test(limit.emailError ?? ""), "Daily limit explained", limit.emailError);

      failSmtp({ code: "ETIMEDOUT" });
      const down = await sendNotification(payload());
      harness.assert(/Couldn't reach the email server/.test(down.emailError ?? ""), "Unreachable server explained", down.emailError);
    } finally {
      console.error = originalError;
    }
  });

  await harness.test("T8-SMTP-05: without SMTP settings, Resend is still used", async () => {
    for (const k of SMTP_KEYS) delete process.env[k];
    setSmtpTransportForTests(null);
    process.env.RESEND_API_KEY = "re_test_key";
    const calls = stubFetch(() => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const res = await sendNotification(payload());
    harness.assertEqual(res.emailDelivery, "SENT", "SENT via Resend");
    harness.assertEqual(calls.length, 1, "One Resend request");
  });
}
