import nodemailer, { type Transporter } from "nodemailer";
import { errorMessageOf } from "@/lib/action-error";

/**
 * Email over SMTP (e.g. Gmail with an app password). Used instead of Resend when SMTP_HOST,
 * SMTP_USER and SMTP_PASS are set. Server-only; never throws (see deliverEmail).
 *
 * Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<you>@gmail.com,
 * SMTP_PASS=<16-character app password>. Gmail sends From your own address, so the studio
 * appears as the display name: "Haz Creatives Studio" <you@gmail.com>.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** Sender address; defaults to SMTP_USER (Gmail rewrites any other address to it anyway). */
  fromAddress: string;
}

/** SMTP settings from the environment, or null when SMTP is not configured. */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  // App passwords are shown in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
  const pass = env.SMTP_PASS?.replace(/\s+/g, "");
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT?.trim() || 465);
  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase();
  // Port 465 is TLS from the start; 587 upgrades with STARTTLS.
  const secure = secureSetting ? secureSetting === "true" : port === 465;
  const fromAddress = env.SMTP_FROM_ADDRESS?.trim() || user;
  return { host, port: Number.isFinite(port) ? port : 465, secure, user, pass, fromAddress };
}

/** `"Studio Name" <address>`, with quotes and line breaks stripped from the display name. */
export function formatFrom(displayName: string | undefined, address: string): string {
  const name = (displayName ?? "").replace(/["\\\r\n<>]+/g, " ").replace(/\s+/g, " ").trim();
  return name ? `"${name}" <${address}>` : address;
}

/** SMTP failures in words a studio owner can act on (shown when staff resend an email). */
export function smtpFailureReason(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; response?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : 0;
  const detail = `${typeof e.response === "string" ? e.response : ""} ${errorMessageOf(err) ?? ""}`;

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
    return "The email server rejected the login. For Gmail, SMTP_PASS must be an App Password (Google Account → Security → App passwords), not your normal password, and SMTP_USER must be that Gmail address.";
  }
  if (/daily user sending limit|sending limit exceeded|5\.4\.5/i.test(detail)) {
    return "Gmail's daily sending limit was reached. Emails will send again once it resets (about 24 hours).";
  }
  if (responseCode === 550 || responseCode === 553 || /recipient|mailbox unavailable|no such user/i.test(detail)) {
    return `The email server refused the recipient address. (SMTP ${responseCode || code})`;
  }
  if (["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ESOCKET", "EDNS", "ENOTFOUND"].includes(code)) {
    return "Couldn't reach the email server. Check SMTP_HOST and SMTP_PORT, and that this server can make outbound connections.";
  }
  return `The email server refused the email.${code || responseCode ? ` (SMTP ${responseCode || code})` : ""}`;
}

// One transporter per configuration, reused across emails.
let cached: { key: string; transporter: Transporter } | null = null;
let transportOverride: Transporter | null = null;

/** Test hook: route SMTP sends through `transporter` (e.g. nodemailer's jsonTransport), or null to reset. */
export function setSmtpTransportForTests(transporter: Transporter | null) {
  transportOverride = transporter;
}

function transporterFor(config: SmtpConfig): Transporter {
  if (transportOverride) return transportOverride;
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return cached.transporter;
}

export async function deliverViaSmtp(
  config: SmtpConfig,
  input: { to: string; subject: string; html: string; text: string; fromName?: string }
): Promise<{ delivery: "SENT" | "FAILED"; error?: string }> {
  try {
    await transporterFor(config).sendMail({
      from: formatFrom(input.fromName, config.fromAddress),
      to: input.to,
      // Strip line breaks so a hostile name can never inject extra header lines.
      subject: input.subject.replace(/[\r\n]+/g, " ").trim(),
      html: input.html,
      text: input.text,
    });
    return { delivery: "SENT" };
  } catch (err) {
    console.error("SMTP send failed:", errorMessageOf(err) || err);
    return { delivery: "FAILED", error: smtpFailureReason(err) };
  }
}
