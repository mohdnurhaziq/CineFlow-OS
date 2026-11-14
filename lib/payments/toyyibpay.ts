import { errorMessageOf } from "../action-error";
/**
 * Toyyibpay (Malaysian FPX / card gateway) client.
 * API reference: https://toyyibpay.com/apireference/
 *
 * Each studio uses its own Toyyibpay account (secret key + category code), so
 * money settles directly to the studio. Not a "use server" module.
 */

const TIMEOUT_MS = 10_000;

export function toyyibpayBaseUrl(): string {
  // Set TOYYIBPAY_BASE_URL=https://dev.toyyibpay.com to use the sandbox.
  return (process.env.TOYYIBPAY_BASE_URL?.trim() || "https://toyyibpay.com").replace(/\/+$/, "");
}

export interface ToyyibpayCredentials {
  secretKey: string;
  categoryCode: string;
}

export interface CreateBillInput {
  /** Our unique reference (the invoice number); echoed back as order_id on callbacks. */
  reference: string;
  name: string;
  description: string;
  /** Amount in MYR (ringgit), converted to sen for the API. */
  amountMyr: number;
  payer: { name: string; email: string; phone: string };
  returnUrl: string;
  callbackUrl: string;
  expiryMinutes?: number;
}

export type CreateBillResult = { ok: true; billCode: string; paymentUrl: string } | { ok: false; error: string };

/** Toyyibpay limits bill names/descriptions to alphanumerics, spaces and underscores. */
export function sanitizeBillText(value: string, max: number): string {
  return value.replace(/[^A-Za-z0-9 _]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "Payment";
}

/** Converts a ringgit amount to integer sen without float drift (e.g. 19.99 -> 1999). */
export function toSen(amountMyr: number): number {
  return Math.round((amountMyr + Number.EPSILON) * 100);
}

async function post(path: string, form: Record<string, string>): Promise<{ status: number; text: string }> {
  const res = await fetch(`${toyyibpayBaseUrl()}/index.php/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, text: await res.text() };
}

export async function createBill(creds: ToyyibpayCredentials, input: CreateBillInput): Promise<CreateBillResult> {
  const sen = toSen(input.amountMyr);
  if (!Number.isFinite(sen) || sen < 100) {
    return { ok: false, error: "Amount must be at least RM 1.00 for online payment." };
  }
  try {
    const { status, text } = await post("createBill", {
      userSecretKey: creds.secretKey,
      categoryCode: creds.categoryCode,
      billName: sanitizeBillText(input.name, 30),
      billDescription: sanitizeBillText(input.description, 100),
      billPriceSetting: "1",
      billPayorInfo: "1",
      billAmount: String(sen),
      billReturnUrl: input.returnUrl,
      billCallbackUrl: input.callbackUrl,
      billExternalReferenceNo: input.reference,
      billTo: input.payer.name.slice(0, 100),
      billEmail: input.payer.email,
      billPhone: input.payer.phone.replace(/[^0-9+]/g, ""),
      billSplitPayment: "0",
      billPaymentChannel: "2", // FPX + credit/debit card
      billExpiryDays: String(Math.max(1, Math.ceil((input.expiryMinutes ?? 24 * 60) / (24 * 60)))),
    });
    // The API answers 200 even on failure; success is [{"BillCode":"..."}].
    let billCode: string | undefined;
    try {
      const parsed = JSON.parse(text);
      billCode = Array.isArray(parsed) ? parsed[0]?.BillCode : undefined;
    } catch {
      // plain-text error codes like [KEY-DID-NOT-EXIST]
    }
    if (status !== 200 || !billCode || typeof billCode !== "string") {
      console.error(`Toyyibpay createBill failed (${status}): ${text.slice(0, 200)}`);
      return { ok: false, error: "The payment gateway rejected the request. Please check the studio's Toyyibpay settings." };
    }
    return { ok: true, billCode, paymentUrl: `${toyyibpayBaseUrl()}/${billCode}` };
  } catch (err) {
    console.error("Toyyibpay createBill request failed:", errorMessageOf(err) || err);
    return { ok: false, error: "Could not reach the payment gateway. Please try again." };
  }
}

export interface VerifiedPayment {
  /** Amount actually paid, in MYR. */
  amountMyr: number;
  invoiceNo: string | null;
  externalReference: string | null;
}

/**
 * Server-to-server check that a bill has a SUCCESSFUL payment. This (not the
 * browser redirect or the callback body) is the source of truth for settling.
 * Returns null when unpaid, unknown, or the gateway cannot be reached.
 */
export async function findSuccessfulPayment(creds: ToyyibpayCredentials, billCode: string): Promise<VerifiedPayment | null> {
  try {
    const { status, text } = await post("getBillTransactions", {
      billCode,
      userSecretKey: creds.secretKey,
      billpaymentStatus: "1",
    });
    if (status !== 200) return null;
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return null;
    const paid = rows.find((r) => String(r?.billpaymentStatus) === "1");
    if (!paid) return null;
    const cleaned = String(paid.billpaymentAmount ?? "").replace(/[^0-9.]/g, "");
    const amountMyr = cleaned === "" ? NaN : Number(cleaned);
    if (!Number.isFinite(amountMyr) || amountMyr <= 0) return null;
    return {
      amountMyr,
      invoiceNo: paid.billpaymentInvoiceNo ? String(paid.billpaymentInvoiceNo) : null,
      externalReference: paid.billExternalReferenceNo ? String(paid.billExternalReferenceNo) : null,
    };
  } catch (err) {
    console.error("Toyyibpay getBillTransactions failed:", errorMessageOf(err) || err);
    return null;
  }
}
