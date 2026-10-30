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
  | "VAULT_UNLOCKED";

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

export type NotificationPayload =
  | BookingConfirmedPayload
  | PaymentApprovedPayload
  | PaymentRejectedPayload
  | ProposalSignedPayload
  | VaultUnlockedPayload;

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
}

// In-memory audit trail for notifications
const notificationLog: NotificationResult[] = [];

/**
 * Generates an email wrapped in the Nocturne Cine dark HTML layout.
 */
function wrapEmailTemplate(studioName: string, title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
                      ${studioName}
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; color: #71717a; font-family: monospace;">CINEFLOW OS</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin: 16px 0 0 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                ${title}
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
              <p style="margin: 0 0 6px 0;">This transmission was dispatched securely via <strong>${studioName}</strong> powered by CineFlow OS.</p>
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
      emailSubject = `Confirmed: Production Session with ${payload.studioName}`;
      bodyHtml = `
        <p>Hi <strong>${payload.clientName}</strong>,</p>
        <p>Your studio production booking has been locked into our schedule.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #71717a; padding: 4px 0;">Package:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${payload.packageName}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Date:</td><td style="color: #ffffff; text-align: right;">${payload.slotDate}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Time Window:</td><td style="color: #ffffff; text-align: right;">${payload.startTime} - ${payload.endTime}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Deposit Paid:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${payload.currency} ${payload.depositAmount.toFixed(2)}</td></tr>
          </table>
        </div>
        <p>Our production team will contact you with call times, wardrobe guidelines, and location ephemeris.</p>
      `;
      emailText = `Booking Confirmed with ${payload.studioName}!\n\nPackage: ${payload.packageName}\nDate: ${payload.slotDate} (${payload.startTime} - ${payload.endTime})\nDeposit: ${payload.currency} ${payload.depositAmount.toFixed(2)}`;
      whatsappText = `*${payload.studioName} — Booking Confirmed!*\n\nHi ${payload.clientName}, your shoot for *${payload.packageName}* on *${payload.slotDate}* (${payload.startTime} - ${payload.endTime}) is confirmed. Deposit paid: ${payload.currency} ${payload.depositAmount.toFixed(2)}.`;
      break;
    }

    case "PAYMENT_APPROVED": {
      emailSubject = `Payment Verified: Invoice #${payload.invoiceNumber} (${payload.currency} ${payload.amount.toFixed(2)})`;
      bodyHtml = `
        <p>Hi <strong>${payload.clientName}</strong>,</p>
        <p>Your recent payment proof for invoice <strong>${payload.invoiceNumber}</strong> has been audited and verified by our accounting team.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #71717a; padding: 4px 0;">Invoice #:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${payload.invoiceNumber}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Project:</td><td style="color: #ffffff; text-align: right;">${payload.projectTitle}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Milestone:</td><td style="color: #ffffff; text-align: right;">${payload.milestoneType.replace(/_/g, " ")}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Amount Settled:</td><td style="color: #10b981; font-weight: bold; text-align: right;">${payload.currency} ${payload.amount.toFixed(2)}</td></tr>
          </table>
        </div>
        <p style="color: #10b981; font-weight: bold;">Status: 100% PAID & VERIFIED</p>
      `;
      emailText = `Payment Verified for ${payload.invoiceNumber}: ${payload.currency} ${payload.amount.toFixed(2)} for ${payload.projectTitle}.`;
      whatsappText = `*${payload.studioName} — Payment Verified*\n\nHi ${payload.clientName}, your payment for Invoice *#${payload.invoiceNumber}* (${payload.currency} ${payload.amount.toFixed(2)}) has been verified. Thank you!`;
      break;
    }

    case "PAYMENT_REJECTED": {
      emailSubject = `Action Required: Payment Verification for #${payload.invoiceNumber}`;
      bodyHtml = `
        <p>Hi <strong>${payload.clientName}</strong>,</p>
        <p>We encountered an issue verifying your payment submission for Invoice <strong>${payload.invoiceNumber}</strong>.</p>
        <div style="background-color: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0; color: #fb7185;">
          <strong>Reviewer Note:</strong> ${payload.reason}
        </div>
        <p>Please submit an updated transaction receipt or payment slip to finalize verification.</p>
      `;
      emailText = `Payment verification issue for ${payload.invoiceNumber}. Reason: ${payload.reason}`;
      whatsappText = `*${payload.studioName} — Payment Verification Notice*\n\nHi ${payload.clientName}, we could not verify your receipt for #${payload.invoiceNumber}. Note: ${payload.reason}. Please re-submit proof.`;
      break;
    }

    case "PROPOSAL_SIGNED": {
      emailSubject = `Proposal Signed & Executed: ${payload.projectTitle}`;
      bodyHtml = `
        <p>Hi <strong>${payload.clientName}</strong>,</p>
        <p>Thank you for countersigning Proposal <strong>${payload.proposalNumber}</strong> for <strong>${payload.projectTitle}</strong>.</p>
        <div style="background-color: #18181c; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table width="100%" style="font-size: 13px; font-family: monospace;">
            <tr><td style="color: #71717a; padding: 4px 0;">Proposal Ref:</td><td style="color: #ffffff; font-weight: bold; text-align: right;">${payload.proposalNumber}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">Total Production:</td><td style="color: #ffffff; text-align: right;">${payload.currency} ${payload.totalPrice.toFixed(2)}</td></tr>
            <tr><td style="color: #71717a; padding: 4px 0;">50% Retainer Due:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">${payload.currency} ${payload.depositRequired.toFixed(2)}</td></tr>
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
        <p>Hi <strong>${payload.clientName}</strong>,</p>
        <p>The final balance for <strong>${payload.projectTitle}</strong> has been cleared. The 50% milestone paywall is officially removed!</p>
        <p>Your high-resolution master photographs, cinema video reels, and print-ready assets are available for uncompressed PKZIP download.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${payload.vaultUrl}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #000000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Open Delivery Vault & Download Masters
          </a>
        </div>
      `;
      emailText = `Your master media for ${payload.projectTitle} is unlocked! Access your vault: ${payload.vaultUrl}`;
      whatsappText = `*${payload.studioName} — Masters Unlocked!*\n\nHi ${payload.clientName}, your deliverables for *${payload.projectTitle}* are ready for full PKZIP download: ${payload.vaultUrl}`;
      break;
    }
  }

  const emailHtml = wrapEmailTemplate(payload.studioName, emailSubject, bodyHtml);
  let whatsappUrl: string | undefined;

  if (recipientPhone && (channel === "WHATSAPP" || channel === "BOTH")) {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, "");
    whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;
  }

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
    success: true,
  };

  notificationLog.push(result);
  return result;
}

/**
 * Retrieve recent notifications for auditing or preview.
 */
export function getNotificationHistory(limit = 20): NotificationResult[] {
  return notificationLog.slice(-limit);
}
