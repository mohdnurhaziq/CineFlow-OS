import { errorMessageOf } from "./action-error";
import { deliverViaSmtp, smtpConfigFromEnv } from "./email/smtp";
import type { CalendarInvite } from "./calendar/ics";
import { formatMoney } from "@/lib/money";
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
  | "PASSWORD_RESET"
  | "TEAM_INVITE"
  | "ONE_LOGIN_CONFIRM"
  | "STUDIO_WELCOME"
  | "STUDIO_INVITE"
  | "SHOOT_ASSIGNED"
  | "SHOOT_CHANGED";

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
  /** How the unpaid deposit is to be paid (QR_CODE, CASH): the email says what to do next. */
  depositMethod?: string | null;
  /** The session as a calendar invite (confirmed bookings only). */
  calendar?: CalendarInvite;
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
  /** A calendar update (moved) or cancellation for the session. */
  calendar?: CalendarInvite;
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

/** "Use one sign-in for all your studios": a one-time link that proves the email. Email only, never logged. */
export interface OneLoginConfirmPayload {
  event: "ONE_LOGIN_CONFIRM";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  confirmUrl: string;
  expiresMinutes: number;
}

/** To a new studio owner. With confirmUrl it carries a one-time link (a credential: email only, never logged). */
export interface StudioWelcomePayload {
  event: "STUDIO_WELCOME";
  studioName: string;
  studioSlug: string;
  /** The owner. */
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  adminUrl: string;
  bookingUrl: string;
  trialEndsOn: string;
  /** Only for an email that isn't proven yet. */
  confirmUrl?: string;
  confirmExpiresMinutes: number;
}

/** A super-admin approved an invite request: a personal sign-up link (a credential: email only, never logged). */
export interface StudioInvitePayload {
  event: "STUDIO_INVITE";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  /** The studio name they asked about. */
  requestedStudio: string;
  inviteUrl: string;
  expiresOn: string;
}

/** A studio added someone to its team: a set-password link (a credential: email only, never logged). */
export interface TeamInvitePayload {
  event: "TEAM_INVITE";
  studioName: string;
  studioSlug: string;
  /** The person invited. */
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  ownerName: string;
  roleName: string;
  inviteUrl: string;
  expiresDays: number;
}

/** A team member was put on a shoot. clientName/clientEmail are the team member (the recipient). */
export interface ShootAssignedPayload {
  event: "SHOOT_ASSIGNED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  assignerName: string;
  /** The studio's client whose session it is. */
  shootClientName: string;
  date: string;
  startTime: string;
  endTime: string;
  packageName?: string;
  brief?: string;
  scheduleUrl: string;
  /** The shoot as a calendar invite (confirmed bookings only). */
  calendar?: CalendarInvite;
}

/** A shoot the recipient is on moved, was cancelled, or they were taken off it. */
export interface ShootChangedPayload {
  event: "SHOOT_CHANGED";
  studioName: string;
  studioSlug: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: undefined;
  kind: "CONFIRMED" | "MOVED" | "CANCELLED" | "UNASSIGNED";
  shootClientName: string;
  /** The plain sentence with the details. */
  message: string;
  /** Their schedule in the admin. Left out for someone no longer on the team (they can't open it). */
  scheduleUrl?: string;
  /** A calendar update or cancellation for the shoot. */
  calendar?: CalendarInvite;
}

export type NotificationPayload =
  | BookingConfirmedPayload
  | PaymentApprovedPayload
  | PaymentRejectedPayload
  | ProposalSignedPayload
  | VaultUnlockedPayload
  | PhotosReadyPayload
  | StudioUpdatePayload
  | PasswordResetPayload
  | OneLoginConfirmPayload
  | StudioInvitePayload
  | StudioWelcomePayload
  | TeamInvitePayload
  | ShootAssignedPayload
  | ShootChangedPayload;

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
  /** The calendar invite that went with the email, if any. */
  calendar?: CalendarInvite;
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

/** How the kept log names an email whose body it must not keep. */
const REDACTED_AS: Partial<Record<string, string>> = {
  TEAM_INVITE: "team invite",
  ONE_LOGIN_CONFIRM: "one sign-in link",
  STUDIO_WELCOME: "studio welcome",
  STUDIO_INVITE: "studio invite",
};

/** Resend's sender when RESEND_FROM_EMAIL isn't set. */
const DEFAULT_RESEND_FROM = "CineFlow OS <onboarding@resend.dev>";

/** The address emails are sent from, used as a calendar invite's organiser so the two always match:
 * the SMTP sender, else Resend's (RESEND_FROM_EMAIL, or its default), else the platform's own. */
export function platformSenderAddress(): string {
  const smtp = smtpConfigFromEnv();
  if (smtp) return smtp.fromAddress;
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_RESEND_FROM;
  const address = (from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? from).trim();
  return /^[^\s@<>]+@[^\s@<>]+$/.test(address) ? address : "noreply@cineflow-os.my";
}

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
  /** Sent as the email's calendar invite (Gmail adds it to Google Calendar). */
  calendar?: CalendarInvite;
}): Promise<{ delivery: "SENT" | "SKIPPED" | "FAILED"; error?: string; calendarDropped?: boolean }> {
  const smtp = smtpConfigFromEnv();
  if (smtp) return deliverViaSmtp(smtp, input);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { delivery: "SKIPPED" };

  const first = await deliverViaResend(apiKey, input);
  // An invite must never cost the email itself: if Resend refuses the message as sent, send it without.
  if (first.delivery === "FAILED" && input.calendar && (first.status === 400 || first.status === 422)) {
    const retry = await deliverViaResend(apiKey, { ...input, calendar: undefined });
    return { delivery: retry.delivery, error: retry.error, calendarDropped: true };
  }
  return { delivery: first.delivery, error: first.error };
}

async function deliverViaResend(
  apiKey: string,
  input: { to: string; subject: string; html: string; text: string; calendar?: CalendarInvite }
): Promise<{ delivery: "SENT" | "FAILED"; error?: string; status?: number }> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_RESEND_FROM,
        to: [input.to],
        // Strip line breaks so a hostile name can never inject extra header lines.
        subject: input.subject.replace(/[\r\n]+/g, " ").trim(),
        html: input.html,
        text: input.text,
        ...(input.calendar
          ? {
              attachments: [
                {
                  filename: "invite.ics",
                  content: Buffer.from(input.calendar.ics, "utf8").toString("base64"),
                  content_type: `text/calendar; method=${input.calendar.method}; charset=UTF-8`,
                },
              ],
            }
          : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`Resend rejected email (${res.status}): ${detail}`);
      return { delivery: "FAILED", error: resendRefusalReason(res.status, detail), status: res.status };
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
                    <span style="font-size: 11px; color: #a1a1aa; font-family: monospace;">CINEFLOW OS</span>
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
            <td style="padding: 24px 32px; border-top: 1px solid #27272a; background-color: #0d0d10; font-size: 12px; color: #a1a1aa; text-align: center;">
              <p style="margin: 0 0 6px 0;">This transmission was dispatched securely via <strong>${esc(studioName)}</strong> powered by CineFlow OS.</p>
              <p style="margin: 0; font-size: 11px; color: #a1a1aa;">Automated transactional notice • No reply required</p>
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
      // Not confirmed until the deposit is paid: say "received", and what to do next.
      const unpaid = payload.depositPaid === false;
      const depositLabel = unpaid ? "Deposit due" : "Deposit paid";
      const depositColor = unpaid ? "#f59e0b" : "#10b981";
      const nextStep = !unpaid
        ? ""
        : payload.depositMethod === "QR_CODE"
        ? "Transfer the deposit and upload your payment slip within 24 hours, or the slot is released."
        : payload.depositMethod === "CASH"
        ? "Pay the deposit at the studio within 24 hours, or the slot is released."
        : "Pay the deposit to confirm your booking.";
      emailSubject = unpaid
        ? `Booking received: please pay your deposit (${payload.studioName})`
        : `Booking confirmed with ${payload.studioName}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>${unpaid ? `We&apos;ve received your booking. It&apos;s confirmed once your deposit is paid. ${esc(nextStep)}` : "Your booking is confirmed."}</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            ${payload.trackingCode ? `<tr><td style="color: #a1a1aa; padding: 4px 0;">Booking Ref:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${esc(payload.trackingCode)}</td></tr>` : ""}
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Package:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.packageName)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Date:</td><td style="color: #ffffff; text-align: right;">${esc(payload.slotDate)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Time Window:</td><td style="color: #ffffff; text-align: right;">${esc(payload.startTime)} - ${esc(payload.endTime)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">${depositLabel}:</td><td style="color: ${depositColor}; font-weight: bold; text-align: right;">${esc(formatMoney(payload.currency, payload.depositAmount))}</td></tr>
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
        <p>The studio will be in touch with the details for your session.</p>
      `;
      emailText = `${unpaid ? `Booking received by ${payload.studioName}. It's confirmed once your deposit is paid. ${nextStep}` : `Booking confirmed with ${payload.studioName}!`}\n\nPackage: ${payload.packageName}\nDate: ${payload.slotDate} (${payload.startTime} - ${payload.endTime})\n${depositLabel}: ${formatMoney(payload.currency, payload.depositAmount)}${payload.trackingCode ? `\nBooking Ref: ${payload.trackingCode}` : ""}${payload.bookingUrl ? `\n${payload.bookingLinkLabel || "View my booking"}: ${payload.bookingUrl}` : ""}`;
      whatsappText = `*${payload.studioName} — ${unpaid ? "Booking received" : "Booking confirmed!"}*\n\nHi ${payload.clientName}, your shoot for *${payload.packageName}* on *${payload.slotDate}* (${payload.startTime} - ${payload.endTime}) is ${unpaid ? `booked. ${nextStep}` : "confirmed."}${payload.trackingCode ? ` Booking Ref: *${payload.trackingCode}*.` : ""} ${depositLabel}: ${formatMoney(payload.currency, payload.depositAmount)}.${payload.bookingUrl ? `\n\n📅 ${payload.bookingLinkLabel || "View my booking"}: ${payload.bookingUrl}` : ""}`;
      break;
    }

    case "PAYMENT_APPROVED": {
      const receiptLink = payload.receiptUrl;
      emailSubject = `Payment Verified: Invoice #${payload.invoiceNumber} (${formatMoney(payload.currency, payload.amount)})`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Your recent payment proof for invoice <strong>${esc(payload.invoiceNumber)}</strong> has been audited and verified by our accounting team.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Invoice #:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.invoiceNumber)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Project:</td><td style="color: #ffffff; text-align: right;">${esc(payload.projectTitle)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Milestone:</td><td style="color: #ffffff; text-align: right;">${esc(payload.milestoneType.replace(/_/g, " "))}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Amount Settled:</td><td style="color: #10b981; font-weight: bold; text-align: right;">${esc(formatMoney(payload.currency, payload.amount))}</td></tr>
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
      emailText = `Payment Verified for ${payload.invoiceNumber}: ${formatMoney(payload.currency, payload.amount)} for ${payload.projectTitle}.${receiptLink ? ` View receipt: ${receiptLink}` : ""}`;
      whatsappText = `*${payload.studioName} — Payment Verified*\n\nHi ${payload.clientName}, your payment for Invoice *#${payload.invoiceNumber}* (${formatMoney(payload.currency, payload.amount)}) has been verified. Thank you!${receiptLink ? `\n\n📄 View Receipt: ${receiptLink}` : ""}`;
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
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Proposal Ref:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${esc(payload.proposalNumber)}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">Total Production:</td><td style="color: #ffffff; text-align: right;">${esc(formatMoney(payload.currency, payload.totalPrice))}</td></tr>
            <tr><td style="color: #a1a1aa; padding: 4px 0;">50% Retainer Due:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${esc(formatMoney(payload.currency, payload.depositRequired))}</td></tr>
          </table>
        </div>
        <p>Our production team has moved the project into Pre-Production.</p>
      `;
      emailText = `Proposal Signed for ${payload.projectTitle}. Total: ${formatMoney(payload.currency, payload.totalPrice)}`;
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
      const dueLabel = due ? `${formatMoney(due.currency, due.amount)}` : "";
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
    case "ONE_LOGIN_CONFIRM": {
      emailSubject = "Use one sign-in for all your CineFlow studios";
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>You asked to use one sign-in for every CineFlow studio you work with or book. Confirm your email and choose one password for all of them.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.confirmUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Confirm my email
          </a>
        </div>
        <p style="font-size: 12px; color: #a1a1aa;">This link works once and expires in ${esc(payload.expiresMinutes)} minutes. If you didn't ask for this, you can ignore this email: nothing changes.</p>
      `;
      emailText = `Confirm your email to use one sign-in for all your CineFlow studios: ${payload.confirmUrl} (works once, expires in ${payload.expiresMinutes} minutes). If you didn't ask for this, ignore this email.`;
      // Deliberately no WhatsApp text: this link is a credential.
      whatsappText = "";
      break;
    }
    case "STUDIO_WELCOME": {
      emailSubject = `${payload.studioName} is ready on CineFlow OS`;
      const button = (url: string, label: string) =>
        `<div style="text-align: center; margin: 24px 0;"><a href="${esc(url)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">${label}</a></div>`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Your studio <strong>${esc(payload.studioName)}</strong> is ready. Your free trial runs until <strong>${esc(payload.trialEndsOn)}</strong>.</p>
        ${button(payload.adminUrl, "Open my studio admin")}
        <p>Your booking page, to share with clients once your packages and times are set up:<br><a href="${esc(payload.bookingUrl)}" style="color: #f59e0b;">${esc(payload.bookingUrl)}</a></p>
        ${
          payload.confirmUrl
            ? `<p>Please also confirm this is your email. It lets you use one sign-in for every CineFlow studio you work with or book. The link asks you to set the password for that sign-in; it can be the same one you just chose.</p>
        ${button(payload.confirmUrl, "Confirm my email")}
        <p style="font-size: 12px; color: #a1a1aa;">The confirm link works once and expires in ${esc(payload.confirmExpiresMinutes)} minutes. You can ask for a new one from your studio's Overview page.</p>`
            : ""
        }
        <p style="font-size: 12px; color: #a1a1aa;">If you didn't create this studio, don't open the links. You can ignore this email.</p>
      `;
      emailText = `Your studio ${payload.studioName} is ready. Free trial until ${payload.trialEndsOn}.\nStudio admin: ${payload.adminUrl}\nBooking page: ${payload.bookingUrl}${payload.confirmUrl ? `\nConfirm your email (works once, expires in ${payload.confirmExpiresMinutes} minutes): ${payload.confirmUrl}` : ""}\nIf you didn't create this studio, ignore this email.`;
      // Deliberately no WhatsApp text: it can carry a one-time link.
      whatsappText = "";
      break;
    }
    case "STUDIO_INVITE": {
      emailSubject = "You're approved: create your studio on CineFlow OS";
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>Your invite request for <strong>${esc(payload.requestedStudio)}</strong> is approved. Create your studio and start your free trial.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.inviteUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Create your studio
          </a>
        </div>
        <p style="font-size: 12px; color: #a1a1aa;">This link is just for you: it works once, only with this email address, and expires on ${esc(payload.expiresOn)}. Please don't forward it. If you didn't ask for an invite, you can ignore this email.</p>
      `;
      emailText = `Your invite request for ${payload.requestedStudio} is approved. Create your studio: ${payload.inviteUrl} (just for you: works once, only with this email address, expires on ${payload.expiresOn}; please don't forward it). If you didn't ask for an invite, ignore this email.`;
      // Deliberately no WhatsApp text: this link is a credential.
      whatsappText = "";
      break;
    }
    case "TEAM_INVITE": {
      emailSubject = `You're invited to join ${payload.studioName} on CineFlow`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>${esc(payload.ownerName)} added you to the <strong>${esc(payload.studioName)}</strong> team as <strong>${esc(payload.roleName)}</strong>. Set your password to sign in.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.inviteUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Set my password
          </a>
        </div>
        <p style="font-size: 12px; color: #a1a1aa;">This link works for ${esc(payload.expiresDays)} days.</p>
      `;
      emailText = `${payload.ownerName} added you to the ${payload.studioName} team as ${payload.roleName}. Set your password to sign in: ${payload.inviteUrl} (This link works for ${payload.expiresDays} days.)`;
      // No WhatsApp text: the studio copies the link from the Team screen if it wants to share it.
      whatsappText = "";
      break;
    }
    case "SHOOT_ASSIGNED": {
      emailSubject = `New shoot: ${payload.date} at ${payload.startTime}`;
      const intro = `${payload.assignerName} assigned you to ${payload.shootClientName}'s session on ${payload.date}, ${payload.startTime}–${payload.endTime}.`;
      const extra = [payload.packageName ? `Package: ${payload.packageName}` : "", payload.brief ? `Brief: ${payload.brief}` : ""].filter(Boolean);
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>${esc(intro)}</p>
        ${extra.map((line) => `<p>${esc(line)}</p>`).join("")}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.scheduleUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Open my schedule
          </a>
        </div>
      `;
      emailText = [intro, ...extra, `Open my schedule: ${payload.scheduleUrl}`].join("\n");
      whatsappText = "";
      break;
    }
    case "SHOOT_CHANGED": {
      emailSubject =
        payload.kind === "CONFIRMED"
          ? `Shoot confirmed: ${payload.shootClientName}`
          : payload.kind === "MOVED"
          ? `Shoot moved: ${payload.shootClientName}`
          : payload.kind === "CANCELLED"
            ? `Shoot cancelled: ${payload.shootClientName}`
            : `Removed from a shoot: ${payload.shootClientName}`;
      bodyHtml = `
        <p>Hi <strong>${esc(payload.clientName)}</strong>,</p>
        <p>${esc(payload.message)}</p>
        ${
          payload.scheduleUrl
            ? `<div style="text-align: center; margin: 30px 0;">
          <a href="${esc(payload.scheduleUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Open my schedule
          </a>
        </div>`
            : ""
        }
      `;
      emailText = payload.scheduleUrl ? `${payload.message} Open my schedule: ${payload.scheduleUrl}` : payload.message;
      whatsappText = "";
      break;
    }
  }

  const calendar = "calendar" in payload ? payload.calendar : undefined;
  // Some mail apps (Outlook among them) show an invite sent by Resend as a plain file: say how to add
  // it. Only in the first invite (confirmed, or put on a shoot): a copy added from the link is a
  // separate event that later moves and cancellations can't update, so they never offer it again.
  const firstInvite =
    payload.event === "BOOKING_CONFIRMED" ||
    payload.event === "SHOOT_ASSIGNED" ||
    (payload.event === "SHOOT_CHANGED" && payload.kind === "CONFIRMED");
  if (calendar?.googleUrl && firstInvite) {
    bodyHtml += `
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 24px;">
          Not in your calendar yet? <a href="${esc(calendar.googleUrl)}" style="color: #f59e0b;">Add it to Google Calendar</a>,
          or open the attached <strong>invite.ics</strong> (Outlook, Apple Calendar).
          A copy added from the link won&apos;t update by itself; we&apos;ll email you if anything changes.
        </p>`;
    emailText += `\n\nNot in your calendar yet? Add it to Google Calendar: ${calendar.googleUrl} or open the attached invite.ics (Outlook, Apple Calendar). A copy added from the link won't update by itself; we'll email you if anything changes.`;
  }

  const senderName = payload.event === "STUDIO_WELCOME" ? "CineFlow OS" : payload.studioName;
  const emailHtml = wrapEmailTemplate(senderName, emailSubject, bodyHtml);
  let whatsappUrl: string | undefined;

  if (recipientPhone && (channel === "WHATSAPP" || channel === "BOTH")) {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, "");
    whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;
  }

  const wantsEmail = channel === "EMAIL" || channel === "BOTH";
  const delivery =
    wantsEmail && recipientEmail
      ? await deliverEmail({ to: recipientEmail, subject: emailSubject, html: emailHtml, text: emailText, fromName: senderName, calendar })
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
    ...(calendar && delivery.delivery !== "SKIPPED" && !("calendarDropped" in delivery && delivery.calendarDropped) ? { calendar } : {}),
  };

  // The log keeps recent sends for auditing; reset and invite links are credentials, so never keep them.
  notificationLog.push(
    payload.event === "PASSWORD_RESET" || payload.event === "TEAM_INVITE" || payload.event === "ONE_LOGIN_CONFIRM" || payload.event === "STUDIO_WELCOME" || payload.event === "STUDIO_INVITE"
      ? {
          ...result,
          emailHtml: `[redacted: ${REDACTED_AS[payload.event] ?? "password reset"}]`,
          emailText: `[redacted: ${REDACTED_AS[payload.event] ?? "password reset"}]`,
          whatsappMessage: undefined,
        }
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

/**
 * An email from the platform itself to its operator (the super-admin), such as a failed-backup
 * alert. Not a studio notification: not logged with them, and signed "CineFlow OS".
 * `bodyHtml` must already be escaped. Never throws.
 */
export async function sendPlatformEmail(input: {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
  text: string;
}): Promise<{ delivery: "SENT" | "SKIPPED" | "FAILED"; error?: string }> {
  return deliverEmail({
    to: input.to,
    subject: input.subject,
    html: wrapEmailTemplate("CineFlow OS", input.title, input.bodyHtml),
    text: input.text,
    fromName: "CineFlow OS",
  });
}

/** Escapes text for email HTML (for callers building `sendPlatformEmail` bodies). */
export function escapeEmailHtml(value: unknown): string {
  return esc(value);
}
