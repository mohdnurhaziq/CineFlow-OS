/**
 * Tier 9: Toyyibpay payment gateway
 * Stage 1 covers the encryption helper and the API client with `fetch` stubbed
 * (no network, no real money).
 */

import { TestHarness } from "./test-harness";
import { encryptSecret, decryptSecret } from "../../lib/crypto/secret-box";
import { createBill, findSuccessfulPayment, sanitizeBillText, toSen } from "../../lib/payments/toyyibpay";

type Call = { url: string; body: URLSearchParams };

export async function runTier9ToyyibpayTests(harness: TestHarness) {
  harness.setSuite("Tier 9", "Toyyibpay Payment Gateway");

  const realFetch = globalThis.fetch;
  const savedBase = process.env.TOYYIBPAY_BASE_URL;
  const originalError = console.error;
  harness.registerTeardown(() => {
    globalThis.fetch = realFetch;
    console.error = originalError;
    if (savedBase === undefined) delete process.env.TOYYIBPAY_BASE_URL;
    else process.env.TOYYIBPAY_BASE_URL = savedBase;
  });
  delete process.env.TOYYIBPAY_BASE_URL;

  const stub = (respond: (c: Call) => { status?: number; body: string }) => {
    const calls: Call[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const call = { url: String(url), body: new URLSearchParams(String(init?.body ?? "")) };
      calls.push(call);
      const r = respond(call);
      return new Response(r.body, { status: r.status ?? 200 });
    }) as typeof fetch;
    return calls;
  };

  const creds = { secretKey: "sk-test-123", categoryCode: "cat123" };
  const bill = {
    reference: "INV-2026-123456",
    name: "Booking Deposit",
    description: "Deposit for session",
    amountMyr: 150,
    payer: { name: "Aisha", email: "aisha@example.test", phone: "+60 12-345 6789" },
    returnUrl: "https://cineflow.app/lumina-cine/checkout/payment-return",
    callbackUrl: "https://cineflow.app/api/payments/toyyibpay/callback",
  };

  // ---- Secret box ------------------------------------------------------------
  await harness.test("T9-SEC-01: secrets round-trip and are never stored in plaintext", async () => {
    const enc = encryptSecret("my-toyyibpay-secret");
    harness.assert(!enc.includes("my-toyyibpay-secret"), "Ciphertext does not contain the plaintext");
    harness.assertEqual(decryptSecret(enc), "my-toyyibpay-secret", "Decrypts to the original");
    harness.assertNotEqual(encryptSecret("x"), encryptSecret("x"), "Random IV: same input encrypts differently");
  });

  await harness.test("T9-SEC-02: tampered, truncated or empty ciphertext decrypts to null, never throws", async () => {
    const enc = encryptSecret("secret");
    const parts = enc.split(".");
    const flipped = [...parts.slice(0, 3), parts[3]!.slice(0, -2) + (parts[3]!.endsWith("AA") ? "BB" : "AA")].join(".");
    harness.assert(decryptSecret(flipped) === null, "Modified data rejected (GCM auth)");
    harness.assert(decryptSecret(enc.slice(0, 20)) === null, "Truncated value rejected");
    harness.assert(decryptSecret("") === null && decryptSecret(null) === null && decryptSecret(undefined) === null, "Empty values -> null");
    harness.assert(decryptSecret("v9.a.b.c") === null, "Unknown version rejected");
  });

  // ---- Helpers ---------------------------------------------------------------
  await harness.test("T9-API-01: amounts convert to integer sen without float drift", async () => {
    harness.assertEqual(toSen(150), 15000, "RM150 -> 15000 sen");
    harness.assertEqual(toSen(19.99), 1999, "19.99 -> 1999");
    harness.assertEqual(toSen(1.005), 101, "Half-sen rounds to nearest");
    harness.assertEqual(toSen(0.1 + 0.2), 30, "0.1+0.2 -> 30");
  });

  await harness.test("T9-API-02: bill text is limited to the characters and lengths Toyyibpay accepts", async () => {
    harness.assertEqual(sanitizeBillText("Aisha's <Wedding> & Co.", 30), "Aisha s Wedding Co", "Special characters removed");
    harness.assertEqual(sanitizeBillText("x".repeat(80), 30).length, 30, "Truncated to max");
    harness.assertEqual(sanitizeBillText("!!!", 30), "Payment", "Empty result falls back to a default");
  });

  // ---- createBill ------------------------------------------------------------
  await harness.test("T9-API-03: createBill sends the right form and returns the hosted payment URL", async () => {
    const calls = stub(() => ({ body: JSON.stringify([{ BillCode: "abc123xy" }]) }));
    const res = await createBill(creds, bill);
    harness.assert(res.ok === true, "Succeeds");
    if (res.ok) {
      harness.assertEqual(res.billCode, "abc123xy", "Bill code returned");
      harness.assertEqual(res.paymentUrl, "https://toyyibpay.com/abc123xy", "Hosted payment URL");
    }
    harness.assertEqual(calls.length, 1, "One request");
    harness.assertEqual(calls[0]!.url, "https://toyyibpay.com/index.php/api/createBill", "createBill endpoint");
    const f = calls[0]!.body;
    harness.assertEqual(f.get("userSecretKey"), "sk-test-123", "Secret key sent");
    harness.assertEqual(f.get("categoryCode"), "cat123", "Category sent");
    harness.assertEqual(f.get("billAmount"), "15000", "Amount in sen");
    harness.assertEqual(f.get("billPriceSetting"), "1", "Fixed price");
    harness.assertEqual(f.get("billExternalReferenceNo"), "INV-2026-123456", "Invoice number as external reference");
    harness.assertEqual(f.get("billPaymentChannel"), "2", "FPX and card");
    harness.assertEqual(f.get("billPhone"), "+60123456789", "Phone digits only");
    harness.assertEqual(f.get("billReturnUrl"), bill.returnUrl, "Return URL");
    harness.assertEqual(f.get("billCallbackUrl"), bill.callbackUrl, "Callback URL");
  });

  await harness.test("T9-API-04: sandbox base URL is honoured", async () => {
    process.env.TOYYIBPAY_BASE_URL = "https://dev.toyyibpay.com/";
    const calls = stub(() => ({ body: JSON.stringify([{ BillCode: "sbx1" }]) }));
    const res = await createBill(creds, bill);
    harness.assertEqual(calls[0]!.url, "https://dev.toyyibpay.com/index.php/api/createBill", "Sandbox endpoint (trailing slash trimmed)");
    harness.assert(res.ok && res.paymentUrl === "https://dev.toyyibpay.com/sbx1", "Sandbox payment URL");
    delete process.env.TOYYIBPAY_BASE_URL;
  });

  await harness.test("T9-API-05: gateway errors are reported without leaking the secret key", async () => {
    console.error = () => undefined;
    for (const body of ["[KEY-DID-NOT-EXIST]", JSON.stringify({ status: "error", msg: "bad" }), "[]", "not json"]) {
      stub(() => ({ body }));
      const res = await createBill(creds, bill);
      harness.assert(res.ok === false, `Rejects response ${body.slice(0, 24)}`);
      if (!res.ok) harness.assert(!res.error.includes("sk-test-123"), "Error text has no secret");
    }
    stub(() => ({ status: 500, body: "boom" }));
    harness.assert((await createBill(creds, bill)).ok === false, "HTTP 500 rejected");
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const net = await createBill(creds, bill);
    harness.assert(net.ok === false, "Network failure rejected, not thrown");
    console.error = originalError;
  });

  await harness.test("T9-API-06: amounts under RM1 are refused before any request", async () => {
    const calls = stub(() => ({ body: JSON.stringify([{ BillCode: "x" }]) }));
    const res = await createBill(creds, { ...bill, amountMyr: 0.5 });
    harness.assert(res.ok === false, "Rejected");
    harness.assertEqual(calls.length, 0, "No request made");
  });

  // ---- getBillTransactions ---------------------------------------------------
  await harness.test("T9-API-07: findSuccessfulPayment returns the paid transaction", async () => {
    const calls = stub(() => ({
      body: JSON.stringify([
        { billpaymentStatus: "3", billpaymentAmount: "150.00", billExternalReferenceNo: "INV-2026-123456" },
        { billpaymentStatus: "1", billpaymentAmount: "150.00", billpaymentInvoiceNo: "TP2605123", billExternalReferenceNo: "INV-2026-123456" },
      ]),
    }));
    const paid = await findSuccessfulPayment(creds, "abc123xy");
    harness.assertEqual(paid?.amountMyr, 150, "Amount parsed");
    harness.assertEqual(paid?.invoiceNo, "TP2605123", "Gateway invoice number");
    harness.assertEqual(paid?.externalReference, "INV-2026-123456", "External reference");
    harness.assertEqual(calls[0]!.url, "https://toyyibpay.com/index.php/api/getBillTransactions", "Endpoint");
    harness.assertEqual(calls[0]!.body.get("billCode"), "abc123xy", "Bill code sent");
    harness.assertEqual(calls[0]!.body.get("billpaymentStatus"), "1", "Filters to successful payments");
  });

  await harness.test("T9-API-08: unpaid, failed, malformed or unreachable all mean 'not paid'", async () => {
    console.error = () => undefined;
    for (const body of ["[]", JSON.stringify([{ billpaymentStatus: "3", billpaymentAmount: "150" }]), JSON.stringify([{ billpaymentStatus: "2" }]), "{}", "not json", JSON.stringify([{ billpaymentStatus: "1", billpaymentAmount: "abc" }])]) {
      stub(() => ({ body }));
      harness.assert((await findSuccessfulPayment(creds, "b")) === null, `null for ${body.slice(0, 40)}`);
    }
    stub(() => ({ status: 503, body: "down" }));
    harness.assert((await findSuccessfulPayment(creds, "b")) === null, "HTTP error -> null");
    globalThis.fetch = (async () => {
      throw new Error("timeout");
    }) as typeof fetch;
    harness.assert((await findSuccessfulPayment(creds, "b")) === null, "Network error -> null");
    console.error = originalError;
  });
}
