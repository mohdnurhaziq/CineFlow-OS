import { errorMessageOf } from "./action-error";
import { deliverViaSmtp, smtpConfigFromEnv } from "./email/smtp";
/**
 * CineFlow OS Multi-Channel Transactional Notification Engine
 * Supports Responsive HTML Email and WhatsApp Dispatch
 */

export type NotificationChannel = "EMAIL" | "WHATSAPP" | "BOTH";

export type NotificationEvent =
  | "BOOKING_CONFIRMED"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "PROPOSAL_SIGNED"
  | "VAULT_UNLOCKED"
  | "PHOTOS_READY"
  | "STUDIO_UPDATE"
  | "PASSWORD_RESET";

export interface BookingConfirmedPayload {
  event: "BOOKING_CONFIRMED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  packageName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  depositAmount: number;
  currency: string;
  trackingCode?: string;
  bookingUrl?: string;
  /** False while the deposit still awaits payment or verification: the email then says "Deposit due". */
  depositPaid?: boolean;
  /** Button text for bookingUrl, e.g. "Set your password & view booking" for a new account. */
  bookingLinkLabel?: string;
}

export interface PaymentApprovedPayload {
  event: "PAYMENT_APPROVED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  milestoneType: string;
  projectTitle: string;
  projectId?: string;
  invoiceId?: string;
  receiptUrl?: string;
}

export interface PaymentRejectedPayload {
  event: "PAYMENT_REJECTED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  reason: string;
  reuploadUrl: string;
}

export interface ProposalSignedPayload {
  event: "PROPOSAL_SIGNED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  proposalNumber: string;
  projectTitle: string;
  totalPrice: number;
  depositRequired: number;
  currency: string;
}

export interface VaultUnlockedPayload {
  event: "VAULT_UNLOCKED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  projectTitle: string;
  vaultUrl: string;
}

/**
 * The studio has finished editing and uploaded the photos/videos. Sent when staff press
 * "Notify client" on the project, not on each upload (a shoot often goes up in batches).
 */
export interface PhotosReadyPayload {
  event: "PHOTOS_READY";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  projectTitle: string;
  vaultUrl: string;
  photoCount: number;
  videoCount: number;
  /** True when full-resolution downloads are open now: balance paid, or the studio releases files before payment. */
  unlocked: boolean;
  /** The balance still due and where to pay it, when an unpaid balance invoice exists. */
  balanceDue?: { amount: number; currency: string; payUrl: string };
}

/** A plain message from the studio: a booking moved, cancelled or delivered, an invoice reminder. */
export interface StudioUpdatePayload {
  event: "STUDIO_UPDATE";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  /** Short headline, e.g. "Your booking was moved". */
  headline: string;
  /** One or two plain sentences with the details. */
  message: string;
  /** Optional button: where to go next (account page, gallery). */
  linkUrl?: string;
  linkLabel?: string;
}

/** A one-time "reset your password" link. Email only: never put the link in a WhatsApp share. */
export interface PasswordResetPayload {
  event: "PASSWORD_RESET";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  resetUrl: string;
  expiresMinutes: number;
}

export type NotificationPayload =
  | BookingConfirmedPayload
  | PaymentApprovedPayload
  | PaymentRejectedPayload
  | ProposalSignedPayload
  | VaultUnlockedPayload
  | PhotosReadyPayload
  | StudioUpdatePayload
  | PasswordResetPayload;

export interface NotificationResult {
  id: string;
  event: NotificationEvent;
  recipientEmail: string;
  recipientPhone?: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
  whatsappMessage?: string;
  whatsappUrl?: string;
  timestamp: string;
  success: boolean;
  /** SENT: accepted by the provider (SMTP or Resend). SKIPPED: no email requested or no provider configured. FAILED: provider/network error. */
  emailDelivery: "SENT" | "SKIPPED" | "FAILED";
  emailError?: string;
}

// In-memory audit trail for notifications
// Bounded, so a long-running server does not keep every email it ever sent in memory.
const NOTIFICATION_LOG_LIMIT = 200;
const notificationLog: NotificationResult[] = [];

/** Escapes untrusted text (client names, reviewer notes, ...) for safe use inside email HTML. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8000;

/**
 * Resend's refusals in words a studio owner can act on (shown when staff resend an email),
 * ending with the HTTP status for debugging.
 */
function resendRefusalReason(status: number, detail: string): string {
  let reason = "Resend refused the email.";
  if (/testing emails|verify a domain/i.test(detail)) {
    reason =
      "Resend only delivers to your own address until you verify your domain at resend.com/domains, then set RESEND_FROM_EMAIL to an address on it.";
  } else if (/not verified/i.test(detail)) {
    reason = "The sender address in RESEND_FROM_EMAIL is on a domain Resend hasn't verified yet. Verify it at resend.com/domains.";
  } else if (status === 401 || /invalid api key|api key is invalid/i.test(detail)) {
    reason = "Resend rejected the API key. Check RESEND_API_KEY.";
  } else if (status === 429) {
    reason = "Resend's sending limit was reached. Try again in a minute.";
  }
  return `${reason} (HTTP ${status})`;
}

/**
 * Sends one email: over SMTP when SMTP_HOST is set (e.g. Gmail, or Mailpit in development),
 * otherwise through Resend's REST API when RESEND_API_KEY is set, otherwise skipped.
 * Never throws: the booking, payment and proposal flows that trigger notifications must
 * not fail because mail did.
 */
async function deliverEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Display name for the sender (the studio). Used for SMTP; Resend uses RESEND_FROM_EMAIL. */
  fromName?: string;
}): Promise<{ delivery: "SENT" | "SKIPPED" | "FAILED"; error?: string }> {
  const smtp = smtpConfigFromEnv();
  if (smtp) return deliverViaSmtp(smtp, input);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { delivery: "SKIPPED" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL?.trim() || "CineFlow OS <onboarding@resend.dev>",
        to: [input.to],
        // Strip line breaks so a hostile name can never inject extra header lines.
        subject: input.subject.replace(/[\r\n]+/g, " ").trim(),
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`Resend rejected email (${res.status}): ${detail}`);
      return { delivery: "FAILED", error: resendRefusalReason(res.status, detail) };
    }
    return { delivery: "SENT" };
  } catch (err) {
    console.error("Resend request failed:", errorMessageOf(err) || err);
    return { delivery: "FAILED", error: err instanceof Error && err.name === "TimeoutError" ? "Resend request timed out" : "Resend request failed" };
  }
}

/**
 * Generates an email wrapped in the Nocturne Cine dark HTML layout.
 */
function wrapEmailTemplate(studioName: string, title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #fafafa;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #121215; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header Brand Bar -->
          <tr>
            <td style="padding: 28px 32px; border-bottom: 1px solid #27272a; background-color: #18181c;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; background-color: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b; font-size: 11px; font-weight: bold; letter-spacing: 1px; font-family: monospace; text-transform: uppercase;">
                      ${esc(studioName)}
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; color: #71717a; font-family: monospace;">CINEFLOW OS</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin: 16px 0 0 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                ${esc(title)}
              </h1>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px; font-size: 14px; line-height: 1.6; color: #d4d4d8;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #27272a; background-color: #0d0d10; font-size: 12px; color: #71717a; text-align: center;">
              <p style="margin: 0 0 6px 0;">This transmission was dispatched securely via <strong>${esc(studioName)}</strong> powered by CineFlow OS.</p>
              <p style="margin: 0; font-size: 11px; color: #52525b;">Automated transactional notice • No reply required</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Dispatch transactional notifications across Email and WhatsApp.
 */
export async function sendNotification(
  payload: NotificationPayload,
  channel: NotificationChannel = "BOTH"
): Promise<NotificationResult> {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  let emailSubject = "";
  let bodyHtml = "";
  let emailText = "";
  let whatsappText = "";

  const recipientEmail = payload.clientEmail;
  const recipientPhone = payload.clientPhone;

  switch (payload.event) {
    case "BOOKING_CONFIRMED": {
      const depositLabel = payload.depositPaid === false ? "Deposit due" : "Deposit paid";
      const depositColor = payload.depositPaid === false ? "#f59e0b" : "#10b981";
      emailSubject = `Confirmed: Production Session with ${payload.studioName}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Your studio production booking has been locked into our schedule.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            ${payload.trackingCode ? `<tr><td style="color: #71717a; padding: 4px 0;">Booking Ref:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${esc(payload.trackingCode)}</td></tr>` : ""}
            <tr><td style="color: #71717a; padding: 4px 0;">Package:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.packageName)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Date:</td><td style="color: #ffffff; text-align: right;">${esc(payload.slotDate)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Time Window:</td><td style="color: #ffffff; text-align: right;">${esc(payload.startTime)} - ${esc(payload.endTime)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">${depositLabel}:</td><td style="color: ${depositColor}; font-weight: bold; text-align: right;">${esc(payload.currency)} ${esc(payload.depositAmount.toFixed(2))}</td></tr>
          </table>
        </div>
        ${
          payload.bookingUrl
            ? `<div style="text-align: center; margin: 24px 0 10px 0;">
          <a href="${esc(payload.bookingUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 13px;">
            ${esc(payload.bookingLinkLabel || "View my booking")}
          </a>
        </div>`
            : ""
        }
        <p>Our production team will contact you with call times, wardrobe guidelines, and location ephemeris.</p>
      `;
      emailText = `Booking Confirmed with ${payload.studioName}!\n\nPackage: ${payload.packageName}\nDate: ${payload.slotDate} (${payload.startTime} - ${payload.endTime})\n${depositLabel}: ${payload.currency} ${payload.depositAmount.toFixed(2)}${payload.trackingCode ? `\nBooking Ref: ${payload.trackingCode}` : ""}${payload.bookingUrl ? `\n${payload.bookingLinkLabel || "View my booking"}: ${payload.bookingUrl}` : ""}`;
      whatsappText = `*${payload.studioName} — Booking Confirmed!*\n\nHi ${payload.clientName}, your shoot for *${payload.packageName}* on *${payload.slotDate}* (${payload.startTime} - ${payload.endTime}) is confirmed.${payload.trackingCode ? ` Booking Ref: *${payload.trackingCode}*.` : ""} ${depositLabel}: ${payload.currency} ${payload.depositAmount.toFixed(2)}.${payload.bookingUrl ? `\n\n📅 ${payload.bookingLinkLabel || "View my booking"}: ${payload.bookingUrl}` : ""}`;
      break;
    }

    case "PAYMENT_APPROVED": {
      const receiptLink = payload.receiptUrl;
      emailSubject = `Payment Verified: Invoice #${payload.invoiceNumber} (${payload.currency} ${payload.amount.toFixed(2)})`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Your recent payment proof for invoice <strong>${esc(payload.invoiceNumber)}</strong> has been audited and verified by our accounting team.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #71717a; padding: 4px 0;">Invoice #:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.invoiceNumber)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Project:</td><td style="color: #ffffff; text-align: right;">${esc(payload.projectTitle)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Milestone:</td><td style="color: #ffffff; text-align: right;">${esc(payload.milestoneType.replace(/_/g, " "))}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Amount Settled:</td><td style="color: #10b981; font-weight: bold; text-align: right;">${esc(payload.currency)} ${esc(payload.amount.toFixed(2))}</td></tr>
          </table>
        </div>
        ${
          receiptLink
            ? `<div style="text-align: center; margin: 24px 0 10px 0;">
          <a href="${esc(receiptLink)}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 13px;">
            View Official Receipt
          </a>
        </div>`
            : ""
        }
        <p style="color: #10b981; font-weight: bold;">Status: 100% PAID & VERIFIED</p>
      `;
      emailText = `Payment Verified for ${payload.invoiceNumber}: ${payload.currency} ${payload.amount.toFixed(2)} for ${payload.projectTitle}.${receiptLink ? ` View receipt: ${receiptLink}` : ""}`;
      whatsappText = `*${payload.studioName} — Payment Verified*\n\nHi ${payload.clientName}, your payment for Invoice *#${payload.invoiceNumber}* (${payload.currency} ${payload.amount.toFixed(2)}) has been verified. Thank you!${receiptLink ? `\n\n📄 View Receipt: ${receiptLink}` : ""}`;
      break;
    }

    case "PAYMENT_REJECTED": {
      emailSubject = `Action Required: Payment Verification for #${payload.invoiceNumber}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>We encountered an issue verifying your payment submission for Invoice <strong>${esc(payload.invoiceNumber)}</strong>.</p>
        <div style="background-color: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0; color: #fb7185;">
          <strong>Reviewer Note:</strong> ${esc(payload.reason)}
        </div>
        <p>Please send a new payment slip within 24 hours. Your booking is held until then; after that the time slot is released.</p>
        ${
          payload.reuploadUrl
            ? `<div style="text-align: center; margin: 24px 0 10px 0;">
          <a href="${esc(payload.reuploadUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #f43f5e; color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 13px;">
            Upload New Payment Slip
          </a>
        </div>`
            : ""
        }
      `;
      emailText = `Payment verification issue for ${payload.invoiceNumber}. Reason: ${payload.reason}.${payload.reuploadUrl ? ` Send new slip: ${payload.reuploadUrl}` : ""}`;
      whatsappText = `*${payload.studioName} — Payment Verification Notice*\n\nHi ${payload.clientName}, we could not verify your receipt for #${payload.invoiceNumber}. Note: ${payload.reason}. Please send a new slip within 24 hours to keep your booking.${payload.reuploadUrl ? `\n\n🔗 Upload new slip: ${payload.reuploadUrl}` : ""}`;
      break;
    }

    case "PROPOSAL_SIGNED": {
      emailSubject = `Proposal Signed & Executed: ${payload.projectTitle}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Thank you for countersigning Proposal <strong>${esc(payload.proposalNumber)}</strong> for <strong>${esc(payload.projectTitle)}</strong>.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #71717a; padding: 4px 0;">Proposal Ref:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.proposalNumber)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Total Production:</td><td style="color: #ffffff; text-align: right;">${esc(payload.currency)} ${esc(payload.totalPrice.toFixed(2))}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">50% Retainer Due:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${esc(payload.currency)} ${esc(payload.depositRequired.toFixed(2))}</td></tr>
          </table>
        </div>
        <p>Our production team has moved the project into Pre-Production.</p>
      `;
      emailText = `Proposal Signed for ${payload.projectTitle}. Total: ${payload.currency} ${payload.totalPrice.toFixed(2)}`;
      whatsappText = `*${payload.studioName} — Contract Executed*\n\nHi ${payload.clientName}, Proposal *#${payload.proposalNumber}* is officially signed. Our directors are preparing your production call sheets.`;
      break;
    }

    case "VAULT_UNLOCKED": {
      emailSubject = `Masters Ready: ${payload.projectTitle} Delivery Vault Unlocked`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>The final balance for <strong>${esc(payload.projectTitle)}</strong> has been cleared. The 50% milestone paywall is officially removed!</p>
        <p>Your high-resolution master photographs, cinema video reels, and print-ready assets are available for uncompressed PKZIP download.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.vaultUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Open Delivery Vault & Download Masters
          </a>
        </div>
      `;
      emailText = `Your master media for ${payload.projectTitle} is unlocked! Access your vault: ${payload.vaultUrl}`;
      whatsappText = `*${payload.studioName} — Masters Unlocked!*\n\nHi ${payload.clientName}, your deliverables for *${payload.projectTitle}* are ready for full PKZIP download: ${payload.vaultUrl}`;
      break;
    }

    case "PHOTOS_READY": {
      const parts = [
        payload.photoCount ? `${payload.photoCount} photo${payload.photoCount === 1 ? "" : "s"}` : "",
        payload.videoCount ? `${payload.videoCount} video${payload.videoCount === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      const what = parts.join(" and ") || "your files";
      const due = payload.balanceDue;
      const dueLabel = due ? `${due.currency} ${due.amount.toFixed(2)}` : "";
      const nextStep = payload.unlocked
        ? `You can view and download the full-resolution files now.${due ? ` The remaining balance of ${dueLabel} is still due.` : ""}`
        : `You can view watermarked previews and pick your favourites now. Full-resolution downloads unlock once the remaining balance${due ? ` of ${dueLabel}` : ""} is paid.`;
      emailSubject = payload.unlocked
        ? `Your ${payload.projectTitle} files are ready to download`
        : `Your ${payload.projectTitle} photos are ready to view`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Good news: we've finished editing <strong>${esc(payload.projectTitle)}</strong> and uploaded ${esc(what)} to your gallery.</p>
        <p>${esc(nextStep)}</p>
        <div style="text-align: center; margin: 30px 0 12px 0;">
          <a href="${esc(payload.vaultUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            ${payload.unlocked ? "Open gallery & download" : "View my photos"}
          </a>
        </div>
        ${
          due
            ? `<div style="text-align: center; margin: 0 0 20px 0;">
          <a href="${esc(due.payUrl)}" style="color: #f59e0b; font-size: 13px;">Pay the balance (${esc(dueLabel)})</a>
        </div>`
            : ""
        }
      `;
      emailText = `Your ${payload.projectTitle} gallery is ready: ${what} uploaded. ${nextStep} View: ${payload.vaultUrl}${due ? ` Pay the balance: ${due.payUrl}` : ""}`;
      whatsappText = `*${payload.studioName} — Your photos are ready!*

Hi ${payload.clientName}, we've uploaded ${what} for *${payload.projectTitle}*. ${nextStep}

📸 ${payload.vaultUrl}${due ? `
💳 Pay balance: ${due.payUrl}` : ""}`;
      break;
    }

    case "STUDIO_UPDATE": {
      emailSubject = `${payload.studioName}: ${payload.headline}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>${esc(payload.message)}</p>
        ${
          payload.linkUrl
            ? `<div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.linkUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            ${esc(payload.linkLabel ?? "Open")}
          </a>
        </div>`
            : ""
        }
      `;
      emailText = `${payload.headline}. ${payload.message}${payload.linkUrl ? ` ${payload.linkUrl}` : ""}`;
      whatsappText = `*${payload.studioName} — ${payload.headline}*\n\nHi ${payload.clientName}, ${payload.message}${payload.linkUrl ? ` ${payload.linkUrl}` : ""}`;
      break;
    }
    case "PASSWORD_RESET": {
      emailSubject = `Reset your ${payload.studioName} password`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>We received a request to reset the password for your <strong>${esc(payload.studioName)}</strong> account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.resetUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Choose a new password
          </a>
        </div>
        <p style="font-size: 12px; color: #a1a1aa;">This link works once and expires in ${esc(payload.expiresMinutes)} minutes. If you didn't ask to reset your password, you can ignore this email: your password stays the same.</p>
      `;
      emailText = `Reset your ${payload.studioName} password: ${payload.resetUrl} (works once, expires in ${payload.expiresMinutes} minutes). If you didn't ask for this, ignore this email.`;
      // Deliberately no WhatsApp text: a reset link must not end up in a share link.
      whatsappText = "";
      break;
    }
  }

  const emailHtml = wrapEmailTemplate(payload.studioName, emailSubject, bodyHtml);
  let whatsappUrl: string | undefined;

  if (recipientPhone && (channel === "WHATSAPP" || channel === "BOTH")) {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, "");
    whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;
  }

  const wantsEmail = channel === "EMAIL" || channel === "BOTH";
  const delivery =
    wantsEmail && recipientEmail
      ? await deliverEmail({ to: recipientEmail, subject: emailSubject, html: emailHtml, text: emailText, fromName: payload.studioName })
      : { delivery: "SKIPPED" as const };

  const result: NotificationResult = {
    id,
    event: payload.event,
    recipientEmail,
    recipientPhone,
    emailSubject,
    emailHtml,
    emailText,
    whatsappMessage: whatsappText,
    whatsappUrl,
    timestamp,
    success: delivery.delivery !== "FAILED",
    emailDelivery: delivery.delivery,
    emailError: delivery.error,
  };

  // The log keeps recent sends for auditing; a reset link is a credential, so never keep it.
  notificationLog.push(
    payload.event === "PASSWORD_RESET"
      ? { ...result, emailHtml: "[redacted: password reset]", emailText: "[redacted: password reset]", whatsappMessage: undefined }
      : result
  );
  if (notificationLog.length > NOTIFICATION_LOG_LIMIT) notificationLog.splice(0, notificationLog.length - NOTIFICATION_LOG_LIMIT);
  return result;
}

/**
 * Retrieve recent notifications for auditing or preview.
 */
export function getNotificationHistory(limit = 20): NotificationResult[] {
  return notificationLog.slice(-limit);
}
