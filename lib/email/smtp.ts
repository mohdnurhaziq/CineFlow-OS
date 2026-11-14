import nodemailer, { type Transporter } from "nodemailer";
import { errorMessageOf } from "@/lib/action-error";

/**
 * Email over SMTP (e.g. Gmail with an app password, or Mailpit in development). Used instead
 * of Resend when SMTP_HOST is set. Server-only; never throws (see deliverEmail).
 *
 * Mailpit (development): SMTP_HOST=mailpit (or localhost outside Docker), SMTP_PORT=1025,
 * no SMTP_USER/SMTP_PASS. Mail is caught in the inbox at http://localhost:8025, never delivered.
 *
 * Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<you>@gmail.com,
 * SMTP_PASS=<16-character app password>. Gmail sends From your own address, so the studio
 * appears as the display name: "Haz Creatives Studio" <you@gmail.com>.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  /** Login; null for servers that take mail without one (e.g. Mailpit in development). */
  auth: { user: string; pass: string } | null;
  /** Sender address; defaults to SMTP_USER (Gmail rewrites any other address to it anyway). */
  fromAddress: string;
}

/** Sender used when the server needs no login and SMTP_FROM_ADDRESS is not set. */
export const DEFAULT_NO_AUTH_FROM = "noreply@cineflow.local";

/**
 * SMTP settings from the environment, or null when SMTP is not configured.
 *
 * Needs SMTP_HOST plus either both SMTP_USER and SMTP_PASS (Gmail, Brevo...) or neither (a
 * server without login, e.g. Mailpit). Exactly one of them set is treated as a mistake and
 * SMTP stays off, rather than silently trying to send without the intended login.
 */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const user = env.SMTP_USER?.trim() || "";
  // App passwords are shown in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
  const pass = env.SMTP_PASS?.replace(/\s+/g, "") || "";
  if (Boolean(user) !== Boolean(pass)) {
    console.error("SMTP is not configured: set both SMTP_USER and SMTP_PASS, or neither (for a server without login).");
    return null;
  }
  const portSetting = Number(env.SMTP_PORT?.trim() || 465);
  const port = Number.isFinite(portSetting) && portSetting > 0 ? portSetting : 465;
  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase();
  // Port 465 is TLS from the start; 587 upgrades with STARTTLS; 1025 (Mailpit) is plain.
  const secure = secureSetting ? secureSetting === "true" : port === 465;
  const fromAddress = env.SMTP_FROM_ADDRESS?.trim() || user || DEFAULT_NO_AUTH_FROM;
  return { host, port, secure, auth: user ? { user, pass } : null, fromAddress };
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
  const key = `${config.host}:${config.port}:${config.secure}:${config.auth?.user ?? ""}:${config.auth?.pass ?? ""}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.auth ? { auth: config.auth } : {}),
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
