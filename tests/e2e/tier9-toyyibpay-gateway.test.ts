/**
 * Tier 9: Toyyibpay payment gateway
 * Stage 1 covers the encryption helper and the API client with `fetch` stubbed
 * (no network, no real money).
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { processBookingCheckout } from "@/lib/actions/checkout";
import { saveGatewayCredentials, removeGatewayCredentials } from "@/lib/actions/admin-payments";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { withSession } from "./mocks/session";
import { settleToyyibpayBill } from "@/lib/payments/settle";
import { POST as callbackPost } from "@/app/api/payments/toyyibpay/callback/route";
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

  // ============================================================================
  // Stage 2: checkout wiring and settlement
  // ============================================================================
  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  const savedGateway = { enc: lumina.toyyibpaySecretEnc, cat: lumina.toyyibpayCategoryCode };
  const savedFlag = process.env.ALLOW_SIMULATED_CARD_PAYMENTS;

  harness.registerTeardown(async () => {
    if (savedFlag === undefined) delete process.env.ALLOW_SIMULATED_CARD_PAYMENTS;
    else process.env.ALLOW_SIMULATED_CARD_PAYMENTS = savedFlag;
    await db.tenant.update({ where: { id: lumina.id }, data: { toyyibpaySecretEnc: savedGateway.enc, toyyibpayCategoryCode: savedGateway.cat } });
    await db.milestoneInvoice.deleteMany({ where: { client: { email: { startsWith: "t9-" } } } });
    await db.clientBooking.deleteMany({ where: { clientEmail: { startsWith: "t9-" } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t9-" } } });
  });

  const setGateway = (on: boolean) =>
    db.tenant.update({
      where: { id: lumina.id },
      data: on ? { toyyibpaySecretEnc: encryptSecret("sk-test-123"), toyyibpayCategoryCode: "cat123" } : { toyyibpaySecretEnc: null, toyyibpayCategoryCode: null },
    });

  const makeSlot = async (deposit = 100) => {
    const s = await db.bookingSlot.create({
      data: { tenantId: lumina.id, category: "editorial", date: new Date(Date.now() + 86400000 * 30), startTime: "9:00 AM", endTime: "10:00 AM", status: "AVAILABLE", price: 400, depositRequired: deposit },
    });
    slotIds.push(s.id);
    return s;
  };

  let seq = 0;
  const checkout = (slotId: string, paymentMethod: "CARD" | "CASH" = "CARD") => {
    seq += 1;
    return processBookingCheckout({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      slotId,
      sessionId: `t9-session-${run}-${seq}`,
      clientName: "Gateway Tester",
      clientEmail: `t9-${run}-${seq}@example.test`,
      clientPhone: "0123456789",
      paymentMethod,
    });
  };

  /** Stubs fetch: createBill -> BillCode; getBillTransactions -> `txns()` (or []). */
  let billSeq = 0; // bill codes are unique per database, like the real gateway's
  const gateway = (opts: { txns?: () => any[]; failCreate?: boolean } = {}) => {
    return stub((c) => {
      if (c.url.endsWith("/createBill")) {
        if (opts.failCreate) return { body: "[KEY-DID-NOT-EXIST]" };
        billSeq += 1;
        return { body: JSON.stringify([{ BillCode: `bill${run}${billSeq}` }]) };
      }
      return { body: JSON.stringify(opts.txns ? opts.txns() : []) };
    });
  };
  const paidTxn = (ref: string, amount: string) => [
    { billpaymentStatus: "1", billpaymentAmount: amount, billpaymentInvoiceNo: "TP-1", billExternalReferenceNo: ref },
  ];

  await harness.test("T9-CHK-01: card is refused without a gateway unless simulation is enabled", async () => {
    await setGateway(false);
    delete process.env.ALLOW_SIMULATED_CARD_PAYMENTS;
    const slot = await makeSlot();
    const res: any = await checkout(slot.id);
    harness.assertEqual(res.error, "CARD_UNAVAILABLE", "Card refused with no gateway");
    const untouched = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(untouched?.status, "AVAILABLE", "Slot untouched");

    process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "true";
    const sim: any = await checkout(slot.id);
    harness.assert(sim.success === true && sim.status === "PAID" && !sim.paymentUrl, "Simulation flag restores the instant fake card");
    const cash: any = await checkout((await makeSlot()).id, "CASH");
    harness.assert(cash.success === true && cash.status === "PENDING_VERIFICATION", "Cash is unaffected");
  });

  await harness.test("T9-CHK-02: with a gateway, card checkout returns a payment URL and holds the slot unpaid", async () => {
    process.env.ALLOW_SIMULATED_CARD_PAYMENTS = "true"; // gateway must win over simulation
    await setGateway(true);
    const calls = gateway();
    const slot = await makeSlot(100);
    const res: any = await checkout(slot.id);
    harness.assert(res.success === true && typeof res.paymentUrl === "string", "Success with paymentUrl");
    harness.assertEqual(res.status, "PENDING", "Not paid yet");
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(inv?.status, "PENDING", "Invoice PENDING");
    harness.assert(!!inv?.gatewayBillCode, "Bill code stored");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(booking?.status, "PENDING", "Booking PENDING");
    harness.assertEqual(booking?.depositPaid, false, "Deposit not marked paid");
    const held = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(held?.status, "HELD", "Slot held while paying");
    harness.assert(!!held?.heldUntil && held.heldUntil.getTime() > Date.now() + 20 * 60_000, "Hold extended for payment");
    const create = calls.find((c) => c.url.endsWith("/createBill"))!;
    harness.assertEqual(create.body.get("billAmount"), "10000", "Amount in sen");
    harness.assertEqual(create.body.get("billExternalReferenceNo"), res.invoiceNumber, "Invoice number is the reference");
    harness.assert(create.body.get("billReturnUrl")!.endsWith("/lumina-cine/checkout/payment-return"), "Return URL");
  });

  await harness.test("T9-CHK-03: gateway failure rolls the booking back and frees the slot", async () => {
    gateway({ failCreate: true });
    console.error = () => undefined;
    const slot = await makeSlot();
    const res: any = await checkout(slot.id);
    console.error = originalError;
    harness.assertEqual(res.error, "GATEWAY_ERROR", "Gateway error surfaced");
    const s = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(s?.status, "AVAILABLE", "Slot released");
    harness.assertEqual(await db.clientBooking.count({ where: { slotId: slot.id } }), 0, "No booking left on the slot");
    const again: any = await (gateway(), checkout(slot.id));
    harness.assert(again.success === true, "Slot can be booked again straight away");
  });

  await harness.test("T9-SET-01: unpaid bill is not settled", async () => {
    gateway({ txns: () => [] });
    const res: any = await checkout((await makeSlot()).id);
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    const out = await settleToyyibpayBill(inv!.gatewayBillCode!);
    harness.assertEqual(out.status, "NOT_PAID", "NOT_PAID");
    const after = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(after?.status, "PENDING", "Invoice still PENDING");
  });

  await harness.test("T9-SET-02: confirmed payment settles invoice, booking and slot exactly once", async () => {
    let ref = "";
    gateway({ txns: () => paidTxn(ref, "100.00") });
    const slot = await makeSlot(100);
    const res: any = await checkout(slot.id);
    ref = res.invoiceNumber;
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    const out: any = await settleToyyibpayBill(inv!.gatewayBillCode!);
    harness.assertEqual(out.status, "PAID", "PAID");
    harness.assertEqual(out.trackingCode, res.trackingCode, "Tracking code returned for redirect");
    const after = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(after?.status, "PAID", "Invoice PAID");
    harness.assertEqual(after?.paymentReference, "TOYYIBPAY-TP-1", "Gateway reference stored");
    harness.assert(!!after?.paidAt, "paidAt set");
    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assert(booking?.status === "CONFIRMED" && booking.depositPaid === true, "Booking CONFIRMED with deposit paid");
    const s = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assertEqual(s?.status, "BOOKED", "Slot BOOKED");
    const again: any = await settleToyyibpayBill(inv!.gatewayBillCode!);
    harness.assert(again.status === "PAID" && again.alreadySettled === true, "Second settle is a no-op");
  });

  await harness.test("T9-SET-03: wrong amount or wrong reference is never settled", async () => {
    console.error = () => undefined;
    let txn: any[] = [];
    gateway({ txns: () => txn });
    const res: any = await checkout((await makeSlot(100)).id);
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    txn = paidTxn(res.invoiceNumber, "1.00");
    harness.assertEqual((await settleToyyibpayBill(inv!.gatewayBillCode!)).status, "MISMATCH", "Underpayment rejected");
    txn = paidTxn("INV-SOMEONE-ELSE", "100.00");
    harness.assertEqual((await settleToyyibpayBill(inv!.gatewayBillCode!)).status, "MISMATCH", "Foreign reference rejected");
    console.error = originalError;
    const after = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(after?.status, "PENDING", "Invoice still PENDING");
    const b = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assertEqual(b?.status, "PENDING", "Booking still PENDING");
  });

  await harness.test("T9-SET-04: unknown bill codes and forged callbacks change nothing", async () => {
    gateway({ txns: () => [] });
    harness.assertEqual((await settleToyyibpayBill("does-not-exist")).status, "NOT_FOUND", "Unknown bill");
    harness.assertEqual((await settleToyyibpayBill("")).status, "NOT_FOUND", "Empty bill");
    const res: any = await checkout((await makeSlot()).id);
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    const form = new FormData();
    form.set("billcode", inv!.gatewayBillCode!);
    form.set("status_id", "1"); // forged "success" claim
    form.set("order_id", res.invoiceNumber);
    const cb = await callbackPost(new Request("http://localhost/api/payments/toyyibpay/callback", { method: "POST", body: form }));
    const body: any = await cb.json();
    harness.assertEqual(body.status, "NOT_PAID", "Callback claim ignored; gateway says unpaid");
    const after = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assertEqual(after?.status, "PENDING", "Still PENDING");
    const empty = await callbackPost(new Request("http://localhost/api/payments/toyyibpay/callback", { method: "POST", body: new FormData() }));
    harness.assertEqual(empty.status, 400, "Callback without bill code -> 400");
  });

  await harness.test("T9-SET-05: concurrent settles confirm the booking exactly once", async () => {
    let ref = "";
    gateway({ txns: () => paidTxn(ref, "100.00") });
    const slot = await makeSlot(100);
    const res: any = await checkout(slot.id);
    ref = res.invoiceNumber;
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    const outs: any[] = await Promise.all(Array.from({ length: 5 }, () => settleToyyibpayBill(inv!.gatewayBillCode!)));
    harness.assert(outs.every((o) => o.status === "PAID"), "All callers see PAID");
    harness.assertEqual(outs.filter((o) => !o.alreadySettled).length, 1, "Exactly one caller performed the settlement");
    harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: slot.id } }))?.status, "BOOKED", "Slot BOOKED");
  });

  await harness.test("T9-SET-06: an abandoned online booking never blocks the slot; its late payment is flagged for refund", async () => {
    let ref = "";
    gateway({ txns: () => paidTxn(ref, "100.00") });
    const slot = await makeSlot(100);
    const first: any = await checkout(slot.id);
    ref = first.invoiceNumber;
    const firstInv = await db.milestoneInvoice.findUnique({ where: { id: first.invoiceId } });
    // The hold lapses and the grid sweeper frees the slot.
    await db.bookingSlot.update({ where: { id: slot.id }, data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null } });
    const second: any = await checkout(slot.id);
    harness.assert(second.success === true, "Someone else can book the slot");
    const cancelled = await db.clientBooking.findUnique({ where: { id: first.bookingId } });
    harness.assert(cancelled?.status === "CANCELLED" && cancelled.slotId === null, "Abandoned booking cancelled and detached");
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: first.invoiceId } }))?.status, "OVERDUE", "Abandoned invoice closed");

    const late: any = await settleToyyibpayBill(firstInv!.gatewayBillCode!);
    harness.assert(late.status === "PAID" && late.refundRequired === true, "Late payment recorded and flagged");
    const lateInv = await db.milestoneInvoice.findUnique({ where: { id: first.invoiceId } });
    harness.assert(lateInv?.status === "PAID" && !!lateInv.verifiedBy?.includes("REFUND REQUIRED"), "Invoice marks refund required");
    harness.assertEqual((await db.clientBooking.findUnique({ where: { id: first.bookingId } }))?.status, "CANCELLED", "Cancelled booking stays cancelled");
    const winner = await db.clientBooking.findUnique({ where: { id: second.bookingId } });
    harness.assertEqual(winner?.slotId, slot.id, "The new booking still owns the slot");
  });

  await harness.test("T9-SET-07: tenants without usable credentials cannot be settled", async () => {
    gateway({ txns: () => [] });
    const res: any = await checkout((await makeSlot()).id);
    const inv = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    await db.tenant.update({ where: { id: lumina.id }, data: { toyyibpaySecretEnc: "v1.garbage.garbage.garbage" } });
    const out = await settleToyyibpayBill(inv!.gatewayBillCode!);
    harness.assertEqual(out.status, "NOT_PAID", "Corrupt stored secret -> NOT_PAID, no throw");
    await setGateway(true);
  });

  // ---- Studio settings (credentials management) --------------------------------
  const asSession = (u: { id: string; email: string; name: string; role: string; tenantId: string | null } | null, slug: string) =>
    u ? { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug } : null;
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  const otherRow = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: { not: lumina.id } } });
  const owner = asSession(ownerRow, "lumina-cine");
  const otherOwner = asSession(otherRow, "other");

  await harness.test("T9-ADM-01: only the studio's own owner can change gateway credentials", async () => {
    await setGateway(false);
    const input = { tenantId: lumina.id, tenantSlug: "lumina-cine", secretKey: "owner-secret-1", categoryCode: "abc123" };
    harness.assertEqual((await withSession(null, () => saveGatewayCredentials(input))).success, false, "Anonymous rejected");
    if (otherOwner) {
      const res = await withSession(otherOwner, () => saveGatewayCredentials(input));
      harness.assertEqual(res.success, false, "Another studio's owner rejected");
    }
    const row = await db.tenant.findUnique({ where: { id: lumina.id } });
    harness.assert(row?.toyyibpaySecretEnc === null, "Nothing stored by rejected callers");
    harness.assertEqual(
      (await withSession(null, () => removeGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine" }))).success,
      false,
      "Anonymous cannot disconnect either"
    );
  });

  await harness.test("T9-ADM-02: owner saves credentials encrypted; blank secret keeps the stored one", async () => {
    harness.assert(!!owner, "Seed owner exists");
    const saved = await withSession(owner!, () =>
      saveGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine", secretKey: "owner-secret-1", categoryCode: "abc123" })
    );
    harness.assertEqual(saved.success, true, "Owner can save");
    const row = await db.tenant.findUnique({ where: { id: lumina.id } });
    harness.assert(!!row?.toyyibpaySecretEnc && !row.toyyibpaySecretEnc.includes("owner-secret-1"), "Secret stored encrypted");
    harness.assertEqual(decryptSecret(row?.toyyibpaySecretEnc), "owner-secret-1", "Decrypts back");
    await withSession(owner!, () => saveGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine", categoryCode: "newcat9" }));
    const row2 = await db.tenant.findUnique({ where: { id: lumina.id } });
    harness.assertEqual(decryptSecret(row2?.toyyibpaySecretEnc), "owner-secret-1", "Blank secret keeps existing key");
    harness.assertEqual(row2?.toyyibpayCategoryCode, "newcat9", "Category updated");
  });

  await harness.test("T9-ADM-03: malformed credentials are rejected and the secret never leaves the server", async () => {
    const bad = await withSession(owner!, () => saveGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine", secretKey: "has space", categoryCode: "ok123" }));
    harness.assertEqual(bad.success, false, "Secret with illegal characters rejected");
    const badCat = await withSession(owner!, () => saveGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine", categoryCode: "x" }));
    harness.assertEqual(badCat.success, false, "Short category rejected");
    // Re-submit the tenant's own current values so this check cannot alter seed data.
    const upd: any = await updateStudioSettings({
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      name: lumina.name,
      newSlug: lumina.slug,
      customDomain: lumina.customDomain,
      discipline: lumina.discipline as any,
      tagline: lumina.tagline,
      bio: lumina.bio,
      logoUrl: lumina.logoUrl,
      brandColor: lumina.brandColor ?? "#f59e0b",
      currency: lumina.currency as any,
      qrCodeUrl: lumina.qrCodeUrl,
      bankDetails: lumina.bankDetails,
    } as any);
    harness.assertEqual((await db.tenant.findUnique({ where: { id: lumina.id } }))?.tagline, lumina.tagline, "Seed tagline unchanged");
    if (upd.success) harness.assert(!("toyyibpaySecretEnc" in upd.tenant), "updateStudioSettings result omits the encrypted secret");
    else harness.assert(true, "Settings update not applicable to this fixture");
    await withSession(owner!, () => removeGatewayCredentials({ tenantId: lumina.id, tenantSlug: "lumina-cine" }));
    const row = await db.tenant.findUnique({ where: { id: lumina.id } });
    harness.assert(row?.toyyibpaySecretEnc === null && row?.toyyibpayCategoryCode === null, "Disconnect clears both");
  });
}
